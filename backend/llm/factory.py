"""
LLM 模型工厂 — 统一调度所有 AI 供应商

功能：根据供应商名称动态创建适配器实例，管理适配器缓存
输入参数：provider_name / api_key / api_base / model
返回值：BaseLLMProvider 实例
使用场景：所有需要调用 LLM 的地方，通过工厂获取适配器
"""
import json
from pathlib import Path
from typing import TYPE_CHECKING

from llm.providers.base import BaseLLMProvider
from llm.providers.openai import OpenAIProvider, OpenAIVisionProvider
from llm.providers.deepseek import DeepSeekProvider
from llm.providers.zhipu import ZhipuProvider

from app.config import settings

# 运行时需要 AsyncSession 用于函数签名，不再限定 TYPE_CHECKING
from sqlalchemy.ext.asyncio import AsyncSession


# ====== 适配器注册表 ======

# 供应商名称 → 适配器类
PROVIDER_REGISTRY: dict[str, type[BaseLLMProvider]] = {
    "OpenAI": OpenAIProvider,
    "DeepSeek": DeepSeekProvider,
    "智谱AI": ZhipuProvider,
    # 讯飞星辰 MaaS 走 OpenAI 兼容协议（v2 域名下 chat/completions 端点），复用 OpenAIProvider
    "讯飞星辰MaaS": OpenAIProvider,
}

# 适配器实例缓存
_provider_cache: dict[str, BaseLLMProvider] = {}

# 模型工厂配置路径：backend/conf/llm_factories.json
CONF_DIR = Path(__file__).parent.parent / "conf"  # backend/conf/ 目录


# ====== 配置加载 ======

def load_factory_config() -> dict:
    """
    加载 llm_factories.json 配置

    Returns:
        工厂配置字典
    """
    config_path = CONF_DIR / "llm_factories.json"  # 配置文件路径
    if not config_path.exists():
        # 配置文件不存在时返回默认配置
        return _get_default_factory_config()
    with open(config_path, "r", encoding="utf-8") as f:  # 以 UTF-8 编码打开
        return json.load(f)


def _get_default_factory_config() -> dict:
    """
    获取默认工厂配置（内置 DeepSeek + 智谱AI）

    Returns:
        默认配置字典
    """
    return {
        "factory_llm_infos": [
            {
                "name": "DeepSeek",
                "logo": "",
                "tags": "LLM,CHAT",
                "status": "1",
                "url": "https://api.deepseek.com/v1",
                "llm": [
                    {
                        "llm_name": "deepseek-chat",
                        "tags": "LLM,CHAT,128k",
                        "max_tokens": 131072,
                        "model_type": "chat",
                    },
                    {
                        "llm_name": "deepseek-reasoner",
                        "tags": "LLM,CHAT,128k",
                        "max_tokens": 131072,
                        "model_type": "chat",
                    },
                ],
            },
            {
                "name": "智谱AI",
                "logo": "",
                "tags": "LLM,CHAT,VISION",
                "status": "1",
                "url": "https://open.bigmodel.cn/api/paas/v4",
                "llm": [
                    {
                        "llm_name": "glm-4-flash",
                        "tags": "LLM,CHAT,128k",
                        "max_tokens": 131072,
                        "model_type": "chat",
                    },
                    {
                        "llm_name": "glm-4v-flash",
                        "tags": "LLM,CHAT,VISION,128k",
                        "max_tokens": 131072,
                        "model_type": "image2text",
                    },
                ],
            },
            {
                # 讯飞星辰 MaaS Coding Plan：OpenAI 兼容协议，用户填 API Key + 选模型
                "name": "讯飞星辰MaaS",
                "logo": "",
                "tags": "LLM,CHAT",
                "status": "1",
                "url": "https://maas-coding-api.cn-huabei-1.xf-yun.com/v2",
                "llm": [
                    {
                        "llm_name": "astron-code-latest",
                        "tags": "LLM,CHAT",
                        "max_tokens": 32768,
                        "model_type": "chat",
                    }
                ],
            },
        ]
    }


# ====== 查询接口 ======

def list_factories() -> list[dict]:
    """
    列出所有可用的 AI 供应商

    Returns:
        供应商列表
    """
    config = load_factory_config()  # 加载配置
    return [
        {
            "name": f["name"],
            "logo": f["logo"],
            "tags": f["tags"],
            "url": f["url"],
            "status": f["status"],
        }
        for f in config["factory_llm_infos"]
    ]


def list_models(provider_name: str) -> list[dict]:
    """
    列出指定供应商的可用模型

    Args:
        provider_name: 供应商名称

    Returns:
        模型列表
    """
    config = load_factory_config()  # 加载配置
    for f in config["factory_llm_infos"]:
        if f["name"] == provider_name:
            return f["llm"]
    return []


# ====== 核心调度 ======

