from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings
from app.database import engine
from app.routers import chat


class HealthRagflow(BaseModel):
    ragflow_base_url: str
    reachable: bool
    detail: str | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="ragflow_legal API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/ragflow", response_model=HealthRagflow)
async def health_ragflow() -> HealthRagflow:
    url = settings.ragflow_base_url.rstrip("/") + "/"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(url, follow_redirects=True)
        ok = r.status_code < 500
        return HealthRagflow(
            ragflow_base_url=settings.ragflow_base_url,
            reachable=ok,
            detail=None if ok else f"HTTP {r.status_code}",
        )
    except Exception as e:  # noqa: BLE001 — health probe
        return HealthRagflow(
            ragflow_base_url=settings.ragflow_base_url,
            reachable=False,
            detail=str(e),
        )
