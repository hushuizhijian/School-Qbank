"""
实例模型表 - 参照 ragflow 的 TenantModelInstance 中的模型列表

功能：记录每个供应商实例中配置的模型列表，支持模型启用/停用
输入参数：无（SQLAlchemy 模型定义）
返回值：InstanceModel ORM 类
使用场景：实例模型管理，一个实例可配置多个模型
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Integer, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class InstanceModel(Base):
    """实例模型配置表"""
    __tablename__ = "instance_models"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 关联的实例ID：对应 provider_instances 表的 id
    instance_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    # 模型名称：如 gpt-4o、deepseek-chat
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 模型类型：如 chat、embedding、image2text、speech2text、tts、rerank
    model_type: Mapped[str] = mapped_column(String(50), nullable=False, default="chat")
    # 最大 token 数
    max_tokens: Mapped[int] = mapped_column(Integer, default=0)
    # 模型状态：active / inactive
    status: Mapped[str] = mapped_column(String(20), default="active")
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 联合唯一约束：同一实例下模型名称不能重复
    __table_args__ = (UniqueConstraint("instance_id", "model_name", name="uq_instance_model"),)