"""
消息输出组件

功能：工作流终点组件，收集并输出最终结果
输入参数：无
返回值：result（汇总的上游组件输出）
使用场景：每个工作流的终点
"""
from agent.component.base import ComponentBase
from agent.component.param import ComponentParamBase


class MessageParam(ComponentParamBase):
    """消息组件参数"""

    def __init__(self, **kwargs):
        self.message: str = kwargs.get("message", "")  # 输出消息
        super().__init__(**kwargs)


class Message(ComponentBase):
    """消息输出组件 — 工作流终点"""

    component_name = "Message"

    def _create_params(self, params: dict) -> MessageParam:
        """创建参数对象"""
        return MessageParam(**params)

    async def invoke(self, **kwargs) -> bool:
        """
        收集上游输出，生成最终结果

        Args:
            **kwargs: 输入参数

        Returns:
            True 表示执行成功
        """
        # 收集所有上游组件的输出
        upstream_ids = self.get_upstream()
        results = {}

        for uid in upstream_ids:
            comp = self._canvas.get_component(uid)
            if comp:
                results[uid] = comp._outputs  # 收集上游输出

        self.set_output("results", results)  # 设置汇总结果
        self.set_output("message", self._params.message or "工作流完成")  # 设置消息
        return True