"""
模型元数据管理

功能：管理模型的能力标签、最大 Token 数、模型类型等元数据
输入参数：模型名称
返回值：模型元数据字典
使用场景：根据模型标签筛选合适的模型
"""
import json
from pathlib import Path


# 配置目录
CONF_DIR = Path(__file__).parent / "conf"  # llm/conf/ 目录


def get_model_meta(provider_name: str, model_name: str) -> dict:
    """
    获取指定模型的元数据

    Args:
        provider_name: 供应商名称
        model_name: 模型名称

    Returns:
        模型元数据字典，未找到时返回空字典
    """
    config_path = CONF_DIR / "models" / f"{provider_name.lower()}.json"  # 模型配置文件路径
    if not config_path.exists():
        return {}
    try:
        with open(config_path, "r", encoding="utf-8") as f:  # 以 UTF-8 编码打开
            models = json.load(f)
        for m in models:
            if m.get("llm_name") == model_name:
                return m
    except (json.JSONDecodeError, IOError):
        pass
    return {}


def get_models_by_tag(provider_name: str, tag: str) -> list[dict]:
    """
    根据标签筛选模型

    Args:
        provider_name: 供应商名称
        tag: 模型标签（如 "VISION", "128k"）

    Returns:
        符合条件的模型列表
    """
    config_path = CONF_DIR / "models" / f"{provider_name.lower()}.json"  # 模型配置文件路径
    if not config_path.exists():
        return []
    try:
        with open(config_path, "r", encoding="utf-8") as f:  # 以 UTF-8 编码打开
            models = json.load(f)
        return [m for m in models if tag in m.get("tags", "")]
    except (json.JSONDecodeError, IOError):
        return []