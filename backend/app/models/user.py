"""
用户模型

功能：定义用户表结构，包含用户基本信息和关联关系
输入参数：无（SQLAlchemy 模型定义）
返回值：User ORM 类
使用场景：用户注册、登录认证、关联试卷和作业
"""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "users"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 用户名：唯一索引，不可为空
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    # 密码哈希：bcrypt加密存储
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # 角色：默认教师
    role: Mapped[str] = mapped_column(String(20), default="teacher")
    # 创建时间：服务器自动生成
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 关联关系：用户拥有的试卷
    papers = relationship("Paper", back_populates="user", lazy="selectin")
    # 关联关系：用户拥有的作业
    homework = relationship("Homework", back_populates="user", lazy="selectin")
    # 关联关系：用户创建的试卷范例（阶段5：范例功能）
    paper_templates = relationship("PaperTemplate", back_populates="user", lazy="selectin")