def get_provider(
    provider_name: str,
    api_key: str = "",
    api_base: str = "",
    model: str = "",
) -> BaseLLMProvider | None:
    """
    获取 AI 供应商适配器实例（带缓存）

    Args:
        provider_name: 供应商名称（如 "DeepSeek"、"OpenAI"）
        api_key: API 密钥
        api_base: API 基础地址（可选，默认使用配置中的地址）
        model: 模型名称（可选，默认使用供应商的第一个模型）

    Returns:
        BaseLLMProvider 实例，如果供应商不存在或 API Key 无效则返回 None
    """
    # 优先使用环境变量配置
    if provider_name == "deepseek" or provider_name == "DeepSeek":
        if not api_key:
            api_key = settings.deepseek_api_key  # 从配置中获取
        if not api_key:
            return None
        if not model:
            model = "deepseek-chat"  # 默认模型
        provider_name = "DeepSeek"  # 标准化名称

    # 缓存键
    cache_key = f"{provider_name}:{api_key}:{api_base}:{model}"

    if cache_key in _provider_cache:
        return _provider_cache[cache_key]  # 返回缓存实例

    # 如果供应商在注册表中，使用专用适配器
    if provider_name in PROVIDER_REGISTRY:
        # 从配置中获取默认 API Base
        if not api_base:
            config = load_factory_config()  # 加载配置
            for f in config["factory_llm_infos"]:
                if f["name"] == provider_name:
                    api_base = f["url"]  # 使用配置中的地址
                    break

        provider_cls = PROVIDER_REGISTRY[provider_name]
        instance = provider_cls(
            api_key=api_key,
            api_base=api_base,
            model=model,
        )
        _provider_cache[cache_key] = instance  # 缓存实例
        return instance

    # 用户自定义供应商：使用通用 OpenAI 兼容适配器
    if api_key and api_base:
        instance = OpenAIProvider(
            api_key=api_key,
            api_base=api_base,
            model=model,
        )
        _provider_cache[cache_key] = instance  # 缓存实例
        return instance

    return None


async def get_first_available_provider(db=None) -> BaseLLMProvider | None:
    """
    获取第一个可用的AI服务商（用于系统级AI功能）

    查找顺序：
    1) provider_instances（新系统，租户已配置的实例，含 base_url 和 API Key）
    2) ai_providers（旧表，遗留数据）
    3) .env 中的 DEEPSEEK_API_KEY（兜底）

    Args:
        db: 数据库会话

    Returns:
        BaseLLMProvider 实例，没有可用服务商时返回 None
    """
    # 1) 优先从 provider_instances（新系统）取第一个 active 实例
    if db:
        try:
            from app.models.tenant_provider import TenantModelProvider
            from app.models.provider_instance import ProviderInstance
            from app.models.instance_model import InstanceModel
            from sqlalchemy import select

            # 找第一个有 active chat 模型的供应商实例
            q = (
                select(TenantModelProvider, ProviderInstance, InstanceModel)
                .join(ProviderInstance, ProviderInstance.provider_id == TenantModelProvider.id)
                .join(InstanceModel, InstanceModel.instance_id == ProviderInstance.id)
                .where(
                    ProviderInstance.status == "active",
                    InstanceModel.status == "active",
                    InstanceModel.model_type == "chat",  # 仅取 chat 类模型用于对话补全
                )
                .order_by(TenantModelProvider.created_at, ProviderInstance.created_at, InstanceModel.created_at)
                .limit(1)
            )
            row = (await db.execute(q)).first()
            if row is not None:
                tenant_provider, instance, inst_model = row
                if instance.api_key:
                    # 解析 base_url（存储在 extra 字段中）
                    api_base = ""
                    try:
                        import json as _json
                        extra_data = _json.loads(instance.extra or "{}")
                        api_base = extra_data.get("base_url", "") or ""
                    except (ValueError, TypeError):
                        api_base = ""
                    return get_provider(
                        provider_name=tenant_provider.provider_name,
                        api_key=instance.api_key,
                        api_base=api_base,
                        model=inst_model.model_name,
                    )
        except Exception as e:
            print(f"[factory] provider_instances 查询失败: {e}")

    # 2) 旧表 ai_providers
    if db:
        try:
            from app.models.ai_provider import AIProvider
            from sqlalchemy import select
            q = select(AIProvider).where(AIProvider.is_enabled == True).limit(1)
            result = await db.execute(q)
            provider_record = result.scalar_one_or_none()
            if provider_record and provider_record.api_key:
                return get_provider(
                    provider_name=provider_record.provider_name,
                    api_key=provider_record.api_key,
                    api_base=provider_record.api_base,
                    model=provider_record.model_list[0] if provider_record.model_list else "",
                )
        except Exception as e:
            print(f"[factory] ai_providers 查询失败: {e}")

    # 3) 环境变量 DeepSeek（兜底）
    if settings.deepseek_api_key:
        return get_provider("DeepSeek")

    return None


