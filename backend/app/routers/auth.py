import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.models import AuthSession, User
from app.security import verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class UserMeOut(BaseModel):
    uid: UUID
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/login", response_model=UserMeOut)
async def login(
    body: LoginBody,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    email = body.email.strip().lower()
    res = await db.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Tài khoản đã bị vô hiệu hóa")
    sid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(seconds=settings.session_max_age_seconds)
    db.add(AuthSession(id=sid, user_uid=user.uid, expires_at=expires))
    await db.commit()
    response.set_cookie(
        key=settings.session_cookie_name,
        value=str(sid),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return user


@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    raw = request.cookies.get(settings.session_cookie_name)
    if raw:
        try:
            sid = uuid.UUID(raw)
            await db.execute(delete(AuthSession).where(AuthSession.id == sid))
            await db.commit()
        except ValueError:
            pass
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
    )
    return {"status": "ok"}


@router.get("/me", response_model=UserMeOut)
async def me(user: Annotated[User, Depends(get_current_user)]) -> User:
    return user
