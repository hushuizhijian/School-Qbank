"""
导出记录模型

功能：定义导出记录表结构，记录PDF导出的历史信息
输入参数：无（SQLAlchemy 模型定义）
返回值：ExportRecord ORM 类
使用场景：导出历史查询、文件下载
"""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExportRecord(Base):
    """导出记录表"""
    __tablename__ = "export_records"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 所属用户ID
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    # 关联作业ID
    homework_id: Mapped[str] = mapped_column(String(36), nullable=False)
    # 导出标题
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # 页面大小：A4 / B4 等
    page_size: Mapped[str] = mapped_column(String(10), default="A4")
    # 导出文件路径
    file_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
