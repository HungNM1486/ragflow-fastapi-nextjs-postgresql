from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User, UserRole
from app.security import hash_password


async def ensure_bootstrap_admin(db: AsyncSession) -> None:
    email = (settings.bootstrap_admin_email or "").strip().lower()
    password = settings.bootstrap_admin_password or ""
    if not email or not password:
        return
    res = await db.execute(select(func.count()).select_from(User))
    n = int(res.scalar_one() or 0)
    if n > 0:
        return
    db.add(
        User(
            email=email,
            password_hash=hash_password(password),
            role=UserRole.ADMIN.value,
            is_active=True,
        )
    )
    await db.commit()
