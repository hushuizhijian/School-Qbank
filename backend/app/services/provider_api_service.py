"""
供应商API服务层 - 参照 ragflow 的 provider_api_service.py

功能：供应商注册表加载、列表、添加、删除、实例管理、API Key验证
输入参数：数据库会话、供应商名称、实例配置等
返回值：供应商信息、实例列表、验证结果
使用场景：AI供应商配置API的后端逻辑
"""
import json
import time
from pathlib import Path
from typing import Optional

import httpx
from fastapi import HTTPException
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant_provider import TenantModelProvider
from app.models.provider_instance import ProviderInstance
from app.models.instance_model import InstanceModel

# 配置文件路径：backend/conf/llm_factories.json
FACTORY_CONFIG_PATH = Path(__file__).parent.parent.parent / "conf" / "llm_factories.json"

# 特殊供应商：不需要 LLM 验证，走自定义验证逻辑
SPECIAL_PROVIDERS = ["MinerU", "PaddleOCR", "OpenDataLoader"]


# ====== 配置加载 ======

def load_factory_infos() -> dict:
    """从 llm_factories.json 加载供应商注册表"""
    if not FACTORY_CONFIG_PATH.exists():
        return {"factory_llm_infos": []}
    with open(FACTORY_CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _factory_model_types(llm: dict) -> list[str]:
    """从 llm 条目中提取 model_type 列表"""
    model_type = llm.get("model_type")
    if isinstance(model_type, list):
        return model_type
    return [model_type] if model_type else []


def _factory_llm_name(llm: dict) -> str:
    """获取模型名称"""
    return llm.get("name") or llm.get("llm_name", "")


def _to_int(v, default=500):
    """安全转整数"""
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


# ====== 供应商管理 ======

async def list_providers(
    db: AsyncSession,
    tenant_id: str = "default",
    available_only: bool = False
) -> list[dict]:
    """
    列出供应商 - 参照 ragflow 的 list_providers

    功能：
      - available_only=True：列出系统注册表中所有可用的供应商（ragflow 格式）
      - available_only=False：列出当前租户已添加的供应商及其实例
    """
    if available_only:
        # 列出系统注册表中所有可用的供应商（参照 ragflow 格式）
        factory = load_factory_infos()
        factory_rank_mapping = {
            f["name"]: -_to_int(f.get("rank", "500"))
            for f in factory.get("factory_llm_infos", [])
        }

        # 需要排除的供应商
        excluded = ["Youdao", "FastEmbed", "BAAI", "Builtin", "siliconflow_intl"]

        providers = []
        for factory_info in factory.get("factory_llm_infos", []):
            if factory_info["name"] in excluded:
                continue

            # 从 llm 列表中提取 model_type
            model_types = sorted(set(
                model_type
                for llm in factory_info.get("llm", [])
                for model_type in _factory_model_types(llm)
            )) if factory_info.get("llm", []) else []

            # 特殊供应商添加 ocr 类型
            if factory_info["name"] in SPECIAL_PROVIDERS:
                if "ocr" not in model_types:
                    model_types.append("ocr")

            provider = {
                "model_types": model_types,
                "name": factory_info["name"],
                "url": {
                    "default": factory_info.get("url", "")
                }
            }

            # 特殊处理 siliconflow 和 Tongyi-Qianwen 的多 URL
            if factory_info["name"].lower() == "siliconflow":
                factory_map = {f["name"]: f for f in factory.get("factory_llm_infos", [])}
                provider["url"]["intl"] = factory_map.get("siliconflow_intl", {}).get("url", "https://api.siliconflow.com/v1")
            elif factory_info["name"] == "Tongyi-Qianwen":
                provider["url"]["intl"] = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"

            providers.append(provider)

        # 按 rank 排序
        providers.sort(key=lambda x: (factory_rank_mapping.get(x["name"], 0), x["name"]))
        return providers

    # 列出当前租户已添加的供应商
    q = select(TenantModelProvider).where(
        TenantModelProvider.tenant_id == tenant_id
    )
    result = await db.execute(q)
    tenant_providers = result.scalars().all()

    provider_list = []
    for p in tenant_providers:
        instance_q = select(ProviderInstance).where(
            ProviderInstance.provider_id == p.id
        )
        instance_result = await db.execute(instance_q)
        instances = instance_result.scalars().all()

        provider_list.append({
            "id": p.id,
            "name": p.provider_name,
            "tenant_id": p.tenant_id,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "instance_count": len(instances),
            "instances": [
                {
                    "id": inst.id,
                    "instance_name": inst.instance_name,
                    "api_key": inst.api_key,
                    "status": inst.status,
                    "created_at": inst.created_at.isoformat() if inst.created_at else None,
                }
                for inst in instances
            ],
        })

    return provider_list


async def add_provider(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str
) -> dict:
    """租户添加一个系统供应商（自动从系统环境配置中创建默认实例）"""
    factory = load_factory_infos()
    provider_names = [f["name"] for f in factory.get("factory_llm_infos", [])]
    if provider_name not in provider_names:
        raise HTTPException(status_code=400, detail=f"供应商 '{provider_name}' 不在系统注册表中")

    existing_q = select(TenantModelProvider).where(
        TenantModelProvider.tenant_id == tenant_id,
        TenantModelProvider.provider_name == provider_name
    )
    existing_result = await db.execute(existing_q)
    existing_record = existing_result.scalar_one_or_none()

    if existing_record:
        # 已存在时，仅在该供应商下没有实例的情况下创建默认实例
        instance_q = select(ProviderInstance).where(ProviderInstance.provider_id == existing_record.id)
        instance_result = await db.execute(instance_q)
        if not instance_result.scalar_one_or_none():
            await _create_default_instance(db, existing_record, provider_name)
            await db.commit()
        return {"message": "供应商已添加"}

    record = TenantModelProvider(
        tenant_id=tenant_id,
        provider_name=provider_name,
    )
    db.add(record)
    await db.flush()  # 获取 record.id

    # 自动从系统环境配置创建默认实例（如果有硬编码 key）
    await _create_default_instance(db, record, provider_name)

    await db.commit()
    await db.refresh(record)

    return {
        "id": record.id,
        "tenant_id": record.tenant_id,
        "provider_name": record.provider_name,
        "created_at": record.created_at.isoformat() if record.created_at else None,
    }


async def _create_default_instance(
    db: AsyncSession,
    provider_record: TenantModelProvider,
    provider_name: str
) -> ProviderInstance | None:
    """
    从系统环境配置创建默认实例

    功能：根据供应商名称从 settings 中读取硬编码的 key，自动创建一个名为 default 的实例
    输入参数：db、provider_record、provider_name
    返回值：创建的 ProviderInstance（如无系统配置则返回 None）
    使用场景：add_provider 时的自动初始化
    """
    from app.config import settings

    api_key = ""
    base_url = ""
    extra_data = {}

    # 系统内置供应商的默认 key
    if provider_name == "DeepSeek":
        if settings.deepseek_api_key and settings.deepseek_api_key != "sk-placeholder":
            api_key = settings.deepseek_api_key
            base_url = settings.deepseek_base_url
    elif provider_name == "智谱AI" or provider_name == "ZHIPU-AI":
        # 智谱暂未硬编码，留作扩展
        api_key = ""
    elif provider_name == "MinerU":
        if settings.mineru_token:
            api_key = settings.mineru_token
    # 其他供应商暂不自动注入

    if not api_key:
        return None

    # 检查是否已有同名实例
    existing_q = select(ProviderInstance).where(
        ProviderInstance.provider_id == provider_record.id,
        ProviderInstance.instance_name == "default"
    )
    existing_result = await db.execute(existing_q)
    if existing_result.scalar_one_or_none():
        return None

    if base_url:
        extra_data["base_url"] = base_url

    instance = ProviderInstance(
        provider_id=provider_record.id,
        instance_name="default",
        api_key=api_key,
        extra=json.dumps(extra_data),
    )
    db.add(instance)
    await db.flush()
    return instance


async def migrate_existing_providers(db: AsyncSession, tenant_id: str) -> dict:
    """
    迁移已存在的供应商，为缺少实例的供应商自动注入系统默认 key，
    并为所有实例同步模型

    功能：扫描当前租户的所有 tenant_provider，对没有实例的供应商从 settings 创建默认实例，
          对所有实例（含已有和新创建）同步工厂配置中的模型
    输入参数：db、tenant_id
    返回值：迁移结果
    使用场景：升级系统时初始化已添加但无实例的供应商
    """
    q = select(TenantModelProvider).where(TenantModelProvider.tenant_id == tenant_id)
    result = await db.execute(q)
    records = result.scalars().all()

    created = []
    synced = 0
    for record in records:
        # 检查是否有实例
        instance_q = select(ProviderInstance).where(ProviderInstance.provider_id == record.id)
        instance_result = await db.execute(instance_q)
        instance = instance_result.scalar_one_or_none()

        if not instance:
            # 创建默认实例
            instance = await _create_default_instance(db, record, record.provider_name)
            if instance:
                created.append({"provider": record.provider_name, "instance": instance.instance_name})

        if instance:
            # 同步模型
            instance_id = instance.id
            model_count = await _sync_models_from_factory(db, instance_id, record.provider_name)
            synced += model_count

    await db.commit()
    return {"migrated_count": len(created), "created_instances": created, "synced_models": synced}


async def sync_models_for_instance(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str
) -> dict:
    """
    手动同步实例的模型列表

    功能：从工厂配置读取该供应商的模型，同步到实例的 InstanceModel 表
    输入参数：db、tenant_id、provider_name、instance_name
    返回值：同步结果
    使用场景：已有实例但没有模型时，手动触发同步
    """
    instance = await _get_instance_by_name(db, tenant_id, provider_name, instance_name)
    model_count = await _sync_models_from_factory(db, instance.id, provider_name)
    await db.commit()
    return {"synced_count": model_count, "instance_name": instance_name, "provider_name": provider_name}


async def delete_provider(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str
) -> None:
    """删除租户的供应商及其所有实例和模型"""
    q = select(TenantModelProvider).where(
        TenantModelProvider.tenant_id == tenant_id,
        TenantModelProvider.provider_name == provider_name
    )
    result = await db.execute(q)
    provider_record = result.scalar_one_or_none()

    if not provider_record:
        raise HTTPException(status_code=404, detail=f"供应商 '{provider_name}' 不存在")

    # 先删除该供应商下所有实例的模型
    instance_q = select(ProviderInstance).where(
        ProviderInstance.provider_id == provider_record.id
    )
    instance_result = await db.execute(instance_q)
    instances = instance_result.scalars().all()
    for inst in instances:
        delete_models_stmt = sa_delete(InstanceModel).where(
            InstanceModel.instance_id == inst.id
        )
        await db.execute(delete_models_stmt)

    # 删除该供应商下的所有实例
    delete_instances_stmt = sa_delete(ProviderInstance).where(
        ProviderInstance.provider_id == provider_record.id
    )
    await db.execute(delete_instances_stmt)

    await db.delete(provider_record)
    await db.commit()


async def show_provider(provider_name: str) -> dict:
    """查看供应商详情（从系统注册表）"""
    factory = load_factory_infos()
    for f in factory.get("factory_llm_infos", []):
        if f["name"] == provider_name:
            return {
                "name": f["name"],
                "logo": f.get("logo", ""),
                "tags": f.get("tags", ""),
                "url": f.get("url", ""),
                "status": f.get("status", "1"),
                "rank": f.get("rank", "999"),
                "llm": f.get("llm", []),
            }
    raise HTTPException(status_code=404, detail=f"供应商 '{provider_name}' 不存在")


async def list_provider_models(provider_name: str) -> list[dict]:
    """列出供应商的模型列表（从系统注册表）"""
    factory = load_factory_infos()
    for f in factory.get("factory_llm_infos", []):
        if f["name"] == provider_name:
            return f.get("llm", [])
    raise HTTPException(status_code=404, detail=f"供应商 '{provider_name}' 不存在")


# ====== 实例管理 ======

async def _sync_models_from_factory(
    db: AsyncSession,
    instance_id: str,
    provider_name: str
) -> int:
    """
    从工厂配置同步模型到实例的 InstanceModel 表

    功能：读取 llm_factories.json 中该供应商的所有模型，导入到 InstanceModel 表
          当 model_type 为数组时只取第一个 type，避免违反 (instance_id, model_name) 唯一约束
    输入参数：db、instance_id、provider_name
    返回值：导入的模型数量
    使用场景：create_provider_instance / update_instance_apikey 之后自动同步模型
    """
    factory = load_factory_infos()  # 加载工厂配置
    factory_llm = []
    for f in factory.get("factory_llm_infos", []):
        if f["name"] == provider_name:
            factory_llm = f.get("llm", [])  # 获取该供应商的模型列表
            break

    if not factory_llm:
        return 0  # 没有模型配置，直接返回

    # 查询该实例下所有已存在的模型名（用于去重）
    existing_q = select(InstanceModel.model_name).where(
        InstanceModel.instance_id == instance_id
    )
    existing_result = await db.execute(existing_q)
    existing_names: set[str] = {row[0] for row in existing_result.all()}

    # 批量插入模型记录（按 model_name 去重，避免唯一约束冲突）
    added_count = 0
    for llm in factory_llm:
        llm_name = llm.get("name") or llm.get("llm_name", "")  # 兼容两种命名
        if not llm_name:
            continue
        if llm_name in existing_names:
            continue  # 已存在，跳过

        model_type = llm.get("model_type", "chat")  # 模型类型
        max_tokens = llm.get("max_tokens", 0)  # 最大 token 数

        # 处理 model_type 为数组的情况：只取第一个 type，避免 (instance_id, model_name) 唯一约束冲突
        if isinstance(model_type, list):
            model_type = model_type[0] if model_type else "chat"

        model = InstanceModel(
            instance_id=instance_id,
            model_name=llm_name,
            model_type=model_type,
            max_tokens=max_tokens,
        )
        db.add(model)
        added_count += 1
        existing_names.add(llm_name)  # 防止本次循环内重复

    if added_count > 0:
        await db.flush()  # 刷新到数据库
    return added_count


async def create_provider_instance(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str,
    api_key: str,
    base_url: str = ""
) -> dict:
    """
    创建供应商实例

    功能：创建实例记录，并自动从工厂配置同步模型到 InstanceModel 表
    输入参数：db、tenant_id、provider_name、instance_name、api_key、base_url
    返回值：创建的实例信息
    使用场景：用户在前端弹窗配置 API Key 后保存
    """
    q = select(TenantModelProvider).where(
        TenantModelProvider.tenant_id == tenant_id,
        TenantModelProvider.provider_name == provider_name
    )
    result = await db.execute(q)
    provider_record = result.scalar_one_or_none()

    if not provider_record:
        raise HTTPException(status_code=404, detail=f"供应商 '{provider_name}' 尚未添加，请先添加供应商")

    extra_data = {}
    if base_url:
        extra_data["base_url"] = base_url
    extra_json = json.dumps(extra_data)

    instance = ProviderInstance(
        provider_id=provider_record.id,
        instance_name=instance_name,
        api_key=api_key,
        extra=extra_json,
    )
    db.add(instance)
    await db.flush()  # 获取 instance.id

    # 自动从工厂配置同步模型到实例
    model_count = await _sync_models_from_factory(db, instance.id, provider_name)

    await db.commit()
    await db.refresh(instance)

    return {
        "id": instance.id,
        "provider_id": instance.provider_id,
        "instance_name": instance.instance_name,
        "api_key": instance.api_key,
        "extra": json.loads(instance.extra) if instance.extra else {},
        "status": instance.status,
        "model_count": model_count,
        "created_at": instance.created_at.isoformat() if instance.created_at else None,
    }


async def list_provider_instances(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str
) -> list[dict]:
    """列出供应商的所有实例"""
    q = select(TenantModelProvider).where(
        TenantModelProvider.tenant_id == tenant_id,
        TenantModelProvider.provider_name == provider_name
    )
    result = await db.execute(q)
    provider_record = result.scalar_one_or_none()

    if not provider_record:
        raise HTTPException(status_code=404, detail=f"供应商 '{provider_name}' 尚未添加")

    instance_q = select(ProviderInstance).where(
        ProviderInstance.provider_id == provider_record.id
    )
    instance_result = await db.execute(instance_q)
    instances = instance_result.scalars().all()

    return [
        {
            "id": inst.id,
            "provider_id": inst.provider_id,
            "instance_name": inst.instance_name,
            "api_key": inst.api_key,
            "extra": json.loads(inst.extra) if inst.extra else {},
            "status": inst.status,
            "created_at": inst.created_at.isoformat() if inst.created_at else None,
        }
        for inst in instances
    ]


async def delete_provider_instances(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_names: list[str]
) -> None:
    """删除供应商的指定实例"""
    q = select(TenantModelProvider).where(
        TenantModelProvider.tenant_id == tenant_id,
        TenantModelProvider.provider_name == provider_name
    )
    result = await db.execute(q)
    provider_record = result.scalar_one_or_none()

    if not provider_record:
        raise HTTPException(status_code=404, detail=f"供应商 '{provider_name}' 尚未添加")

    delete_stmt = sa_delete(ProviderInstance).where(
        ProviderInstance.provider_id == provider_record.id,
        ProviderInstance.instance_name.in_(instance_names)
    )
    delete_result = await db.execute(delete_stmt)
    await db.commit()

    if delete_result.rowcount == 0:
        raise HTTPException(status_code=404, detail="未找到指定的实例")


async def update_instance_apikey(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str,
    api_key: str,
    base_url: str = ""
) -> dict:
    """
    更新实例的 API Key / Base URL

    功能：修改已存在实例的密钥和地址（用于切换或更新）
          如果实例没有模型，自动从工厂配置同步
    输入参数：db、tenant_id、provider_name、instance_name、api_key、base_url
    返回值：更新后的实例信息
    使用场景：用户点击 "API-Key" 按钮重新输入密钥
    """
    q = select(TenantModelProvider).where(
        TenantModelProvider.tenant_id == tenant_id,
        TenantModelProvider.provider_name == provider_name
    )
    result = await db.execute(q)
    provider_record = result.scalar_one_or_none()

    if not provider_record:
        raise HTTPException(status_code=404, detail=f"供应商 '{provider_name}' 尚未添加")

    instance_q = select(ProviderInstance).where(
        ProviderInstance.provider_id == provider_record.id,
        ProviderInstance.instance_name == instance_name
    )
    instance_result = await db.execute(instance_q)
    instance = instance_result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail=f"实例 '{instance_name}' 不存在")

    # 更新 API Key
    instance.api_key = api_key

    # 更新 base_url
    extra_data = {}
    if base_url:
        extra_data["base_url"] = base_url
    instance.extra = json.dumps(extra_data)

    await db.flush()  # 刷新实例修改

    # 如果实例没有模型，自动从工厂配置同步
    model_count = 0
    model_q = select(InstanceModel).where(InstanceModel.instance_id == instance.id)
    model_result = await db.execute(model_q)
    if not model_result.scalar_one_or_none():
        model_count = await _sync_models_from_factory(db, instance.id, provider_name)

    await db.commit()
    await db.refresh(instance)

    return {
        "id": instance.id,
        "instance_name": instance.instance_name,
        "api_key": instance.api_key,
        "extra": json.loads(instance.extra) if instance.extra else {},
        "status": instance.status,
        "model_count": model_count,
        "updated_at": instance.created_at.isoformat() if instance.created_at else None,
    }


