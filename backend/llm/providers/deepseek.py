"""
DeepSeek 适配器

功能：封装 DeepSeek Chat API 调用
输入参数：api_key / api_base / model
返回值：DeepSeekProvider 实例
使用场景：调用 DeepSeek 模型进行 AI 推理
"""
import httpx
from typing import AsyncGenerator

from app.config import settings
from llm.providers.base import BaseLLMProvider


class DeepSeekProvider(BaseLLMProvider):
    """DeepSeek Chat API 适配器"""

    provider_name = "DeepSeek"  # 供应商名称

    def __init__(self, api_key: str = "", api_base: str = "", model: str = "deepseek-chat"):
        super().__init__(
            api_key=api_key or settings.deepseek_api_key,
            api_base=api_base or settings.deepseek_base_url,
            model=model,
        )

    async def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        """通用对话接口"""
        messages = []  # 构建消息列表
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        async with httpx.AsyncClient(timeout=60) as client:  # 创建异步 HTTP 客户端
            resp = await client.post(
                f"{self.api_base}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()  # 检查 HTTP 状态
            return resp.json()["choices"][0]["message"]["content"]  # 提取响应内容

    async def chat_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> AsyncGenerator[str, None]:
        """流式对话接口"""
        messages = []  # 构建消息列表
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        async with httpx.AsyncClient(timeout=120) as client:  # 创建异步 HTTP 客户端
            async with client.stream(
                "POST",
                f"{self.api_base}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()  # 检查 HTTP 状态
                async for line in resp.aiter_lines():  # 逐行读取流
                    if line.startswith("data: "):
                        data = line[6:]  # 去除 "data: " 前缀
                        if data == "[DONE]":
                            break
                        try:
                            import json
                            chunk = json.loads(data)
                            delta = chunk["choices"][0].get("delta", {})
                            if "content" in delta:
                                yield delta["content"]
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue