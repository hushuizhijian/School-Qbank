"""
租户AI服务商模型 - 参照 ragflow 的 TenantModelProvider

功能：记录租户是否已添加某个系统供应商
输入参数：无（SQLAlchemy 模型定义）
返回值：TenantModelProvider ORM 类
使用场景：租户供应商管理，关联系统供应商注册表
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TenantModelProvider(Base):
    """租户已添加的AI供应商记录表"""
    __tablename__ = "tenant_model_providers"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 租户ID：默认为 default（单租户模式）
    tenant_id: Mapped[str] = mapped_column(String(36), default="default", nullable=False)
    # 供应商名称：对应 llm_factories.json 中的 name 字段
    provider_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 联合唯一约束：同一租户不能重复添加同一供应商
    __table_args__ = (UniqueConstraint("tenant_id", "provider_name", name="uq_tenant_provider"),)