# ====== API Key 验证 ======

# 供应商默认验证模型：避免使用 gpt-4o-mini 验证 DeepSeek 等不支持该模型名的供应商
PROVIDER_VERIFY_MODELS: dict[str, str] = {
    "OpenAI": "gpt-4o-mini",
    "DeepSeek": "deepseek-chat",
    "ZHIPU-AI": "glm-4-flash",
    "Tongyi-Qianwen": "qwen-turbo",
    "Moonshot": "moonshot-v1-8k",
    "Anthropic": "claude-3-haiku-20240307",
    "Gemini": "gemini-1.5-flash",
    "Mistral": "mistral-tiny",
    "Cohere": "command-light",
    "Groq": "llama-3.1-8b-instant",
    "TogetherAI": "meta-llama/Llama-3-8b-chat-hf",
    "xAI": "grok-beta",
    "StepFun": "step-1-8k",
    "Tencent Hunyuan": "hunyuan-pro",
    "BaiduYiyan": "ERNIE-Bot",
    "SILICONFLOW": "Qwen/Qwen2.5-7B-Instruct",
    "VolcEngine": "doubao-pro-32k",
    "讯飞星辰MaaS": "astron-code-latest",
    "MiniMax": "abab6.5s-chat",
    "Baichuan": "Baichuan2-Turbo",
    "Spark": "v1.1",
    "Jina": "jina-embeddings-v3",
    "Voyage": "voyage-3",
    "Replicate": "meta/meta-llama-3-8b-instruct",
    "OpenAI-API-Compatible": "gpt-4o-mini",
}


