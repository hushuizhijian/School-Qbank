"""
作业-题目关联模型

功能：定义作业与题目的多对多关联表，包含排序和分值信息
输入参数：无（SQLAlchemy 模型定义）
返回值：HomeworkQuestion ORM 类
使用场景：作业中题目的排序、分值设置
"""
import uuid

from sqlalchemy import String, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class HomeworkQuestion(Base):
    """作业-题目关联表"""
    __tablename__ = "homework_questions"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 所属作业ID
    homework_id: Mapped[str] = mapped_column(String(36), ForeignKey("homework.id"), nullable=False)
    # 关联题目ID
    question_id: Mapped[str] = mapped_column(String(36), ForeignKey("questions.id"), nullable=False)
    # 排序序号
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 分值
    score: Mapped[int] = mapped_column(Integer, default=0)
    # 是否必做
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)

    # 关联关系：所属作业
    homework = relationship("Homework", back_populates="homework_questions")
    # 关联关系：关联题目
    question = relationship("Question", lazy="selectin")
