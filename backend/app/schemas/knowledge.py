"""
知识点 Schema（V2新增）

功能：定义知识点相关的请求/响应数据结构，支持树形结构展示
输入参数：无（Pydantic 模型定义）
返回值：KnowledgePointBase / KnowledgeTreeResponse / KnowledgeSearchResult 类
使用场景：知识点树查询、知识点搜索、题目关联知识点
"""
from pydantic import BaseModel
from typing import Optional, List


class KnowledgePointBase(BaseModel):
    """
    知识点基础信息

    功能：定义知识点的基础数据结构
    输入参数：知识点各字段
    返回值：知识点信息对象
    使用场景：知识点详情、知识点列表
    """
    id: str  # 知识点ID
    name: str  # 中文名称
    code: str  # 内部编码
    parent_id: Optional[str] = None  # 父节点ID
    level: int  # 层级深度
    subject: str = "数学"  # 学科
    grade: Optional[str] = None  # 年级
    semester: Optional[str] = None  # 学期
    sort_order: int = 0  # 排序序号
    children_count: int = 0  # 子节点数量
    question_count: int = 0  # 关联题目数量

    model_config = {"from_attributes": True}  # 支持从ORM对象转换


class KnowledgeTreeResponse(BaseModel):
    """
    知识点树响应

    功能：定义知识点树的返回格式
    输入参数：tree（知识点树列表）
    返回值：知识点树响应对象
    使用场景：知识点树查询接口
    """
    tree: List[KnowledgePointBase]  # 知识点树（含嵌套子节点）


class KnowledgeSearchResult(BaseModel):
    """
    知识点搜索结果

    功能：定义知识点搜索的返回格式
    输入参数：items（搜索结果列表）、total（总数）
    返回值：知识点搜索结果对象
    使用场景：知识点搜索接口
    """
    items: List[KnowledgePointBase]  # 搜索结果列表
    total: int  # 总数
