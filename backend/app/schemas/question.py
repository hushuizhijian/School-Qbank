"""
题目 Schema（V2增强版）

功能：定义题目相关的请求/响应数据结构，包含V2新增的解析/来源/特征标记等字段
输入参数：无（Pydantic 模型定义）
返回值：QuestionResponse / QuestionListResponse 类
使用场景：题目查询、题目列表、题目详情
"""
from pydantic import BaseModel, model_validator
from datetime import datetime


class KnowledgePointBrief(BaseModel):
    """
    知识点简要信息

    功能：题目响应中携带的知识点轻量信息（仅 id/name/code/level）
          配合前端 KnowledgePointItem 类型使用
    输入参数：知识点核心字段（支持从 ORM 知识对象或裸 ID 字符串构造）
    返回值：知识点简要对象
    使用场景：题目详情/列表中携带的知识点
    """
    id: str
    name: str
    code: str
    level: int = 0

    model_config = {"from_attributes": True}


class QuestionResponse(BaseModel):
    """
    题目响应

    功能：定义题目详情的返回格式
    输入参数：题目各字段
    返回值：题目响应对象
    使用场景：题目详情查询、题目列表返回
    """
    id: str  # 题目ID
    question_no: int  # 题号
    question_type: str  # 题型
    stem: str  # 题干
    options: list  # 选项列表
    answer: str | None = None  # 答案
    is_favorite: bool  # 是否收藏
    # 知识点：响应给前端的字段是 KnowledgePointBrief 对象列表（前端 KnowledgePointItem[]）。
    # ORM 原始字段是 ID 列表，序列化时由调用方使用 _collect_and_hydrate_knowledge_points
    # 把 ID 列表补全为对象列表。这里把元素类型声明为 Any，避免 Pydantic 严格校验
    # 拦截 model_validate 阶段（hydrated 之前的中间状态）。
    knowledge_points: list = []  # 知识点简要信息列表（由调用方 hydrate 后填入）
    knowledge_point_ids: list[str] = []  # 知识点 ID 列表（保留原始 ID 列表便于下游 ID 操作）
    difficulty: str = "medium"  # 旧版难度（兼容历史数据）
    # AI 自动打的难度：0.1~1.0 小数（0.1=最简单，1.0=最难）
    ai_difficulty: float | None = None
    # 用户手动打的难度：0.1~1.0 小数（可空，未打分时为 NULL）
    user_difficulty: float | None = None
    question_status: str = "pending"  # 题目状态
    in_bank: bool = False  # 是否已入库
    bank_added_at: datetime | None = None  # 入库时间
    images: list = []  # 图片列表
    tikz_code: str | None = None  # TikZ代码
    figure_type: str = "screenshot"  # 图片类型
    boundary: dict | None = None  # 边界坐标

    # ---- V2 新增字段 ----
    latex_source: str | None = None  # MinerU 输出的 LaTeX 源码
    analysis: str | None = None  # 详细解析
    score: float | None = None  # 分值
    source_paper_name: str | None = None  # 来源试卷名称
    source_year: str | None = None  # 出题年份
    source_region: str | None = None  # 地区
    has_figure: bool = False  # 是否含图
    has_formula: bool = False  # 是否含公式
    has_table: bool = False  # 是否含表格

    model_config = {"from_attributes": True}  # 支持从ORM对象转换


class QuestionListResponse(BaseModel):
    """
    题目列表响应

    功能：定义题目列表的返回格式
    输入参数：questions（题目列表）、total（总数）
    返回值：题目列表响应对象
    使用场景：题目列表查询接口
    """
    questions: list[QuestionResponse]  # 题目列表
    total: int  # 总数
