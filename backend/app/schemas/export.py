"""
导出记录 Schema

功能：定义导出记录相关的请求/响应数据结构
输入参数：无（Pydantic 模型定义）
返回值：ExportResponse / ExportListResponse 类
使用场景：导出历史查询、文件下载
"""
from pydantic import BaseModel
from datetime import datetime


class ExportResponse(BaseModel):
    """
    导出记录响应

    功能：定义导出记录详情的返回格式
    输入参数：导出记录各字段
    返回值：导出记录响应对象
    使用场景：导出记录查询
    """
    id: str  # 导出记录ID
    user_id: str  # 所属用户ID
    homework_id: str  # 关联作业ID
    title: str  # 导出标题
    page_size: str  # 页面大小
    file_path: str | None  # 导出文件路径
    created_at: datetime  # 创建时间

    model_config = {"from_attributes": True}  # 支持从ORM对象转换


class ExportListResponse(BaseModel):
    """
    导出记录列表响应

    功能：定义导出记录列表的返回格式
    输入参数：items（导出记录列表）、total（总数）
    返回值：导出记录列表响应对象
    使用场景：导出历史列表查询
    """
    items: list[ExportResponse]  # 导出记录列表
    total: int  # 总数
