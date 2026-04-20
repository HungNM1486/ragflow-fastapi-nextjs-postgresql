import uuid
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import require_admin
from app.models import User, UserRole
from app.security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])


class UserOut(BaseModel):
    uid: UUID
    email: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreateBody(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: Literal["admin", "user"] = "user"


class UserPatchBody(BaseModel):
    email: EmailStr | None = None
    role: Literal["admin", "user"] | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("role", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v


async def _count_active_admins(db: AsyncSession) -> int:
    c = await db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role == UserRole.ADMIN.value, User.is_active.is_(True))
    )
    return int(c or 0)


async def _get_user_by_uid(db: AsyncSession, user_uid: str) -> User:
    try:
        uid = uuid.UUID(user_uid)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="uid không hợp lệ") from e
    res = await db.execute(select(User).where(User.uid == uid))
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
    return row


@router.get("/users", response_model=list[UserOut])
async def list_users(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[User]:
    res = await db.execute(select(User).order_by(User.created_at.desc()))
    return list(res.scalars().all())


@router.post("/users", response_model=UserOut)
async def create_user(
    body: UserCreateBody,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    email = body.email.strip().lower()
    exists = await db.scalar(select(func.count()).select_from(User).where(User.email == email))
    if int(exists or 0) > 0:
        raise HTTPException(status_code=409, detail="Email đã được sử dụng")
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.patch("/users/{user_uid}", response_model=UserOut)
async def patch_user(
    user_uid: str,
    body: UserPatchBody,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    user = await _get_user_by_uid(db, user_uid)
    if body.email is not None:
        new_email = body.email.strip().lower()
        if new_email != user.email:
            clash = await db.scalar(
                select(func.count()).select_from(User).where(User.email == new_email)
            )
            if int(clash or 0) > 0:
                raise HTTPException(status_code=409, detail="Email đã được sử dụng")
            user.email = new_email
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.role is not None:
        if user.role == UserRole.ADMIN.value and body.role != UserRole.ADMIN.value and user.is_active:
            admins = await _count_active_admins(db)
            if admins <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Không thể bỏ vai trò admin của người dùng admin duy nhất",
                )
        user.role = body.role
    if body.is_active is not None:
        if not body.is_active and user.role == UserRole.ADMIN.value and user.is_active:
            admins = await _count_active_admins(db)
            if admins <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Không thể vô hiệu admin duy nhất",
                )
        user.is_active = body.is_active
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_uid}")
async def delete_user(
    user_uid: str,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    user = await _get_user_by_uid(db, user_uid)
    if user.uid == admin.uid:
        raise HTTPException(status_code=400, detail="Không thể xóa chính mình")
    if user.role == UserRole.ADMIN.value and user.is_active:
        admins = await _count_active_admins(db)
        if admins <= 1:
            raise HTTPException(status_code=400, detail="Không thể xóa admin duy nhất")
    await db.execute(delete(User).where(User.uid == user.uid))
    await db.commit()
    return {"status": "deleted"}
