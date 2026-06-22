"""
管道阶段基类

功能：定义管道阶段的统一接口
输入参数：context（管道上下文字典）
返回值：context（更新后的管道上下文）
使用场景：所有管道阶段继承此基类
"""
from abc import ABC, abstractmethod


class StageBase(ABC):
    """管道阶段基类"""

    # 阶段名称
    stage_name: str = ""

    def __init__(self, config: dict = None):
        self.config = config or {}  # 阶段配置

    @abstractmethod
    async def process(self, context: dict) -> dict:
        """
        处理阶段逻辑

        Args:
            context: 管道上下文，包含上游阶段的所有数据

        Returns:
            更新后的上下文
        """
        ...