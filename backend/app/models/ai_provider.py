"""
AI服务商模型

功能：定义AI服务商配置表结构，支持多服务商管理
输入参数：无（SQLAlchemy 模型定义）
返回值：AIProvider ORM 类
使用场景：AI服务商配置管理、API调用选择
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Boolean, DateTime, func
from sqlalchemy.types import JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AIProvider(Base):
    """AI服务商配置表"""
    __tablename__ = "ai_providers"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 服务商名称：唯一
    provider_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    # API基础地址
    api_base: Mapped[str] = mapped_column(String(255), nullable=False)
    # API密钥
    api_key: Mapped[str] = mapped_column(String(255), nullable=False)
    # 可用模型列表：JSON数组
    model_list: Mapped[list] = mapped_column(JSON, default=list)
    # 是否启用
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
