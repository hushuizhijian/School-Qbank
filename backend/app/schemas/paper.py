"""
试卷 Schema（V2增强版）

功能：定义试卷相关的请求/响应数据结构，包含V2新增的地区/类型/学年等字段
输入参数：无（Pydantic 模型定义）
返回值：PaperResponse / PaperListResponse / PaperUploadResponse 类
使用场景：试卷查询、试卷上传、试卷列表
"""
from datetime import datetime
from pydantic import BaseModel


class PaperResponse(BaseModel):
    """
    试卷响应

    功能：定义试卷详情的返回格式
    输入参数：试卷各字段
    返回值：试卷响应对象
    使用场景：试卷详情查询、试卷列表返回
    """
    id: str  # 试卷ID
    filename: str  # 文件名
    status: str  # 解析状态
    parse_stage: str = ""  # 解析阶段
    page_count: int  # 页数
    subject: str = ""  # 学科
    grade: str = ""  # 年级
    semester: str = ""  # 学期
    error_message: str | None = None  # 错误信息
    parse_progress: dict = {}  # 解析进度
    created_at: datetime  # 创建时间
    updated_at: datetime  # 更新时间

    # ---- V2 新增字段 ----
    region: str | None = None  # 地区
    paper_type: str | None = None  # 试卷类型
    academic_year: str | None = None  # 学年
    version: str | None = None  # 教材版本
    parse_config: dict | None = None  # 解析引擎配置快照

    model_config = {"from_attributes": True}  # 支持从ORM对象转换


class PaperListResponse(BaseModel):
    """
    试卷列表响应

    功能：定义试卷列表的返回格式
    输入参数：papers（试卷列表）、total（总数）
    返回值：试卷列表响应对象
    使用场景：试卷列表查询接口
    """
    papers: list[PaperResponse]  # 试卷列表
    total: int  # 总数


class PaperUploadResponse(BaseModel):
    """
    试卷上传响应

    功能：定义试卷上传后的返回格式
    输入参数：id、filename、status、message等
    返回值：试卷上传响应对象
    使用场景：试卷上传接口返回
    """
    id: str  # 试卷ID
    filename: str  # 文件名
    status: str  # 状态
    message: str  # 提示消息
    subject: str = ""  # 学科
    grade: str = ""  # 年级
    semester: str = ""  # 学期
