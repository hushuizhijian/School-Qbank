"""
试卷模型（V2增强版）

功能：定义试卷表结构，包含试卷基本信息、解析状态和V2新增的地区/类型/学年等字段
输入参数：无（SQLAlchemy 模型定义）
返回值：Paper ORM 类
使用场景：试卷上传、解析状态追踪、试卷元数据管理
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class Paper(Base):
    """试卷表（V2增强版）"""
    __tablename__ = "papers"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 所属用户ID
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    # 文件名
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # 学科
    subject: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    # 年级
    grade: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    # 学期：first / second
    semester: Mapped[str] = mapped_column(String(20), default="", nullable=False)
    # 文件存储路径
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    # 解析状态：pending / processing / completed / failed
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # 解析阶段：extracting / refining / matching / completed
    parse_stage: Mapped[str] = mapped_column(String(30), default="")
    # 页数
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    # 元信息：JSON格式
    meta_info: Mapped[dict] = mapped_column("meta_info", JSON, default=dict)
    # 解析进度：JSON格式
    parse_progress: Mapped[dict] = mapped_column("parse_progress", JSON, default=dict)
    # 错误信息
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 更新时间
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    # 软删除时间
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ---- V2 新增字段 ----
    # 地区
    region: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    # 试卷类型：期中/期末/单元测试等
    paper_type: Mapped[str | None] = mapped_column(String(30), nullable=True, default=None)
    # 学年：如 2024-2025
    academic_year: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)
    # 教材版本：人教版/北师大版等
    version: Mapped[str | None] = mapped_column(String(30), nullable=True, default=None)
    # 解析引擎配置快照：JSON格式
    parse_config: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    # 关联关系：所属用户
    user = relationship("User", back_populates="papers")
    # 关联关系：试卷包含的题目
    questions = relationship("Question", back_populates="paper", lazy="selectin")
