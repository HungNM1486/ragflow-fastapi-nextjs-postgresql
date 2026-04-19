import json
import uuid
from typing import Annotated, Any, AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import ChatMessage, Conversation
from app.ragflow_client import _headers, ragflow_create_session, ragflow_url

router = APIRouter(tags=["chat"])


class CreateSessionBody(BaseModel):
    name: str | None = Field(default=None, max_length=200)


class CreateSessionResponse(BaseModel):
    conversation_uid: str


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
        ragflow_session_id=session_id,
        ragflow_chat_id=settings.ragflow_chat_id,
    )
    db.add(conv)
    await db.commit()
    return CreateSessionResponse(conversation_uid=str(uid))


async def _get_conversation(
    db: AsyncSession, conversation_uid: str
) -> Conversation:
    try:
        uid = uuid.UUID(conversation_uid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="conversation_uid không hợp lệ") from e
    res = await db.execute(select(Conversation).where(Conversation.uid == uid))
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy conversation")
    return row


def _parse_sse_last_answer(raw: bytes) -> tuple[str | None, dict[str, Any] | None]:
    """Lấy answer cuối cùng và object data gần nhất có answer từ buffer SSE."""
    text = raw.decode("utf-8", errors="replace")
    last_answer: str | None = None
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
        if isinstance(obj, dict) and obj.get("code") == 0:
            data = obj.get("data")
            if isinstance(data, dict) and "answer" in data:
                last_answer = str(data["answer"])
                last_obj = obj
    return last_answer, last_obj


@router.post("/chat/completions")
async def chat_completions(
    body: CompletionBody,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    _require_ragflow_config()
    conv = await _get_conversation(db, body.conversation_uid)
    db.add(
        ChatMessage(
            conversation_uid=conv.uid,
            role="user",
            content=body.question,
            raw_payload=None,
        )
    )
    await db.commit()

    chat_id = settings.ragflow_chat_id
    url = ragflow_url(f"/api/v1/chats/{chat_id}/completions")
    payload: dict[str, Any] = {
        "question": body.question,
        "stream": True,
        "session_id": conv.ragflow_session_id,
    }

    if body.stream:

        async def passthrough() -> AsyncIterator[bytes]:
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
                            yield err
                            return
                        async for chunk in resp.aiter_bytes():
                            yield chunk
                except Exception as e:  # noqa: BLE001
                    yield (
                        f'data:{{"code":500,"message":{json.dumps(str(e))}}}\n\n'
                    ).encode()

        return StreamingResponse(
            passthrough(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

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
                    raise HTTPException(
                        status_code=502,
                        detail=err.decode("utf-8", errors="replace")[:4000],
                    )
                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    buf.extend(chunk)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e

    raw = bytes(buf)
    answer, last_obj = _parse_sse_last_answer(raw)
    db.add(
        ChatMessage(
            conversation_uid=conv.uid,
            role="assistant",
            content=answer,
            raw_payload=last_obj,
        )
    )
    await db.commit()
    raw_text = raw.decode("utf-8", errors="replace")
    return JSONResponse(
        {
            "conversation_uid": str(conv.uid),
            "answer": answer,
            "ragflow": last_obj,
            "raw_sse_tail": raw_text[-50000:] if len(raw_text) > 50000 else raw_text,
        }
    )
