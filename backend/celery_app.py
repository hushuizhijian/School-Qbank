"""
Celery 应用配置

功能：配置Celery异步任务队列
输入参数：无（从settings读取Redis URL）
返回值：celery_app 实例
使用场景：异步任务调度（解析/AI/导出）
"""
from celery import Celery
from app.config import settings

celery_app = Celery(
    "math_question_bank",
    broker=settings.redis_url,
    backend=settings.redis_url,
)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