async def get_vision_provider(db=None) -> OpenAIVisionProvider | None:
    """
    获取第一个可用的视觉模型服务商（用于图表识别）

    解析顺序：
      1) 系统默认 image2text 模型（system_settings.img2txt_id）
      2) 旧 ai_providers 表（兼容历史数据）
      3) 环境变量 DeepSeek（兜底）

    Args:
        db: 数据库会话

    Returns:
        OpenAIVisionProvider 实例，没有可用视觉服务商时返回 None
    """
    # 优先级 1：系统默认 image2text 模型（新表 + system_settings）
    if db:
        provider = await get_provider_by_model_type(db, "image2text")
        if provider is not None:
            return provider

    # 优先级 2：旧 ai_providers 表
    if db:
        try:
            from app.models.ai_provider import AIProvider
            from sqlalchemy import select
            # 查找所有启用的服务商，优先找视觉模型
            q = select(AIProvider).where(
                AIProvider.is_enabled == True,
            )
            result = await db.execute(q)
            providers = result.scalars().all()

            for provider_record in providers:
                if not provider_record.api_key or not provider_record.model_list:
                    continue
                # 查找视觉模型（model_list 中包含 vision 或 4v 关键词）
                vision_model = ""
                for m in provider_record.model_list:
                    if any(kw in m.lower() for kw in ["vision", "4v", "vl", "ocr"]):
                        vision_model = m
                        break
                if not vision_model:
                    vision_model = provider_record.model_list[0]  # 回退到第一个模型

                provider = OpenAIVisionProvider(
                    api_key=provider_record.api_key,
                    api_base=provider_record.api_base,
                    model=vision_model,
                )
                return provider
        except Exception as e:
            print(f"[factory] 旧表 ai_providers 视觉模型查询失败: {e}")

    return None


# ====== 按 model_type 解析系统默认模型 ======

async def get_provider_by_model_type(
    db: AsyncSession, model_type: str
) -> BaseLLMProvider | None:
    """
    根据 model_type 解析系统默认模型

    功能：从 system_settings 表读取 model_type 对应的默认配置（llm_id / embd_id / img2txt_id / ...），
          解析 "provider|instance|model" 格式，构造 AI 适配器实例
    输入参数：db（数据库会话）、model_type（chat / embedding / image2text / speech2text / rerank / tts）
    返回值：BaseLLMProvider 实例，无配置时返回 None
    使用场景：PDF 解析、AI 异步任务等无 aiSelection 上下的场景
    """
    try:
        # 延迟导入避免循环依赖
        from app.services.system_setting_service import MODEL_TYPE_TO_KEY, parse_model_value
        from app.models.system_setting import SystemSetting
        from app.models.tenant_provider import TenantModelProvider
        from app.models.provider_instance import ProviderInstance
        from sqlalchemy import select

        # 1) 查 system_settings 中 model_type 对应的设置项
        setting_key = MODEL_TYPE_TO_KEY.get(model_type)
        if not setting_key:
            return None

        row = (
            await db.execute(
                select(SystemSetting).where(SystemSetting.setting_key == setting_key)
            )
        ).scalar_one_or_none()
        if not row or not row.setting_value:
            return None

        # 2) 解析 "provider|instance|model" 格式
        parsed = parse_model_value(row.setting_value)
        if not parsed:
            return None

        provider_name = parsed["model_provider"]
        instance_name = parsed["model_instance"]
        model_name = parsed["model_name"]

        # 3) 查 tenant_providers / provider_instances
        tp_row = (
            await db.execute(
                select(TenantModelProvider).where(
                    TenantModelProvider.provider_name == provider_name
                ).limit(1)
            )
        ).scalar_one_or_none()
        if not tp_row:
            return None

        inst_row = (
            await db.execute(
                select(ProviderInstance).where(
                    ProviderInstance.provider_id == tp_row.id,
                    ProviderInstance.instance_name == instance_name,
                ).limit(1)
            )
        ).scalar_one_or_none()
        if not inst_row or not inst_row.api_key:
            return None

        # 4) 解析 base_url
        import json as _json
        api_base = ""
        try:
            extra_data = _json.loads(inst_row.extra or "{}")
            api_base = extra_data.get("base_url", "") or ""
        except (ValueError, TypeError):
            pass

        # 5) 构造 AI 适配器
        return get_provider(
            provider_name=provider_name,
            api_key=inst_row.api_key,
            api_base=api_base,
            model=model_name,
        )
    except Exception as e:
        print(f"[factory] get_provider_by_model_type({model_type}) 失败: {e}")
        return None


# ====== 兼容旧接口 ======

async def refine_questions_with_llm(questions: list[dict]) -> list[dict]:
    """
    兼容旧调用 — 使用默认 DeepSeek 配置

    Args:
        questions: 题目列表

    Returns:
        优化后的题目列表
    """
    provider = get_provider("DeepSeek")  # 获取默认 DeepSeek 适配器
    if not provider:
        return questions
    return await provider.refine_questions(questions)


async def classify_question_type(stem: str, options: list = None) -> str:
    """
    兼容旧调用 — 使用默认 DeepSeek 配置

    Args:
        stem: 题干文本
        options: 选项列表

    Returns:
        题型标识
    """
    provider = get_provider("DeepSeek")  # 获取默认 DeepSeek 适配器
    if not provider:
        return "general"
    return await provider.classify_type(stem, options)