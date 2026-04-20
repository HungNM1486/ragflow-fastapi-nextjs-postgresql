import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import AuthSession, User, UserRole


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    raw = request.cookies.get(settings.session_cookie_name)
    if raw is None:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")
    try:
        sid = uuid.UUID(raw)
    except ValueError as e:
        raise HTTPException(status_code=401, detail="Phiên không hợp lệ") from e
    now = datetime.now(timezone.utc)
    res = await db.execute(
        select(User)
        .join(AuthSession, AuthSession.user_uid == User.uid)
        .where(AuthSession.id == sid, AuthSession.expires_at > now)
    )
    user = res.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Phiên không hợp lệ hoặc đã hết hạn")
    return user


async def require_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
    if user.role != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Cần quyền quản trị")
    return user
