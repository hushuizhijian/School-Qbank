"""
工具调用组件

功能：调用外部工具（数据库操作、文件操作等）
输入参数：tool_name（工具名称）、inputs（工具输入参数）
返回值：result（工具执行结果）
使用场景：读/写题目、知识点等数据库操作
"""
import logging
from agent.component.base import ComponentBase
from agent.component.param import ComponentParamBase

logger = logging.getLogger(__name__)


class ToolParam(ComponentParamBase):
    """工具组件参数"""

    def __init__(self, **kwargs):
        self.tool_name: str = kwargs.get("tool_name", "")  # 工具名称
        self.inputs: dict = kwargs.get("inputs", {})  # 工具输入参数
        super().__init__(**kwargs)

    def check(self) -> bool:
        """参数校验"""
        return bool(self.tool_name)  # 工具名必填


class Tool(ComponentBase):
    """工具调用组件"""

    component_name = "Tool"

    def _create_params(self, params: dict) -> ToolParam:
        """创建参数对象"""
        return ToolParam(**params)

    async def invoke(self, **kwargs) -> bool:
        """
        调用工具

        Args:
            **kwargs: 输入参数

        Returns:
            True 表示执行成功
        """
        try:
            tool_name = self._params.tool_name  # 工具名称

            # 解析输入参数中的变量引用
            resolved_inputs = {}
            for key, value in self._params.inputs.items():
                if isinstance(value, str) and "{" in value:
                    resolved_inputs[key] = self._resolve_ref(value)
                else:
                    resolved_inputs[key] = value

            # 调用工具
            result = await self._execute_tool(tool_name, resolved_inputs)

            self.set_output("result", result)  # 设置输出
            return True

        except Exception as e:
            self.exception_handler(e)
            return False

    def _resolve_ref(self, ref_str: str) -> str:
        """
        解析变量引用 {component_id@key}

        Args:
            ref_str: 引用字符串

        Returns:
            解析后的值
        """
        import re
        match = re.match(r"\{(\w+@\w+)\}", ref_str)
        if match:
            return str(self.get_input(match.group(1), ""))
        return ref_str

    async def _execute_tool(self, tool_name: str, inputs: dict):
        """
        执行工具

        Args:
            tool_name: 工具名称
            inputs: 输入参数

        Returns:
            工具执行结果
        """
        # 工具注册表
        from agent.tools.question import QuestionTool
        from agent.tools.paper import PaperTool
        from agent.tools.knowledge import KnowledgeTool

        TOOL_MAP = {
            "load_question": QuestionTool.load_question,
            "save_question": QuestionTool.save_question,
            "load_paper": PaperTool.load_paper,
            "save_paper": PaperTool.save_paper,
            "load_knowledge": KnowledgeTool.load_knowledge,
            "save_knowledge": KnowledgeTool.save_knowledge,
        }

        tool_func = TOOL_MAP.get(tool_name)
        if not tool_func:
            logger.warning(f"[Tool] 未知工具: {tool_name}")
            return {"error": f"未知工具: {tool_name}"}

        return await tool_func(**inputs)