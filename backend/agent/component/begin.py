"""
开始组件

功能：工作流入口组件，接收初始输入参数
输入参数：inputs（输入参数定义）
返回值：无（通过 set_output 传递数据）
使用场景：每个工作流的起点
"""
from agent.component.base import ComponentBase
from agent.component.param import ComponentParamBase


class BeginParam(ComponentParamBase):
    """开始组件参数"""

    def __init__(self, **kwargs):
        self.inputs: dict = kwargs.get("inputs", {})  # 输入参数定义
        super().__init__(**kwargs)


class Begin(ComponentBase):
    """开始组件 — 工作流入口"""

    component_name = "Begin"

    def _create_params(self, params: dict) -> BeginParam:
        """创建参数对象"""
        return BeginParam(**params)

    async def invoke(self, **kwargs) -> bool:
        """
        入口组件：将输入参数传递给下游

        Args:
            **kwargs: 初始输入参数

        Returns:
            True 表示执行成功
        """
        # 将输入参数设置为输出
        for key, value in kwargs.items():
            self.set_output(key, value)
        return True