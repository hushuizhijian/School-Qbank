"""
配置管理工具

功能：提供 JSON/YAML 配置文件的加载和保存功能
输入参数：配置文件路径
返回值：配置字典
使用场景：加载 llm_factories.json、system_settings.json 等配置文件
"""
import json
import os
from pathlib import Path
from typing import Any


def load_json_config(file_path: str | Path) -> dict[str, Any]:
    """
    加载 JSON 配置文件

    Args:
        file_path: 配置文件路径

    Returns:
        配置字典，文件不存在时返回空字典
    """
    file_path = Path(file_path)  # 转换为 Path 对象
    if not file_path.exists():
        print(f"[Config] 配置文件不存在: {file_path}")
        return {}
    try:
        with open(file_path, "r", encoding="utf-8") as f:  # 以 UTF-8 编码打开
            return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"[Config] 加载配置文件失败: {file_path}, 错误: {e}")
        return {}


def save_json_config(file_path: str | Path, data: dict[str, Any]) -> bool:
    """
    保存 JSON 配置文件

    Args:
        file_path: 配置文件路径
        data: 要保存的配置字典

    Returns:
        是否保存成功
    """
    file_path = Path(file_path)  # 转换为 Path 对象
    try:
        # 确保父目录存在
        file_path.parent.mkdir(parents=True, exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f:  # 以 UTF-8 编码写入
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except IOError as e:
        print(f"[Config] 保存配置文件失败: {file_path}, 错误: {e}")
        return False


def get_env(key: str, default: str = "") -> str:
    """
    获取环境变量（带默认值）

    Args:
        key: 环境变量名
        default: 默认值

    Returns:
        环境变量值或默认值
    """
    return os.environ.get(key, default)  # 从环境变量读取