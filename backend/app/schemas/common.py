"""
通用 Schema 定义（V2新增）

功能：定义分页参数、分页响应、统一API响应等通用数据结构
输入参数：无（Pydantic 模型定义）
返回值：PaginationParams / PaginatedResponse / ApiResponse 类
使用场景：所有API接口的统一分页和响应格式
"""
from pydantic import BaseModel
from typing import TypeVar, Generic, List, Optional

T = TypeVar('T')


class PaginationParams(BaseModel):
    """
    分页参数

    功能：定义分页查询的基础参数
    输入参数：page（页码）、page_size（每页数量）
    返回值：分页参数对象
    使用场景：列表查询接口的分页参数
    """
    page: int = 1  # 页码，从1开始
    page_size: int = 20  # 每页数量


class PaginatedResponse(BaseModel, Generic[T]):
    """
    分页响应

    功能：定义分页查询的统一响应格式
    输入参数：items（数据列表）、total（总数）、page（页码）、page_size（每页数量）
    返回值：分页响应对象
    使用场景：列表查询接口的返回值
    """
    items: List[T]  # 数据列表
    total: int  # 总记录数
    page: int  # 当前页码
    page_size: int  # 每页数量


class ApiResponse(BaseModel, Generic[T]):
    """
    统一API响应

    功能：定义所有API接口的统一响应格式
    输入参数：code（状态码）、message（消息）、data（数据）
    返回值：API响应对象
    使用场景：所有API接口的返回值包装
    """
    code: int = 0  # 状态码，0=成功
    message: str = "success"  # 响应消息
    data: Optional[T] = None  # 响应数据
