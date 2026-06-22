"""
系统设置服务层 - 默认模型配置的加载/保存

功能：管理 llm_id、embd_id、img2txt_id、asr_id、rerank_id、tts_id 等默认值
输入参数：数据库会话
返回值：默认模型字典或更新结果
使用场景：SystemSetting 组件
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.system_setting import SystemSetting

# 默认模型字段映射：model_type → setting_key
MODEL_TYPE_TO_KEY = {
    "chat": "llm_id",
    "embedding": "embd_id",
    "image2text": "img2txt_id",
    "speech2text": "asr_id",
    "rerank": "rerank_id",
    "tts": "tts_id",
}

# 设置键 → model_type 映射
KEY_TO_MODEL_TYPE = {v: k for k, v in MODEL_TYPE_TO_KEY.items()}


async def get_default_model_dictionary(db: AsyncSession) -> dict:
    """
    获取默认模型字典

    功能：从 system_settings 表加载所有 llm_id/embd_id/... 配置
    输入参数：db（数据库会话）
    返回值：{ "llm_id": "provider|instance|model", "embd_id": "..." }
    使用场景：GET /api/ai/default-model
    """
    q = select(SystemSetting)
    result = await db.execute(q)
    rows = result.scalars().all()

    result_dict = {
        "llm_id": "",
        "embd_id": "",
        "img2txt_id": "",
        "asr_id": "",
        "rerank_id": "",
        "tts_id": "",
    }
    for row in rows:
        if row.setting_key in result_dict:
            result_dict[row.setting_key] = row.setting_value

    return result_dict


async def set_default_model(
    db: AsyncSession,
    model_type: str,
    model_provider: str,
    model_instance: str,
    model_name: str
) -> dict:
    """
    设置单个默认模型

    功能：保存单个 model_type 的默认模型
    输入参数：db、model_type、model_provider、model_instance、model_name
    返回值：保存结果
    使用场景：内部调用 / PUT /api/ai/default-model
    """
    setting_key = MODEL_TYPE_TO_KEY.get(model_type)
    if not setting_key:
        return {"message": f"未知的模型类型: {model_type}"}

    # 构造值：provider|instance|model
    if not model_provider or not model_instance or not model_name:
        setting_value = ""
    else:
        setting_value = f"{model_provider}|{model_instance}|{model_name}"

    # 查询是否已存在
    q = select(SystemSetting).where(SystemSetting.setting_key == setting_key)
    result = await db.execute(q)
    existing = result.scalar_one_or_none()

    if existing:
        existing.setting_value = setting_value
    else:
        record = SystemSetting(setting_key=setting_key, setting_value=setting_value)
        db.add(record)

    await db.commit()
    return {"setting_key": setting_key, "setting_value": setting_value}


async def set_default_model_batch(db: AsyncSession, items: list[dict]) -> dict:
    """
    批量设置默认模型

    功能：批量更新多个 model_type 的默认配置
    输入参数：db、items（列表，每项含 model_type/model_provider/model_instance/model_name）
    返回值：操作结果
    使用场景：PUT /api/ai/default-model
    """
    updated = []
    for item in items:
        model_type = item.get("model_type", "")
        await set_default_model(
            db, model_type,
            item.get("model_provider", ""),
            item.get("model_instance", ""),
            item.get("model_name", ""),
        )
        updated.append(model_type)

    return {"updated": updated, "count": len(updated)}


def parse_model_value(value: str) -> dict | None:
    """
    解析默认模型值字符串

    功能：将 "provider|instance|model" 解析为 dict
    输入参数：value（"provider|instance|model"）
    返回值：{ "model_provider": "...", "model_instance": "...", "model_name": "..." } 或 None
    使用场景：前端反序列化
    """
    if not value:
        return None
    parts = value.split("|")
    if len(parts) < 3:
        return None
    return {
        "model_provider": parts[0],
        "model_instance": parts[1],
        "model_name": parts[2],
    }