"""
试卷范例模型（阶段5：范例功能）

功能：定义 paper_templates 表结构，存储试卷"格式范例"信息
     范例只保存格式信息（page_config：纸张/页眉/Logo/水印/页脚/字号等），
     不保存任何题目内容

输入参数：无（SQLAlchemy 模型定义）
返回值：PaperTemplate ORM 类
使用场景：
  - 用户在作业组卷工作台"保存"左侧的"范例"按钮触发创建
  - 画布下方范例列表展示
  - 一键导入范例到当前作业
"""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class PaperTemplate(Base):
    """试卷范例表

    字段说明：
      - id: 范例 ID（UUID）
      - user_id: 创建者（多租户隔离：每个用户只能看到自己的范例）
      - name: 范例名称（用户自定义，例如"期末考试 A4 版式"）
      - description: 范例说明（可选，便于辨识）
      - page_config: 试卷格式信息 JSON（与 homework.page_config 同结构，
                    但**不包含任何题目相关字段**）
      - created_at / updated_at: 时间戳
    """
    __tablename__ = "paper_templates"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 所属用户 ID（多租户隔离）
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    # 范例名称（必填，便于列表展示）
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # 范例说明（可选）
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # 试卷格式信息 JSON：纸张/页眉/Logo/水印/页脚/字号等
    page_config: Mapped[dict] = mapped_column(JSON, default=dict)
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 更新时间
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # 关联关系：所属用户
    user = relationship("User", back_populates="paper_templates")
