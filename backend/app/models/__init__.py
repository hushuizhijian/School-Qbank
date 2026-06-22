"""
模型模块初始化

功能：导入所有模型类，确保 SQLAlchemy 能发现所有表定义
输入参数：无
返回值：无
使用场景：数据库初始化时需要导入此模块以注册所有表
"""
from app.models.user import User
from app.models.paper import Paper
from app.models.question import Question
from app.models.knowledge_point import KnowledgePoint
from app.models.question_knowledge import QuestionKnowledge
from app.models.homework import Homework
from app.models.homework_question import HomeworkQuestion
from app.models.export_record import ExportRecord
from app.models.ai_provider import AIProvider
from app.models.tenant_provider import TenantModelProvider
from app.models.provider_instance import ProviderInstance
from app.models.instance_model import InstanceModel
from app.models.system_setting import SystemSetting
from app.models.paper_template import PaperTemplate

__all__ = [
    "User",
    "Paper",
    "Question",
    "KnowledgePoint",
    "QuestionKnowledge",
    "Homework",
    "HomeworkQuestion",
    "ExportRecord",
    "AIProvider",
    "TenantModelProvider",
    "ProviderInstance",
    "InstanceModel",
    "SystemSetting",
    "PaperTemplate",
]
