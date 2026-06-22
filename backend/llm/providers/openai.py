"""
OpenAI 兼容适配器

功能：封装通用 OpenAI 兼容 API 调用（含视觉模型支持）
输入参数：api_key / api_base / model
返回值：OpenAIProvider / OpenAIVisionProvider 实例
使用场景：调用 OpenAI 兼容服务商进行 AI 推理
"""
import httpx
from typing import AsyncGenerator

from llm.providers.base import BaseLLMProvider


class OpenAIProvider(BaseLLMProvider):
    """通用 OpenAI 兼容 API 适配器 — 适用于所有预设服务商"""

    provider_name = "OpenAI"  # 供应商名称

    def __init__(self, api_key: str, api_base: str, model: str = ""):
        super().__init__(api_key=api_key, api_base=api_base, model=model)

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
                f"{self.api_base}/chat/completions",
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
                f"{self.api_base}/chat/completions",
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


class OpenAIVisionProvider(OpenAIProvider):
    """
    通用 OpenAI 兼容视觉 API 适配器 — 支持图片输入

    功能：在 OpenAI 兼容接口基础上，增加多模态图片输入支持
    输入参数：api_key / api_base / model
    返回值：OpenAIVisionProvider 实例
    使用场景：OCR 识别、VLM 语义理解等需要图片输入的场景
    """

    provider_name = "OpenAIVision"  # 供应商名称

    async def chat_with_image(
        self,
        system_prompt: str,
        user_prompt: str,
        image_base64: str = "",
        image_url: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        """
        带图片的对话接口

        Args:
            system_prompt: 系统提示词
            user_prompt: 用户提示词
            image_base64: 图片 base64 编码
            image_url: 图片 URL
            temperature: 温度参数
            max_tokens: 最大 Token 数

        Returns:
            AI 响应文本
        """
        # 构建多模态 content
        content_parts = [{"type": "text", "text": user_prompt}]  # 文本部分

        if image_base64:
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{image_base64}"}
            })
        elif image_url:
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": image_url}
            })

        messages = []  # 构建消息列表
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": content_parts})

        async with httpx.AsyncClient(timeout=120) as client:  # 创建异步 HTTP 客户端
            resp = await client.post(
                f"{self.api_base}/chat/completions",
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