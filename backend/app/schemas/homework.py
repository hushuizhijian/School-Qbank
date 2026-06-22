"""
作业 Schema

功能：定义作业相关的请求/响应数据结构
输入参数：无（Pydantic 模型定义）
返回值：HomeworkQuestionItem / HomeworkResponse / HomeworkListResponse 等类
使用场景：作业创建、编辑、查询、题目排序
"""
from pydantic import BaseModel
from datetime import datetime


class HomeworkQuestionItem(BaseModel):
    """
    作业题目项

    功能：定义作业中单个题目的信息
    输入参数：题目关联信息和题目内容
    返回值：作业题目项对象
    使用场景：作业详情中的题目列表
    """
    id: str  # 关联ID
    question_id: str  # 题目ID
    sort_order: int  # 排序序号
    score: int  # 分值
    is_required: bool  # 是否必做
    stem: str = ""  # 题干
    question_type: str = "general"  # 题型
    question_no: int = 0  # 题号
    options: list = []  # 选项列表
    answer: str | None = None  # 答案

    model_config = {"from_attributes": True}  # 支持从ORM对象转换


class HomeworkResponse(BaseModel):
    """
    作业响应

    功能：定义作业详情的返回格式
    输入参数：作业各字段
    返回值：作业响应对象
    使用场景：作业详情查询
    """
    id: str  # 作业ID
    title: str  # 作业标题
    subject: str | None = None  # 学科
    grade: str | None = None  # 年级
    total_score: int = 0  # 总分
    status: str = "draft"  # 状态
    page_config: dict = {}  # 页面配置
    created_at: datetime  # 创建时间
    updated_at: datetime  # 更新时间
    questions: list[HomeworkQuestionItem] = []  # 题目列表

    model_config = {"from_attributes": True}  # 支持从ORM对象转换


class HomeworkListResponse(BaseModel):
    """
    作业列表响应

    功能：定义作业列表的返回格式
    输入参数：homework（作业列表）、total（总数）
    返回值：作业列表响应对象
    使用场景：作业列表查询接口
    """
    homework: list[HomeworkResponse]  # 作业列表
    total: int  # 总数


class HomeworkCreateRequest(BaseModel):
    """
    作业创建请求

    功能：定义创建作业的请求参数
    输入参数：title（作业标题，可选）、paper_id（来源试卷ID，可选）、
             subject/grade（学科年级）、page_config（页面配置，可选）
    返回值：作业创建请求对象
    使用场景：从试卷或独立创建作业
    """
    title: str | None = None  # 作业标题（直接创建时可指定）
    paper_id: str | None = None  # 来源试卷ID（从试卷创建时必填）
    subject: str | None = None  # 学科
    grade: str | None = None  # 年级
    page_config: dict | None = None  # 页面配置


class HomeworkUpdateRequest(BaseModel):
    """
    作业更新请求

    功能：定义更新作业的请求参数
    输入参数：title、subject、grade、page_config 等可选字段
    返回值：作业更新请求对象
    使用场景：编辑作业信息
    """
    title: str | None = None  # 作业标题
    subject: str | None = None  # 学科
    grade: str | None = None  # 年级
    total_score: int | None = None  # 总分
    page_config: dict | None = None  # 页面配置


class AddQuestionRequest(BaseModel):
    """
    添加题目请求

    功能：定义向作业添加题目的请求参数
    输入参数：question_id、score
    返回值：添加题目请求对象
    使用场景：向作业中添加题目
    """
    question_id: str  # 题目ID
    score: int = 0  # 分值


class ReorderRequest(BaseModel):
    """
    题目排序请求

    功能：定义作业题目重新排序的请求参数
    输入参数：question_ids（按新顺序排列的ID列表）
    返回值：排序请求对象
    使用场景：拖拽排序作业题目
    """
    question_ids: list[str]  # 按新顺序排列的 homework_question id 列表


class SetScoreRequest(BaseModel):
    """
    设置分值请求

    功能：定义设置题目分值的请求参数
    输入参数：score（分值）
    返回值：设置分值请求对象
    使用场景：修改作业中某题的分值
    """
    score: int  # 分值
