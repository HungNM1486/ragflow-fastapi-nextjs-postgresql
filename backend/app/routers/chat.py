import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Annotated, Any, AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import SessionLocal, get_db
from app.deps import get_current_user
from app.models import ChatMessage, Conversation, User
from app.ragflow_client import _headers, ragflow_create_session, ragflow_url

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])


class CreateSessionBody(BaseModel):
    name: str | None = Field(default=None, max_length=200)


class CreateSessionResponse(BaseModel):
    conversation_uid: str


class ConversationOut(BaseModel):
    uid: uuid.UUID
    title: str
    ragflow_chat_id: str
    created_at: datetime
    last_active_at: datetime

    model_config = {"from_attributes": True}


class ConversationPatchBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class ChatMessageOut(BaseModel):
    role: str
    content: str | None
    raw_payload: dict[str, Any] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CompletionBody(BaseModel):
    conversation_uid: str
    question: str = Field(..., min_length=1, max_length=32000)
    stream: bool = True


def _require_ragflow_config() -> None:
    if not settings.ragflow_api_key:
        raise HTTPException(
            status_code=503,
            detail="RAGFLOW_API_KEY chưa cấu hình (compose / docker/ragflow/upstream/.env).",
        )
    if not settings.ragflow_chat_id:
        raise HTTPException(
            status_code=503,
            detail="RAGFLOW_CHAT_ID chưa cấu hình — ID chat assistant trong RAGFlow.",
        )


@router.post("/chat/sessions", response_model=CreateSessionResponse)
async def create_session(
    body: CreateSessionBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CreateSessionResponse:
    _require_ragflow_config()
    uid = uuid.uuid4()
    name = (body.name or "Web").strip() or "Web"
    user_id = str(uid)
    async with httpx.AsyncClient() as client:
        try:
            data = await ragflow_create_session(
                client, name=name, user_id=user_id
            )
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=502,
                detail=f"RAGFlow HTTP {e.response.status_code}: {e.response.text[:800]}",
            ) from e
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=str(e)) from e
    session_id = data.get("id")
    if not session_id:
        raise HTTPException(status_code=502, detail="RAGFlow không trả session id")
    conv = Conversation(
        uid=uid,
        user_uid=user.uid,
        ragflow_session_id=session_id,
        ragflow_chat_id=settings.ragflow_chat_id,
        title=name,
    )
    db.add(conv)
    await db.commit()
    return CreateSessionResponse(conversation_uid=str(uid))


