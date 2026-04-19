from typing import Any

import httpx

from app.config import settings


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {settings.ragflow_api_key}",
        "Content-Type": "application/json",
    }


def ragflow_url(path: str) -> str:
    base = settings.ragflow_base_url.rstrip("/")
    p = path if path.startswith("/") else f"/{path}"
    return f"{base}{p}"


async def ragflow_create_session(
    client: httpx.AsyncClient, *, name: str, user_id: str
) -> dict[str, Any]:
    chat_id = settings.ragflow_chat_id
    if not chat_id:
        raise ValueError("RAGFLOW_CHAT_ID is not configured")
    r = await client.post(
        ragflow_url(f"/api/v1/chats/{chat_id}/sessions"),
        headers=_headers(),
        json={"name": name, "user_id": user_id},
        timeout=60.0,
    )
    r.raise_for_status()
    body = r.json()
    if body.get("code") != 0:
        raise RuntimeError(f"RAGFlow session error: {body}")
    return body["data"]
