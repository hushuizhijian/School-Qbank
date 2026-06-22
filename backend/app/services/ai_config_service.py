"""
AI 服务商配置服务

功能：AI服务商列表/创建/删除/更新/连接测试
输入参数：db会话 / provider配置参数
返回值：服务商信息 / 连接测试结果
使用场景：AI服务商配置管理
"""
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import time
import httpx

from app.models.ai_provider import AIProvider


async def list_enabled(db: AsyncSession) -> list[dict]:
    """获取所有 AI 服务商"""
    q = select(AIProvider)
    result = await db.execute(q)
    items = result.scalars().all()
    return [{
        "id": p.id,
        "provider_name": p.provider_name,
        "api_base": p.api_base,
        "api_key": p.api_key,
        "model_list": p.model_list,
        "is_enabled": p.is_enabled,
    } for p in items]


async def create(db: AsyncSession, provider_name: str, api_base: str, api_key: str,
                 model_list: list[str] = None) -> dict:
    """新增 AI 服务商配置"""
    existing = await db.execute(select(AIProvider).where(AIProvider.provider_name == provider_name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="服务商名称已存在")

    p = AIProvider(
        provider_name=provider_name,
        api_base=api_base,
        api_key=api_key,
        model_list=model_list or [],
    )
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return {"id": p.id, "provider_name": p.provider_name, "is_enabled": p.is_enabled}


async def delete(db: AsyncSession, provider_id: str) -> None:
    """删除 AI 服务商"""
    p = await db.get(AIProvider, provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="服务商不存在")
    await db.delete(p)
    await db.commit()


async def update(db: AsyncSession, provider_id: str,
                 api_key: str = None, is_enabled: bool = None,
                 model_list: list[str] = None) -> dict:
    """更新 AI 服务商配置（API Key、启用状态、模型列表）"""
    p = await db.get(AIProvider, provider_id)
    if not p:
        raise HTTPException(status_code=404, detail="服务商不存在")

    # 仅更新传入的字段
    if api_key is not None:
        p.api_key = api_key
    if is_enabled is not None:
        p.is_enabled = is_enabled
    if model_list is not None:
        p.model_list = model_list

    await db.commit()
    await db.refresh(p)
    return {
        "id": p.id,
        "provider_name": p.provider_name,
        "api_key": p.api_key,
        "is_enabled": p.is_enabled,
        "model_list": p.model_list,
    }


async def test_connection(api_base: str, api_key: str, model: str) -> dict:
    """测试AI服务商连接 — 发送简单chat completion请求验证"""
    try:
        start = time.time()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{api_base.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": "Hi"}],
                    "max_tokens": 5,
                    "temperature": 0,
                },
            )
        latency_ms = int((time.time() - start) * 1000)

        if resp.status_code == 200:
            return {"success": True, "message": "连接成功", "latency_ms": latency_ms}
        else:
            try:
                detail = resp.json().get("error", {}).get("message", resp.text[:200])
            except Exception:
                detail = resp.text[:200]
            return {"success": False, "message": f"连接失败: {detail}", "latency_ms": latency_ms}
    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时（30秒）", "latency_ms": 30000}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)[:200]}", "latency_ms": 0}


class AIConfigService:
    """AI 配置服务类 — 用于 API 路由调用"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_providers(self) -> list[dict]:
        """获取所有 AI 提供商列表"""
        return await list_enabled(self.db)

    async def list_models(self, provider_id: str) -> list[dict]:
        """获取指定供应商的模型列表"""
        p = await self.db.get(AIProvider, provider_id)
        if not p:
            raise HTTPException(status_code=404, detail="服务商不存在")

        models = p.model_list or []
        return [
            {
                "id": f"{p.id}:{m}",
                "provider_id": p.id,
                "model_key": m,
                "name": m,
                "max_tokens": 4096,
                "supports_vision": "V" in m or "vision" in m.lower() or "4v" in m.lower(),
                "supports_function_calling": True,
                "is_active": True,
            }
            for m in models
        ]
