"""
安全工具模块

功能：提供密码哈希、密码验证、JWT令牌创建和解析等安全相关功能
输入参数：密码字符串、JWT令牌等
返回值：哈希后的密码、验证结果、JWT令牌、令牌解析结果
使用场景：用户注册、登录认证、接口鉴权
"""
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from app.config import settings


def hash_password(password: str) -> str:
    """
    密码哈希

    功能：使用 bcrypt 对明文密码进行哈希加密
    输入参数：password（明文密码）
    返回值：哈希后的密码字符串
    使用场景：用户注册、密码修改
    """
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    密码验证

    功能：验证明文密码与哈希密码是否匹配
    输入参数：plain_password（明文密码）、hashed_password（哈希密码）
    返回值：是否匹配（布尔值）
    使用场景：用户登录验证
    """
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    """
    创建访问令牌

    功能：根据用户ID生成JWT访问令牌
    输入参数：user_id（用户ID）
    返回值：JWT令牌字符串
    使用场景：用户登录成功后生成令牌
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)  # 过期时间
    payload = {"sub": user_id, "exp": expire}  # 令牌载荷
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)  # 编码令牌


def decode_access_token(token: str) -> dict:
    """
    解析访问令牌

    功能：解析JWT令牌，返回载荷数据
    输入参数：token（JWT令牌字符串）
    返回值：令牌载荷字典
    使用场景：接口鉴权时解析令牌
    """
    return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])  # 解码令牌
