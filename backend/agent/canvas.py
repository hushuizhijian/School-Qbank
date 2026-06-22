"""
Canvas DAG 执行引擎

功能：管理组件之间的数据流和执行顺序，支持 DAG（有向无环图）结构
输入参数：dsl（DSL 配置 JSON）、canvas_id
返回值：Canvas 实例
使用场景：所有 AI 工作流的执行引擎

DSL 结构示例：
{
  "components": {
    "begin": {
      "obj": {"component_name": "Begin", "params": {}},
      "downstream": ["llm_0"],
      "upstream": []
    },
    "llm_0": {
      "obj": {"component_name": "LLM", "params": {"prompt": "..."}},
      "downstream": ["message_0"],
      "upstream": ["begin"]
    },
    "message_0": {
      "obj": {"component_name": "Message", "params": {}},
      "downstream": [],
      "upstream": ["llm_0"]
    }
  },
  "path": ["begin"],
  "globals": {}
}
"""
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class Canvas:
    """Canvas DAG 执行引擎"""

    def __init__(self, dsl: dict = None, canvas_id: str = ""):
        self._id = canvas_id or "canvas"  # Canvas ID
        self._dsl = dsl or {}  # DSL 配置
        self._components: dict[str, Any] = {}  # 组件实例字典
        self._globals: dict[str, Any] = {}  # 全局变量
        self._path: list[str] = []  # 执行路径
        self._results: dict[str, Any] = {}  # 执行结果
        self._error: str = ""  # 错误信息

    @classmethod
    def from_json(cls, json_str: str, canvas_id: str = "") -> "Canvas":
        """
        从 JSON 字符串创建 Canvas

        Args:
            json_str: DSL JSON 字符串
            canvas_id: Canvas ID

        Returns:
            Canvas 实例
        """
        dsl = json.loads(json_str)  # 解析 JSON
        return cls(dsl, canvas_id)

    def load_dsl(self, dsl: dict):
        """加载 DSL 配置"""
        self._dsl = dsl
        self._components = {}  # 重置组件
        self._path = dsl.get("path", [])  # 执行路径
        self._globals = dsl.get("globals", {})  # 全局变量

    def get_component(self, component_id: str):
        """
        获取组件实例

        Args:
            component_id: 组件ID

        Returns:
            组件实例
        """
        return self._components.get(component_id)

    def get_downstream(self, component_id: str) -> list[str]:
        """
        获取下游组件ID列表

        Args:
            component_id: 组件ID

        Returns:
            下游组件ID列表
        """
        comp_info = self._dsl.get("components", {}).get(component_id, {})
        return comp_info.get("downstream", [])

    def get_upstream(self, component_id: str) -> list[str]:
        """
        获取上游组件ID列表

        Args:
            component_id: 组件ID

        Returns:
            上游组件ID列表
        """
        comp_info = self._dsl.get("components", {}).get(component_id, {})
        return comp_info.get("upstream", [])

    async def run(self, **inputs) -> dict[str, Any]:
        """
        执行工作流

        Args:
            **inputs: 初始输入参数

        Returns:
            执行结果字典
        """
        if not self._path:
            self._error = "执行路径为空"
            return {"success": False, "error": self._error}

        # 构建组件实例
        self._build_components()

        # 从起始节点开始执行
        current = self._path[0]  # 起始节点
        visited = set()  # 已访问节点

        while current:
            if current in visited:
                logger.warning(f"[Canvas] 检测到循环: {current}")
                break

            visited.add(current)  # 标记已访问
            component = self._components.get(current)

            if not component:
                self._error = f"组件不存在: {current}"
                break

            try:
                # 执行组件
                success = await component.invoke(**inputs)
                if not success:
                    self._error = component._error or f"组件执行失败: {current}"
                    if not self._should_continue_on_error():
                        break
            except Exception as e:
                self._error = f"组件异常: {current}: {str(e)}"
                logger.exception(f"[Canvas] 组件异常: {current}")
                if not self._should_continue_on_error():
                    break

            # 获取下一个组件
            downstream = self.get_downstream(current)
            current = downstream[0] if downstream else None

        # 收集结果
        self._results = {
            "success": not bool(self._error),
            "error": self._error,
            "components": {
                cid: comp.debug_info()
                for cid, comp in self._components.items()
            },
        }
        return self._results

    def _build_components(self):
        """构建所有组件实例"""
        from agent.component.begin import Begin
        from agent.component.llm import LLM
        from agent.component.switch import Switch
        from agent.component.loop import Loop
        from agent.component.tool import Tool
        from agent.component.message import Message

        # 组件类型注册表
        COMPONENT_MAP = {
            "Begin": Begin,
            "LLM": LLM,
            "Switch": Switch,
            "Loop": Loop,
            "Tool": Tool,
            "Message": Message,
        }

        components_dsl = self._dsl.get("components", {})
        for comp_id, comp_info in components_dsl.items():
            obj = comp_info.get("obj", {})
            comp_name = obj.get("component_name", "")
            comp_params = obj.get("params", {})

            comp_cls = COMPONENT_MAP.get(comp_name)
            if comp_cls:
                self._components[comp_id] = comp_cls(
                    canvas=self,
                    component_id=comp_id,
                    params=comp_params,
                )
            else:
                logger.warning(f"[Canvas] 未知组件类型: {comp_name}")

    def _should_continue_on_error(self) -> bool:
        """判断是否在出错时继续执行"""
        return self._globals.get("continue_on_error", False)

    def set_global(self, key: str, value: Any):
        """设置全局变量"""
        self._globals[key] = value

    def get_global(self, key: str, default: Any = None) -> Any:
        """获取全局变量"""
        return self._globals.get(key, default)