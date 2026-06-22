"""
工具基类

功能：定义工具的通用接口
输入参数：工具参数
返回值：工具执行结果
使用场景：所有工具类继承此基类
"""
from abc import ABC, abstractmethod


class ToolBase(ABC):
    """工具基类"""

    # 工具名称
    tool_name: str = ""

    @abstractmethod
    async def execute(self, **kwargs) -> dict:
        """
        执行工具

        Args:
            **kwargs: 工具参数

        Returns:
            执行结果字典
        """
        ...