async def _get_conversation(
    db: AsyncSession, conversation_uid: str, user_uid: uuid.UUID
) -> Conversation:
    try:
        uid = uuid.UUID(conversation_uid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="conversation_uid không hợp lệ") from e
    res = await db.execute(
        select(Conversation).where(
            Conversation.uid == uid,
            Conversation.user_uid == user_uid,
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy conversation")
    return row


def _parse_sse_concat_answer(raw: bytes) -> tuple[str | None, dict[str, Any] | None]:
    """Ghép các delta `data.answer` từ RAGFlow và giữ event cuối có metadata."""
    text = raw.decode("utf-8", errors="replace")
    chunks: list[str] = []
    last_obj: dict[str, Any] | None = None
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload in ("", "[DONE]"):
            continue
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if not isinstance(obj, dict):
            continue
        data = obj.get("data")
        if not isinstance(data, dict) or "answer" not in data:
            continue
        ans = data.get("answer")
        if not isinstance(ans, str):
            continue
        if not ans and data.get("final") is True:
            last_obj = obj
            continue
        if ans:
            chunks.append(ans)
        last_obj = obj
    full = "".join(chunks)
    return (full if full else None), last_obj


@router.post("/chat/completions")
async def chat_completions(
    body: CompletionBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _require_ragflow_config()
    bench_t0 = time.perf_counter()
    conv = await _get_conversation(db, body.conversation_uid, user.uid)
    conv.last_active_at = datetime.now(timezone.utc)
    db.add(
        ChatMessage(
            conversation_uid=conv.uid,
            role="user",
            content=body.question,
            raw_payload=None,
        )
    )
    await db.commit()
    bench_prepare_ms = (time.perf_counter() - bench_t0) * 1000.0

    chat_id = settings.ragflow_chat_id
    url = ragflow_url(f"/api/v1/chats/{chat_id}/completions")
    payload: dict[str, Any] = {
        "question": body.question,
        "stream": body.stream,
        "session_id": conv.ragflow_session_id,
    }

    if body.stream:
        conv_uid = conv.uid

        async def passthrough() -> AsyncIterator[bytes]:
            buf = bytearray()
            t_ragflow_start = time.perf_counter()
            first_chunk_at: float | None = None
            async with httpx.AsyncClient() as client:
                try:
                    async with client.stream(
                        "POST",
                        url,
                        headers=_headers(),
                        json=payload,
                        timeout=httpx.Timeout(300.0, connect=30.0),
                    ) as resp:
                        if resp.status_code >= 400:
                            err = await resp.aread()
                            msg = err.decode("utf-8", errors="replace")[:2000]
                            yield (
                                "data:"
                                + json.dumps(
                                    {
                                        "code": resp.status_code,
                                        "message": msg,
                                        "data": {
                                            "answer": f"**Lỗi RAGFlow HTTP {resp.status_code}**: {msg}"
                                        },
                                    },
                                    ensure_ascii=False,
                                )
                                + "\n\n"
                            ).encode()
                            return
                        async for chunk in resp.aiter_bytes():
                            if first_chunk_at is None and chunk:
                                first_chunk_at = time.perf_counter()
                            buf.extend(chunk)
                            yield chunk
                except Exception as e:  # noqa: BLE001
                    yield (
                        "data:"
                        + json.dumps(
                            {
                                "code": 500,
                                "message": str(e),
                                "data": {"answer": f"**Lỗi proxy**: {e!s}"},
                            },
                            ensure_ascii=False,
                        )
                        + "\n\n"
                    ).encode()
                    return
            t_ragflow_body_end = time.perf_counter()
            ttfb_ms = (
                (first_chunk_at - t_ragflow_start) * 1000.0
                if first_chunk_at is not None
                else -1.0
            )
            read_after_first_ms = (
                (t_ragflow_body_end - first_chunk_at) * 1000.0
                if first_chunk_at is not None
                else (t_ragflow_body_end - t_ragflow_start) * 1000.0
            )
            ragflow_total_ms = (t_ragflow_body_end - t_ragflow_start) * 1000.0
            raw = bytes(buf)
            answer, last_obj = _parse_sse_concat_answer(raw)
            t_persist0 = time.perf_counter()
            async with SessionLocal() as persist_db:
                persist_db.add(
                    ChatMessage(
                        conversation_uid=conv_uid,
                        role="assistant",
                        content=answer,
                        raw_payload=last_obj,
                    )
                )
                await persist_db.commit()
            persist_ms = (time.perf_counter() - t_persist0) * 1000.0
            total_ms = (time.perf_counter() - bench_t0) * 1000.0
            logger.info(
                "chat_latency stream=1 prepare_ms=%.1f ragflow_ttfb_ms=%.1f ragflow_read_after_first_ms=%.1f "
                "ragflow_http_total_ms=%.1f persist_assistant_ms=%.1f total_proxy_ms=%.1f conv=%s",
                bench_prepare_ms,
                ttfb_ms,
                read_after_first_ms,
                ragflow_total_ms,
                persist_ms,
                total_ms,
                str(conv_uid),
            )

        return StreamingResponse(
            passthrough(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    t_rag0 = time.perf_counter()
    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                url,
                headers=_headers(),
                json=payload,
                timeout=httpx.Timeout(300.0, connect=30.0),
            )
            if r.status_code >= 400:
                raise HTTPException(
                    status_code=502,
                    detail=r.text[:4000],
                )
            try:
                rag_body = r.json()
            except json.JSONDecodeError as e:
                raise HTTPException(
                    status_code=502,
                    detail=f"RAGFlow trả không phải JSON: {e}",
                ) from e
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
    ragflow_http_ms = (time.perf_counter() - t_rag0) * 1000.0

    if not isinstance(rag_body, dict):
        raise HTTPException(status_code=502, detail="RAGFlow trả body không phải JSON object")
    if rag_body.get("code") != 0:
        raise HTTPException(
            status_code=502,
            detail=str(rag_body.get("message", rag_body))[:4000],
        )
    data = rag_body.get("data")
    answer: str | None = None
    last_obj: dict[str, Any] | None = None
    if isinstance(data, dict) and "answer" in data:
        answer = str(data["answer"])
        last_obj = rag_body
    t_persist0 = time.perf_counter()
    db.add(
        ChatMessage(
            conversation_uid=conv.uid,
            role="assistant",
            content=answer,
            raw_payload=last_obj,
        )
    )
    await db.commit()
    persist_ms = (time.perf_counter() - t_persist0) * 1000.0
    total_ms = (time.perf_counter() - bench_t0) * 1000.0
    logger.info(
        "chat_latency stream=0 prepare_ms=%.1f ragflow_http_ms=%.1f persist_assistant_ms=%.1f total_proxy_ms=%.1f conv=%s",
        bench_prepare_ms,
        ragflow_http_ms,
        persist_ms,
        total_ms,
        str(conv.uid),
    )
    return JSONResponse(
        {
            "conversation_uid": str(conv.uid),
            "answer": answer,
            "ragflow": last_obj,
        }
    )


@router.get("/chat/conversations", response_model=list[ConversationOut])
async def list_conversations(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[Conversation]:
    res = await db.execute(
        select(Conversation)
        .where(Conversation.user_uid == user.uid)
        .order_by(Conversation.last_active_at.desc(), Conversation.created_at.desc())
    )
    return list(res.scalars().all())


@router.get("/chat/conversations/{conversation_uid}/messages", response_model=list[ChatMessageOut])
async def list_conversation_messages(
    conversation_uid: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[ChatMessage]:
    conv = await _get_conversation(db, conversation_uid, user.uid)
    res = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_uid == conv.uid)
        .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
    )
    return list(res.scalars().all())


@router.patch("/chat/conversations/{conversation_uid}", response_model=ConversationOut)
async def patch_conversation(
    conversation_uid: str,
    body: ConversationPatchBody,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Conversation:
    conv = await _get_conversation(db, conversation_uid, user.uid)
    conv.title = body.title.strip() or conv.title
    await db.commit()
    await db.refresh(conv)
    return conv


@router.delete("/chat/conversations/{conversation_uid}")
async def delete_conversation(
    conversation_uid: str,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    conv = await _get_conversation(db, conversation_uid, user.uid)
    await db.execute(delete(Conversation).where(Conversation.uid == conv.uid))
    await db.commit()
    return {"status": "deleted"}