def get_default_verify_model(provider_name: str, factory_infos: dict | None = None) -> str:
    """
    获取供应商的默认验证模型

    功能：根据供应商名称选择合适的验证模型
    输入参数：provider_name（供应商名称）、factory_infos（可选的注册表）
    返回值：模型名称字符串
    使用场景：verify_api_key 调用
    """
    # 优先使用预定义映射
    if provider_name in PROVIDER_VERIFY_MODELS:
        return PROVIDER_VERIFY_MODELS[provider_name]

    # 其次从注册表取第一个 chat 模型
    if factory_infos is None:
        factory_infos = load_factory_infos()
    for f in factory_infos.get("factory_llm_infos", []):
        if f["name"] != provider_name:
            continue
        for llm in f.get("llm", []):
            llm_name = llm.get("name") or llm.get("llm_name", "")
            model_type = llm.get("model_type", "")
            # 优先选 chat 类型
            if model_type == "chat" or model_type == "chat" or model_type == "llm":
                return llm_name
        # 兜底返回第一个模型
        if f.get("llm"):
            return f["llm"][0].get("name") or f["llm"][0].get("llm_name", "gpt-4o-mini")

    # 兜底
    return "gpt-4o-mini"


async def verify_api_key(
    provider_name: str,
    api_key: str,
    base_url: str = "",
    model: str = ""
) -> dict:
    """
    验证 API Key / Token 是否有效

    功能：
      - 普通 LLM 供应商：发送 chat/completions 请求测试（model 可指定，默认按供应商选择）
      - MinerU：发送 /api/upload 请求测试 Token
      - 其他特殊供应商：简单 HEAD 请求测试
    """
    # MinerU 特殊验证：测试 Token 是否有效
    if provider_name == "MinerU":
        return await _verify_mineru_token(api_key)

    # PaddleOCR 特殊验证
    if provider_name == "PaddleOCR":
        return await _verify_paddleocr_token(api_key)

    # 通用 LLM 供应商验证
    if not model:
        model = get_default_verify_model(provider_name)
    return await _verify_llm_api_key(api_key, base_url, model)


