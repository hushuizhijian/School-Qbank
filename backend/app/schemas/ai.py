"""
AI 操作相关 Schema

功能：定义AI操作的请求和响应模型
输入参数：question_id / action / 批量请求
返回值：AiOperationResponse / BatchStandardizeRequest
使用场景：AI操作API的数据验证
"""
from pydantic import BaseModel


class AiOperationRequest(BaseModel):
    """AI 操作请求 — 单题操作"""
    question_id: str
    provider_key: str = ""   # 供应商标识（如 智谱AI / DeepSeek），为空则使用默认
    instance_name: str = ""  # 实例名称（如 default），多实例场景下区分；为空时使用默认实例
    model_key: str = ""      # 模型标识（如 glm-4v-flash），为空则使用默认模型


class AiOperationResponse(BaseModel):
    """AI 操作响应 — 与前端 AiOperationResponse 类型对齐"""
    question_id: str = ""  # 题目ID，前端用于追溯
    action: str = ""  # 操作类型
    success: bool = True  # 是否成功
    # 与前端对齐：使用 data 字段承载操作结果（前端在 components/ai/*.tsx 中统一通过 res.data 访问）
    data: dict = {}  # 操作结果数据（按 action 含义不同键名不同）
    result: dict = {}  # 兼容旧字段：部分后端代码仍使用 result，与 data 同步填充
    message: str = ""  # 提示信息
    confidence: float = 0  # 置信度（保留前端字段，0-1）
    needs_confirmation: bool = False  # 是否需要二次确认


class BatchStandardizeRequest(BaseModel):
    """批量 AI 标准化请求"""
    question_ids: list[str]
    action: str  # match_knowledge / fix_typos / generate_analysis / standardize_stem / auto_difficulty
    # AI 供应商选择（三级优先级中的最高优先级）
    provider_key: str = ""   # 供应商标识（如 智谱AI / DeepSeek），为空时按 model_type 走系统默认
    instance_name: str = ""  # 实例名称（如 default），多实例场景下区分
    model_key: str = ""      # 模型标识（如 glm-4v-flash）


class AiSelectionRequest(BaseModel):
    """AI 操作通用选择参数 — 用于 ai-explain / ai-refine 等新增参数接口

    字段说明：所有字段均可为空，空时按三级优先级回退到系统默认 / 兜底链
    """
    provider_key: str = ""   # 供应商标识
    instance_name: str = ""  # 实例名称
    model_key: str = ""      # 模型标识
