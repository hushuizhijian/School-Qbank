"""
题目-知识点多对多关联模型（V2新增）

功能：定义题目与知识点的多对多关联表
输入参数：无（SQLAlchemy 模型定义）
返回值：QuestionKnowledge ORM 类
使用场景：题目关联多个知识点、按知识点检索题目
"""
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QuestionKnowledge(Base):
    """题目-知识点关联表"""
    __tablename__ = "question_knowledge"

    # 题目ID：联合主键
    question_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True
    )
    # 知识点ID：联合主键
    knowledge_point_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("knowledge_points.id", ondelete="CASCADE"), primary_key=True
    )

    # 关联关系：所属题目
    question = relationship("Question", back_populates="knowledge_point_links")
    # 关联关系：所属知识点
    knowledge_point = relationship("KnowledgePoint", back_populates="question_links")