async def _verify_mineru_token(token: str) -> dict:
    """
    验证 MinerU Token 是否有效

    功能：向 MinerU 官方 API 发送请求验证 Token
    输入参数：token（MinerU 令牌）
    返回值：{"success": bool, "message": str, "latency_ms": int}
    """
    try:
        start = time.time()

        # MinerU 官方 API 地址
        url = "https://mineru.net/api/v4/extract/parse"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, headers=headers)

        latency_ms = int((time.time() - start) * 1000)

        # 只要有正常响应（非 401/403）就认为 Token 有效
        if resp.status_code in (401, 403):
            return {"success": False, "message": "Token 无效或已过期，请检查", "latency_ms": latency_ms}
        elif resp.status_code < 500:
            return {"success": True, "message": "你的 API 密钥有效。", "latency_ms": latency_ms}
        else:
            return {"success": False, "message": f"服务暂时不可用（{resp.status_code}）", "latency_ms": latency_ms}

    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时（15秒），请检查网络", "latency_ms": 15000}
    except Exception as e:
        return {"success": False, "message": f"验证失败: {str(e)[:200]}", "latency_ms": 0}


async def _verify_paddleocr_token(token: str) -> dict:
    """验证 PaddleOCR Token"""
    try:
        start = time.time()
        url = "https://paddleocr.bj.bcebos.com/api/ocr"
        headers = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
        latency_ms = int((time.time() - start) * 1000)
        if resp.status_code in (401, 403):
            return {"success": False, "message": "Token 无效", "latency_ms": latency_ms}
        return {"success": True, "message": "你的 API 密钥有效。", "latency_ms": latency_ms}
    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时", "latency_ms": 10000}
    except Exception as e:
        return {"success": False, "message": f"验证失败: {str(e)[:200]}", "latency_ms": 0}


