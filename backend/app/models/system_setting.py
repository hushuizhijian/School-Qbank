"""
系统设置表 - 存储系统级别的默认模型配置

功能：以键值对形式存储系统级设置（如默认大模型 llm_id、默认嵌入模型 embd_id 等）
输入参数：无（SQLAlchemy 模型定义）
返回值：SystemSetting ORM 类
使用场景：SystemSetting 组件从该表加载/保存各类型默认模型
"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class SystemSetting(Base):
    """系统设置表（键值对存储）"""
    __tablename__ = "system_settings"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 设置键：如 llm_id、embd_id、img2txt_id、asr_id、rerank_id、tts_id
    setting_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # 设置值：格式为 provider_name|instance_name|model_name
    setting_value: Mapped[str] = mapped_column(Text, default="")
    # 更新时间
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("setting_key", name="uq_setting_key"),)