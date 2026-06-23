"""
题目模型（V2增强版）

功能：定义题目表结构，包含题干、选项、答案及V2新增的解析/来源/特征标记等字段
输入参数：无（SQLAlchemy 模型定义）
返回值：Question ORM 类
使用场景：题目管理、题库检索、AI辅助标注
"""
import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Float, Text, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class Question(Base):
    """题目表（V2增强版）"""
    __tablename__ = "questions"

    # 主键：UUID 自动生成
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    # 所属试卷ID（可为空，支持独立题目）
    paper_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("papers.id"), nullable=True)
    # 题号
    question_no: Mapped[int] = mapped_column(Integer, nullable=False)
    # 题型：general / choice / fill / calculation / application
    question_type: Mapped[str] = mapped_column(String(20), default="general")
    # 题干
    stem: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # 选项：JSON数组
    options: Mapped[list] = mapped_column(JSON, default=list)
    # 答案
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 图片列表：JSON数组
    images: Mapped[list] = mapped_column(JSON, default=list)
    # ⭐ MinerU LaTeX 源码（整卷）
    latex_source: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # TikZ代码
    tikz_code: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # 图片类型：screenshot / tikz / latex / none
    figure_type: Mapped[str] = mapped_column(String(20), default="screenshot")
    # 边界坐标：JSON格式
    boundary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 是否收藏
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    # 知识点ID列表：JSON数组（兼容旧数据）
    knowledge_points: Mapped[list] = mapped_column(JSON, default=list)
    # 难度：simple / medium / hard（保留旧字段，兼容历史数据）
    difficulty: Mapped[str] = mapped_column(String(20), default="medium")
    # AI 自动打难度：0.1~1.0 小数（0.1=最简单，1.0=最难），进入校对工作台时自动生成
    ai_difficulty: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    # 用户手动打的难度：0.1~1.0 小数（可空，未打分时为 NULL）
    user_difficulty: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    # 题目状态：pending / normal / error
    question_status: Mapped[str] = mapped_column(String(20), default="pending")
    # 是否已入库题库
    in_bank: Mapped[bool] = mapped_column(Boolean, default=False)
    # 入库时间
    bank_added_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, default=None)
    # 创建时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # 更新时间
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # ---- V2 新增字段 ----
    # 详细解析
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    # 分值
    score: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    # 来源试卷名称
    source_paper_name: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    # 出题年份
    source_year: Mapped[str | None] = mapped_column(String(10), nullable=True, default=None)
    # 地区
    source_region: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    # 是否含图
    has_figure: Mapped[bool] = mapped_column(Boolean, default=False)
    # 是否含公式
    has_formula: Mapped[bool] = mapped_column(Boolean, default=False)
    # 是否含表格
    has_table: Mapped[bool] = mapped_column(Boolean, default=False)
    # Word 编辑器保存内容：JSON（{ html: string, images: [{id,url,x,y,w,h,srcW,srcH,srcX,srcY}] }）
    word_content: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)

    # 关联关系：所属试卷
    paper = relationship("Paper", back_populates="questions")
    # 关联关系：知识点多对多
    knowledge_point_links = relationship(
        "QuestionKnowledge", back_populates="question", lazy="selectin", cascade="all, delete-orphan"
    )
