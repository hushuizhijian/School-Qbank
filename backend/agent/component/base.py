"""
组件基类

功能：定义工作流组件的生命周期和输入输出管理
输入参数：component_name / params / canvas
返回值：ComponentBase 实例
使用场景：所有工作流组件继承此基类
"""
import logging
from abc import ABC, abstractmethod
from typing import Any

from agent.component.param import ComponentParamBase

logger = logging.getLogger(__name__)


class ComponentBase(ABC):
    """组件基类 — 定义组件生命周期"""

    # 组件名称
    component_name: str = ""

    def __init__(self, canvas, component_id: str, params: dict = None):
        self._canvas = canvas  # 所属 Canvas 实例
        self._id = component_id  # 组件ID
        self._params = self._create_params(params or {})  # 参数对象
        self._outputs: dict[str, Any] = {}  # 输出缓存
        self._error: str = ""  # 错误信息

    @abstractmethod
    def _create_params(self, params: dict) -> ComponentParamBase:
        """创建参数对象（子类实现）"""
        ...

    @abstractmethod
    async def invoke(self, **kwargs) -> bool:
        """
        执行组件逻辑

        Args:
            **kwargs: 输入参数

        Returns:
            True 表示执行成功
        """
        ...

    def get_downstream(self) -> list[str]:
        """
        获取下游组件ID列表

        Returns:
            下游组件ID列表
        """
        return self._canvas.get_downstream(self._id)  # 从 Canvas 获取

    def get_upstream(self) -> list[str]:
        """
        获取上游组件ID列表

        Returns:
            上游组件ID列表
        """
        return self._canvas.get_upstream(self._id)  # 从 Canvas 获取

    def output(self, key: str, default: Any = None) -> Any:
        """
        获取输出值

        Args:
            key: 输出键名
            default: 默认值

        Returns:
            输出值
        """
        return self._outputs.get(key, default)

    def set_output(self, key: str, value: Any):
        """
        设置输出值

        Args:
            key: 输出键名
            value: 输出值
        """
        self._outputs[key] = value

    def get_input(self, key: str, default: Any = None) -> Any:
        """
        从上游组件获取输入值

        Args:
            key: 输入键名（格式：component_id@key）
            default: 默认值

        Returns:
            输入值
        """
        # 解析 upstream@key 格式
        if "@" in key:
            comp_id, attr = key.split("@", 1)
            upstream = self._canvas.get_component(comp_id)
            if upstream:
                return upstream.output(attr, default)
        return default

    def error(self, message: str):
        """设置错误信息"""
        self._error = message
        logger.error(f"[{self.component_name}] {message}")

    def exception_handler(self, e: Exception):
        """异常处理"""
        self.error(str(e))
        logger.exception(f"[{self.component_name}] 异常: {e}")

    def debug_info(self) -> dict:
        """获取调试信息"""
        return {
            "id": self._id,
            "name": self.component_name,
            "params": self._params.to_dict() if self._params else {},
            "outputs": self._outputs,
            "error": self._error,
        }