async def _verify_llm_api_key(api_key: str, base_url: str, model: str = "gpt-4o-mini") -> dict:
    """通用 LLM 供应商 API Key 验证（使用供应商对应的测试模型）"""
    try:
        start = time.time()
        url = f"{base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 5,
        }

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, headers=headers, json=body)

        latency_ms = int((time.time() - start) * 1000)

        if resp.status_code == 200:
            return {"success": True, "message": "你的 API 密钥有效。", "latency_ms": latency_ms}
        else:
            try:
                detail = resp.json().get("error", {}).get("message", resp.text[:200])
            except Exception:
                detail = resp.text[:200]
            return {"success": False, "message": f"验证失败: {detail}", "latency_ms": latency_ms}

    except httpx.TimeoutException:
        return {"success": False, "message": "连接超时（30秒）", "latency_ms": 30000}
    except Exception as e:
        return {"success": False, "message": f"验证失败: {str(e)[:200]}", "latency_ms": 0}


# ====== 实例模型管理 ======

async def show_provider_instance(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str
) -> dict:
    """查看供应商实例详情"""
    instance = await _get_instance_by_name(db, tenant_id, provider_name, instance_name)

    model_q = select(InstanceModel).where(InstanceModel.instance_id == instance.id)
    model_result = await db.execute(model_q)
    models = model_result.scalars().all()

    return {
        "id": instance.id,
        "instance_name": instance.instance_name,
        "api_key": instance.api_key,
        "base_url": json.loads(instance.extra).get("base_url", "") if instance.extra else "",
        "extra": json.loads(instance.extra) if instance.extra else {},
        "status": instance.status,
        "created_at": instance.created_at.isoformat() if instance.created_at else None,
        "models": [
            {
                "id": m.id,
                "model_name": m.model_name,
                "model_type": m.model_type,
                "max_tokens": m.max_tokens,
                "status": m.status,
            }
            for m in models
        ],
    }


