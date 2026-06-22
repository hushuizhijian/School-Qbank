"""
作业模型

功能：定义作业表结构，包含作业基本信息和页面配置
输入参数：无（SQLAlchemy 模型定义）
返回值：Homework ORM 类
使用场景：作业创建、编辑、组卷
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class Homework(Base):
    """作业表"""
    __tablename__ = "homework"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 所属用户ID
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    # 作业标题
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    # 学科
    subject: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 年级
    grade: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 总分
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    # 页面配置：JSON格式
    page_config: Mapped[dict] = mapped_column(JSON, default=dict)
    # 状态：draft / published
    status: Mapped[str] = mapped_column(String(20), default="draft")
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 更新时间
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # 关联关系：所属用户
    user = relationship("User", back_populates="homework")
    # 关联关系：作业包含的题目（按排序序号排列，级联删除）
    homework_questions = relationship(
        "HomeworkQuestion", back_populates="homework", lazy="selectin",
        order_by="HomeworkQuestion.sort_order", cascade="all, delete-orphan"
    )
