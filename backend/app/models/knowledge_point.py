"""
知识点模型（V2新增 - 树形结构）

功能：定义树形知识点表结构，支持多级知识点分类
输入参数：无（SQLAlchemy 模型定义）
返回值：KnowledgePoint ORM 类
使用场景：知识点树管理、题目知识点关联、按知识点检索题目
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship, backref

from app.database import Base


class KnowledgePoint(Base):
    """知识点表（树形结构）"""
    __tablename__ = "knowledge_points"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 中文名称
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 内部编码：唯一标识
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    # 父节点ID：自引用外键
    parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("knowledge_points.id"), nullable=True, default=None)
    # 层级深度：1=一级, 2=二级, 3=三级
    level: Mapped[int] = mapped_column(Integer, default=1)
    # 学科：默认数学
    subject: Mapped[str] = mapped_column(String(20), default="数学")
    # 年级
    grade: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    # 学期
    semester: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)
    # 排序序号
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # 描述说明
    description: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # 冗余计数：关联题目数
    question_count: Mapped[int] = mapped_column(Integer, default=0)
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 自引用关系：子节点列表
    children = relationship(
        "KnowledgePoint",
        backref=backref("parent", remote_side=[id]),
        lazy="selectin",
        foreign_keys=[parent_id],
    )
    # 关联关系：题目关联
    question_links = relationship(
        "QuestionKnowledge", back_populates="knowledge_point", lazy="selectin", cascade="all, delete-orphan"
    )
