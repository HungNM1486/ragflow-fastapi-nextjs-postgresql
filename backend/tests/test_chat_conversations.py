import os
import uuid
from typing import Any

from sqlalchemy import create_engine, delete, text

from app.models import AuthSession, ChatMessage, Conversation, User
from app.security import hash_password


def _sync_database_url() -> str:
    url = os.environ["DATABASE_URL"]
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return url


def _reset_chat_data() -> None:
    eng = create_engine(_sync_database_url(), pool_pre_ping=True)
    with eng.begin() as conn:
        conn.execute(delete(ChatMessage))
        conn.execute(delete(Conversation))
        conn.execute(delete(AuthSession))
        conn.execute(delete(User))
    eng.dispose()


def _seed_user_sync(email: str, password: str) -> uuid.UUID:
    eng = create_engine(_sync_database_url(), pool_pre_ping=True)
    uid = uuid.uuid4()
    with eng.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO users (uid, email, password_hash, role, is_active, created_at, updated_at)
                VALUES (:uid, :email, :ph, 'user', true, now(), now())
                """
            ),
            {"uid": uid, "email": email, "ph": hash_password(password)},
        )
    eng.dispose()
    return uid


class _FakeResp:
    def __init__(self, body: dict[str, Any], status_code: int = 200):
        self._body = body
        self.status_code = status_code
        self.text = str(body)

    def json(self) -> dict[str, Any]:
        return self._body


def test_chat_conversation_management_flow(client, monkeypatch) -> None:
    _reset_chat_data()
    _seed_user_sync("u1@example.com", "devpass12")

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "u1@example.com", "password": "devpass12"},
    )
    assert login.status_code == 200, login.text

    async def fake_create_session(*args, **kwargs):
        return {"id": "rf-session-u1"}

    async def fake_post(self, *args, **kwargs):
        return _FakeResp(
            {
                "code": 0,
                "data": {
                    "answer": "Tra loi [ID:0]",
                    "reference": {
                        "chunks": [
                            {
                                "content": "Noi dung trich dan",
                                "document_name": "demo.doc",
                            }
                        ]
                    },
                },
            }
        )

    monkeypatch.setattr("app.routers.chat.ragflow_create_session", fake_create_session)
    monkeypatch.setattr("app.routers.chat.httpx.AsyncClient.post", fake_post)

    create = client.post("/api/v1/chat/sessions", json={"name": "Case A"})
    assert create.status_code == 200, create.text
    conversation_uid = create.json()["conversation_uid"]

    comp = client.post(
        "/api/v1/chat/completions",
        json={
            "conversation_uid": conversation_uid,
            "question": "Xin chao",
            "stream": False,
        },
    )
    assert comp.status_code == 200, comp.text
    assert "answer" in comp.json()

    listed = client.get("/api/v1/chat/conversations")
    assert listed.status_code == 200
    items = listed.json()
    assert len(items) == 1
    assert items[0]["uid"] == conversation_uid
    assert items[0]["title"] == "Case A"

    messages = client.get(f"/api/v1/chat/conversations/{conversation_uid}/messages")
    assert messages.status_code == 200
    rows = messages.json()
    assert len(rows) == 2
    assert rows[0]["role"] == "user"
    assert rows[1]["role"] == "assistant"

    patched = client.patch(
        f"/api/v1/chat/conversations/{conversation_uid}",
        json={"title": "Case A Updated"},
    )
    assert patched.status_code == 200
    assert patched.json()["title"] == "Case A Updated"

    deleted = client.delete(f"/api/v1/chat/conversations/{conversation_uid}")
    assert deleted.status_code == 200
    assert deleted.json()["status"] == "deleted"
    assert client.get(f"/api/v1/chat/conversations/{conversation_uid}/messages").status_code == 404


def test_conversation_ownership_guard(client, monkeypatch) -> None:
    _reset_chat_data()
    _seed_user_sync("u1@example.com", "devpass12")
    _seed_user_sync("u2@example.com", "devpass12")

    async def fake_create_session(*args, **kwargs):
        return {"id": "rf-session-owned"}

    monkeypatch.setattr("app.routers.chat.ragflow_create_session", fake_create_session)

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "u1@example.com", "password": "devpass12"},
        ).status_code
        == 200
    )
    create = client.post("/api/v1/chat/sessions", json={"name": "Owned"})
    assert create.status_code == 200
    conversation_uid = create.json()["conversation_uid"]
    assert client.post("/api/v1/auth/logout").status_code == 200

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "u2@example.com", "password": "devpass12"},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/chat/conversations").status_code == 200
    assert client.get("/api/v1/chat/conversations").json() == []
    assert client.get(f"/api/v1/chat/conversations/{conversation_uid}/messages").status_code == 404
    assert client.patch(
        f"/api/v1/chat/conversations/{conversation_uid}",
        json={"title": "No access"},
    ).status_code == 404
    assert client.delete(f"/api/v1/chat/conversations/{conversation_uid}").status_code == 404
