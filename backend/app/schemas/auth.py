"""
认证 Schema

功能：定义注册、登录、用户信息、Token等认证相关的数据结构
输入参数：无（Pydantic 模型定义）
返回值：RegisterRequest / LoginRequest / UserResponse / TokenResponse 类
使用场景：用户注册、登录认证、Token返回
"""
from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    """
    注册请求

    功能：定义用户注册的请求参数
    输入参数：username（用户名）、password（密码）
    返回值：注册请求对象
    使用场景：用户注册接口
    """
    username: str = Field(min_length=3, max_length=50)  # 用户名，3-50字符
    password: str = Field(min_length=6, max_length=100)  # 密码，6-100字符


class LoginRequest(BaseModel):
    """
    登录请求

    功能：定义用户登录的请求参数
    输入参数：username（用户名）、password（密码）
    返回值：登录请求对象
    使用场景：用户登录接口
    """
    username: str  # 用户名
    password: str  # 密码


class UserResponse(BaseModel):
    """
    用户信息响应

    功能：定义用户信息的返回格式
    输入参数：id、username、role
    返回值：用户信息对象
    使用场景：登录成功后返回用户信息
    """
    id: str  # 用户ID
    username: str  # 用户名
    role: str  # 角色

    model_config = {"from_attributes": True}  # 支持从ORM对象转换


class TokenResponse(BaseModel):
    """
    Token响应

    功能：定义登录成功后的Token返回格式
    输入参数：access_token、token_type、user
    返回值：Token响应对象
    使用场景：登录接口返回
    """
    access_token: str  # 访问令牌
    token_type: str = "bearer"  # 令牌类型
    user: UserResponse  # 用户信息
