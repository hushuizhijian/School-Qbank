"""
供应商实例模型 - 参照 ragflow 的 TenantModelInstance

功能：记录租户为某个供应商创建的具体配置实例（API Key等）
输入参数：无（SQLAlchemy 模型定义）
返回值：ProviderInstance ORM 类
使用场景：供应商实例管理，一个供应商可创建多个实例
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ProviderInstance(Base):
    """供应商配置实例表"""
    __tablename__ = "provider_instances"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 关联的供应商ID：对应 tenant_model_providers 表的 id
    provider_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # 实例名称：用户自定义的实例标识
    instance_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # API密钥：加密存储的API Key
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    # 扩展配置：JSON格式，可存储 base_url、模型列表等
    extra: Mapped[str] = mapped_column(Text, default="{}")
    # 实例状态：active / inactive
    status: Mapped[str] = mapped_column(String(20), default="active")
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 联合唯一约束：同一供应商下实例名称不能重复
    __table_args__ = (UniqueConstraint("provider_id", "instance_name", name="uq_provider_instance"),)