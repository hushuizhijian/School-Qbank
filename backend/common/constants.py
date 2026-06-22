"""
全局常量定义

功能：集中管理项目中所有魔法数字和硬编码常量
输入参数：无
返回值：各类常量
使用场景：所有模块引用常量时使用此模块
"""

# ====== 题型常量 ======

# 单选题
QUESTION_TYPE_SINGLE = "single"
# 多选题
QUESTION_TYPE_MULTI = "multi"
# 填空题
QUESTION_TYPE_FILL = "fill"
# 判断题
QUESTION_TYPE_JUDGE = "judge"
# 解答题/通用题
QUESTION_TYPE_GENERAL = "general"

# 所有有效题型集合
VALID_QUESTION_TYPES = {
    QUESTION_TYPE_SINGLE,
    QUESTION_TYPE_MULTI,
    QUESTION_TYPE_FILL,
    QUESTION_TYPE_JUDGE,
    QUESTION_TYPE_GENERAL,
}

# ====== LLM 相关常量 ======

# 默认 LLM 请求超时（秒）
DEFAULT_LLM_TIMEOUT = 60
# 视觉模型默认超时（秒）
DEFAULT_VISION_TIMEOUT = 120
# 默认温度参数
DEFAULT_TEMPERATURE = 0.1
# 默认最大 Token 数
DEFAULT_MAX_TOKENS = 4096
# 知识点匹配最大 Token 数
KNOWLEDGE_MATCH_MAX_TOKENS = 256
# 题目解析最大 Token 数
EXPLANATION_MAX_TOKENS = 1024
# 题型识别最大 Token 数
CLASSIFY_MAX_TOKENS = 10

# ====== 文件相关常量 ======

# 最大上传文件大小（MB）
MAX_FILE_SIZE_MB = 50
# 支持的图片格式
SUPPORTED_IMAGE_TYPES = {"png", "jpg", "jpeg", "gif", "bmp", "webp"}
# 支持的文档格式
SUPPORTED_DOC_TYPES = {"pdf"}

# ====== 管道相关常量 ======

# 管道阶段名称
STAGE_PARSE = "parse"
STAGE_OCR = "ocr"
STAGE_VLM = "vlm"
STAGE_CHUNK = "chunk"
STAGE_REFINE = "refine"
STAGE_KNOWLEDGE = "knowledge"

# ====== 数据库相关常量 ======

# 默认数据库路径
DEFAULT_DB_PATH = "./data/schoolwork.db"
# 默认 Redis URL
DEFAULT_REDIS_URL = "redis://localhost:6379/0"