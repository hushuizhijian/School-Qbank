"""
智谱AI 适配器

功能：封装智谱AI（GLM系列）API 调用
输入参数：api_key / api_base / model
返回值：ZhipuProvider 实例
使用场景：调用智谱GLM模型进行 AI 推理
"""
import httpx
from typing import AsyncGenerator

from llm.providers.openai import OpenAIProvider


class ZhipuProvider(OpenAIProvider):
    """智谱AI API 适配器 — 继承 OpenAI 兼容接口"""

    provider_name = "智谱AI"  # 供应商名称

    def __init__(self, api_key: str, api_base: str = "", model: str = "glm-4-flash"):
        super().__init__(
            api_key=api_key,
            api_base=api_base or "https://open.bigmodel.cn/api/paas/v4",
            model=model,
        )