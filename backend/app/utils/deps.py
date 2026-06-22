"""
依赖注入：获取当前用户

功能：提供当前用户获取的依赖注入函数，测试阶段跳过JWT认证
输入参数：db（异步数据库会话，通过依赖注入获取）
返回值：User 对象
使用场景：FastAPI 路由中通过 Depends(get_current_user) 注入当前用户

测试阶段：跳过 JWT 认证，自动创建/返回默认测试用户。
恢复登录时：还原为 HTTPBearer + decode_access_token 校验逻辑。
"""
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User

# 默认测试用户配置
DEFAULT_TEST_USERNAME = "test_teacher"  # 测试用户名
DEFAULT_TEST_PASSWORD = "test123456"  # 测试密码


async def get_current_user(
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    获取当前用户（测试阶段）

    功能：自动获取或创建默认测试用户，跳过认证
    输入参数：db（异步数据库会话）
    返回值：User 对象
    使用场景：FastAPI 路由中通过 Depends(get_current_user) 注入
    """
    # 查询测试用户
    result = await db.execute(
        select(User).where(User.username == DEFAULT_TEST_USERNAME)
    )
    user = result.scalar_one_or_none()

    if not user:
        # 自动创建默认测试用户
        from app.utils.security import hash_password

        user = User(
            username=DEFAULT_TEST_USERNAME,  # 用户名
            password_hash=hash_password(DEFAULT_TEST_PASSWORD),  # 密码哈希
            role="teacher",  # 角色
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user
