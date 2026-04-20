"""Thiết lập env trước khi import app (settings đọc một lần khi load module)."""

import os

# Mặc định: Postgres app từ compose dev (compose.yaml map 5433).
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://app:app_dev_change_me@127.0.0.1:5433/ragflow_legal",
)
os.environ.setdefault("BOOTSTRAP_ADMIN_EMAIL", "admin@example.com")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "devpass12")
os.environ.setdefault("RAGFLOW_API_KEY", "test-key")
os.environ.setdefault("RAGFLOW_CHAT_ID", "00000000000000000000000000000000")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text


def _postgres_reachable() -> bool:
    url = os.environ["DATABASE_URL"]
    if url.startswith("postgresql+asyncpg://"):
        sync = url.replace("postgresql+asyncpg://", "postgresql://", 1)
    else:
        sync = url
    try:
        eng = create_engine(sync, pool_pre_ping=True)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        eng.dispose()
        return True
    except OSError:
        return False
    except Exception:  # noqa: BLE001
        return False


pytestmark = pytest.mark.skipif(
    not _postgres_reachable(),
    reason="PostgreSQL (DATABASE_URL) không kết nối được — bật docker compose rồi chạy lại pytest",
)

from app.main import app  # noqa: E402 — sau khi set env & skipif


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as c:
        yield c
