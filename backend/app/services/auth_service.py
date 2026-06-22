"""
认证服务

功能：用户注册和登录
输入参数：db会话 / RegisterRequest / LoginRequest
返回值：TokenResponse（含JWT令牌和用户信息）
使用场景：用户认证
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException

from app.models.user import User
from app.utils.security import hash_password, verify_password, create_access_token
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse


async def register(db: AsyncSession, req: RegisterRequest) -> TokenResponse:
    """用户注册 — 检查用户名唯一性后创建用户"""
    existing = await db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")

    user = User(
        username=req.username,
        password_hash=hash_password(req.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=str(user.id), username=user.username, role=user.role),
    )


async def login(db: AsyncSession, req: LoginRequest) -> TokenResponse:
    """用户登录 — 校验密码后返回令牌"""
    result = await db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_access_token(str(user.id))
    return TokenResponse(
        access_token=token,
        user=UserResponse(id=str(user.id), username=user.username, role=user.role),
    )