async def list_instance_models(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str
) -> list[dict]:
    """列出实例下的所有模型"""
    instance = await _get_instance_by_name(db, tenant_id, provider_name, instance_name)

    model_q = select(InstanceModel).where(InstanceModel.instance_id == instance.id)
    result = await db.execute(model_q)
    models = result.scalars().all()

    return [
        {
            "id": m.id,
            "model_name": m.model_name,
            "model_type": m.model_type,
            "max_tokens": m.max_tokens,
            "status": m.status,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in models
    ]


async def add_instance_model(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str,
    model_name: str,
    model_type: str = "chat",
    max_tokens: int = 0
) -> dict:
    """为实例添加模型"""
    instance = await _get_instance_by_name(db, tenant_id, provider_name, instance_name)

    existing_q = select(InstanceModel).where(
        InstanceModel.instance_id == instance.id,
        InstanceModel.model_name == model_name
    )
    existing_result = await db.execute(existing_q)
    existing = existing_result.scalar_one_or_none()
    if existing:
        return {
            "id": existing.id,
            "model_name": existing.model_name,
            "model_type": existing.model_type,
            "max_tokens": existing.max_tokens,
            "status": existing.status,
        }

    model = InstanceModel(
        instance_id=instance.id,
        model_name=model_name,
        model_type=model_type,
        max_tokens=max_tokens,
    )
    db.add(model)
    await db.commit()
    await db.refresh(model)

    return {
        "id": model.id,
        "model_name": model.model_name,
        "model_type": model.model_type,
        "max_tokens": model.max_tokens,
        "status": model.status,
    }


async def edit_instance_model(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str,
    model_name: str,
    model_type: str | None = None,
    max_tokens: int | None = None
) -> dict:
    """编辑实例模型"""
    instance = await _get_instance_by_name(db, tenant_id, provider_name, instance_name)

    q = select(InstanceModel).where(
        InstanceModel.instance_id == instance.id,
        InstanceModel.model_name == model_name
    )
    result = await db.execute(q)
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 '{model_name}' 不存在")

    if model_type is not None:
        model.model_type = model_type
    if max_tokens is not None:
        model.max_tokens = max_tokens

    await db.commit()
    await db.refresh(model)

    return {
        "id": model.id,
        "model_name": model.model_name,
        "model_type": model.model_type,
        "max_tokens": model.max_tokens,
        "status": model.status,
    }


async def update_model_status(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str,
    model_name: str,
    status: str
) -> dict:
    """更新模型状态"""
    instance = await _get_instance_by_name(db, tenant_id, provider_name, instance_name)

    q = select(InstanceModel).where(
        InstanceModel.instance_id == instance.id,
        InstanceModel.model_name == model_name
    )
    result = await db.execute(q)
    model = result.scalar_one_or_none()
    if not model:
        raise HTTPException(status_code=404, detail=f"模型 '{model_name}' 不存在")

    model.status = status
    await db.commit()
    await db.refresh(model)

    return {
        "id": model.id,
        "model_name": model.model_name,
        "model_type": model.model_type,
        "status": model.status,
    }


async def delete_instance_model(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str,
    model_name: str
) -> None:
    """删除实例模型"""
    instance = await _get_instance_by_name(db, tenant_id, provider_name, instance_name)

    delete_stmt = sa_delete(InstanceModel).where(
        InstanceModel.instance_id == instance.id,
        InstanceModel.model_name == model_name
    )
    result = await db.execute(delete_stmt)
    await db.commit()

    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail=f"模型 '{model_name}' 不存在")


# ====== 内部辅助函数 ======

async def _get_instance_by_name(
    db: AsyncSession,
    tenant_id: str,
    provider_name: str,
    instance_name: str
) -> ProviderInstance:
    """根据供应商名称和实例名称查找实例"""
    q = select(TenantModelProvider).where(
        TenantModelProvider.tenant_id == tenant_id,
        TenantModelProvider.provider_name == provider_name
    )
    result = await db.execute(q)
    provider_record = result.scalar_one_or_none()
    if not provider_record:
        raise HTTPException(status_code=404, detail=f"供应商 '{provider_name}' 尚未添加")

    instance_q = select(ProviderInstance).where(
        ProviderInstance.provider_id == provider_record.id,
        ProviderInstance.instance_name == instance_name
    )
    instance_result = await db.execute(instance_q)
    instance = instance_result.scalar_one_or_none()
    if not instance:
        raise HTTPException(status_code=404, detail=f"实例 '{instance_name}' 不存在")

    return instance