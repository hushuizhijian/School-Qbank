"""
组件参数基类

功能：定义工作流组件的参数校验、更新、序列化
输入参数：params_dict（参数字典）
返回值：ComponentParamBase 实例
使用场景：所有组件参数类继承此基类
"""
import json
from abc import ABC
from typing import Any


class ComponentParamBase(ABC):
    """组件参数基类 — 支持参数校验、更新、序列化"""

    def __init__(self, **kwargs):
        """初始化参数，从 kwargs 中设置属性"""
        for key, value in kwargs.items():
            setattr(self, key, value)  # 动态设置属性

    def check(self) -> bool:
        """
        参数校验

        Returns:
            True 表示参数有效
        """
        return True  # 默认通过，子类可覆盖

    def update(self, **kwargs):
        """更新参数值"""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)

    def to_dict(self) -> dict[str, Any]:
        """序列化为字典"""
        result = {}
        for key in dir(self):
            if key.startswith("_"):
                continue
            value = getattr(self, key)
            if callable(value):
                continue
            result[key] = value
        return result

    def to_json(self) -> str:
        """序列化为 JSON 字符串"""
        return json.dumps(self.to_dict(), ensure_ascii=False, default=str)