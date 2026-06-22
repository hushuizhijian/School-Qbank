"""
试卷范例 Schema（阶段5：范例功能）

功能：定义 paper_template 相关的请求/响应数据结构
输入参数：无（Pydantic 模型定义）
返回值：PaperTemplateResponse / PaperTemplateListResponse / PaperTemplateCreateRequest
使用场景：作业组卷工作台的"保存为范例" / "应用范例"功能
"""
from datetime import datetime
from pydantic import BaseModel, Field


class PaperTemplateResponse(BaseModel):
    """试卷范例响应

    功能：定义单个范例的返回格式
    使用场景：列表展示 / 详情查询 / 应用范例
    """
    id: str = Field(..., description="范例 ID")
    name: str = Field(..., description="范例名称")
    description: str | None = Field(default=None, description="范例说明")
    page_config: dict = Field(default_factory=dict, description="试卷格式信息（纸张/页眉/Logo/水印等）")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    model_config = {"from_attributes": True}  # 支持从 ORM 对象转换


class PaperTemplateListResponse(BaseModel):
    """试卷范例列表响应

    功能：定义范例列表的返回格式
    使用场景：组卷工作台下方范例列表
    """
    templates: list[PaperTemplateResponse] = Field(..., description="范例列表")
    total: int = Field(..., description="总数")


class PaperTemplateCreateRequest(BaseModel):
    """创建范例请求

    功能：用户点击"保存"左侧的"范例"按钮时提交的请求
    使用场景：作业组卷工作台 -> 范例按钮
    """
    name: str = Field(..., min_length=1, max_length=100, description="范例名称")
    description: str | None = Field(default=None, max_length=500, description="范例说明")
    page_config: dict = Field(..., description="要保存的格式信息（来自当前作业的 page_config）")
