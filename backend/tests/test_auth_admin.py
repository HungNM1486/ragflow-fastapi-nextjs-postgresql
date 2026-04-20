import os
import uuid

from sqlalchemy import create_engine, delete, text

from app.models import AuthSession, User
from app.security import hash_password


def _sync_database_url() -> str:
    url = os.environ["DATABASE_URL"]
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return url


def _truncate_users_sessions_sync() -> None:
    eng = create_engine(_sync_database_url(), pool_pre_ping=True)
    with eng.begin() as conn:
        conn.execute(delete(AuthSession))
        conn.execute(delete(User))
    eng.dispose()


def _seed_admin_sync() -> None:
    eng = create_engine(_sync_database_url(), pool_pre_ping=True)
    with eng.begin() as conn:
        conn.execute(delete(AuthSession))
        conn.execute(delete(User))
        uid = uuid.uuid4()
        ph = hash_password("devpass12")
        conn.execute(
            text(
                """
                INSERT INTO users (uid, email, password_hash, role, is_active, created_at, updated_at)
                VALUES (:uid, :email, :ph, 'admin', true, now(), now())
                """
            ),
            {"uid": uid, "email": "admin@example.com", "ph": ph},
        )
    eng.dispose()


def test_health(client) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_auth_admin_flow(client) -> None:
    _truncate_users_sessions_sync()
    _seed_admin_sync()

    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "devpass12"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == "admin@example.com"
    assert data["role"] == "admin"

    assert client.get("/api/v1/auth/me").status_code == 200

    r3 = client.get("/api/v1/admin/users")
    assert r3.status_code == 200
    assert len(r3.json()) == 1

    r4 = client.post(
        "/api/v1/admin/users",
        json={"email": "user@example.com", "password": "longpass12", "role": "user"},
    )
    assert r4.status_code == 200, r4.text
    uid_user = r4.json()["uid"]

    assert len(client.get("/api/v1/admin/users").json()) == 2

    assert client.delete(f"/api/v1/admin/users/{uid_user}").status_code == 200

    assert client.post("/api/v1/auth/logout").status_code == 200

    assert client.get("/api/v1/auth/me").status_code == 401


def test_admin_requires_auth_without_cookie() -> None:
    from fastapi.testclient import TestClient

    from app.main import app

    _truncate_users_sessions_sync()
    with TestClient(app) as c:
        assert c.get("/api/v1/admin/users").status_code == 401
