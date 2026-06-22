"""
循环组件

功能：遍历输入列表，对每个元素执行子流程
输入参数：items（待遍历列表）、max_iterations（最大迭代次数）
返回值：results（处理结果列表）
使用场景：批量题目逐题处理
"""
import logging
from agent.component.base import ComponentBase
from agent.component.param import ComponentParamBase

logger = logging.getLogger(__name__)


class LoopParam(ComponentParamBase):
    """循环组件参数"""

    def __init__(self, **kwargs):
        self.items_key: str = kwargs.get("items_key", "")  # 输入列表键名
        self.max_iterations: int = kwargs.get("max_iterations", 100)  # 最大迭代次数
        super().__init__(**kwargs)


class Loop(ComponentBase):
    """循环组件"""

    component_name = "Loop"

    def _create_params(self, params: dict) -> LoopParam:
        """创建参数对象"""
        return LoopParam(**params)

    async def invoke(self, **kwargs) -> bool:
        """
        遍历输入列表

        Args:
            **kwargs: 输入参数

        Returns:
            True 表示执行成功
        """
        # 获取输入列表
        items_key = self._params.items_key
        if items_key:
            items = self.get_input(items_key, [])
        else:
            items = kwargs.get("items", [])

        if not items:
            self.error("循环输入列表为空")
            return False

        # 限制迭代次数
        items = items[:self._params.max_iterations]

        results = []
        for idx, item in enumerate(items):
            try:
                # 处理单个元素
                processed = await self._process_item(item, idx)
                results.append(processed)
                logger.info(f"[Loop] 处理第 {idx + 1}/{len(items)} 项完成")
            except Exception as e:
                logger.error(f"[Loop] 处理第 {idx + 1} 项失败: {e}")
                results.append({"error": str(e), "item": item})

        self.set_output("results", results)  # 设置输出
        self.set_output("count", len(results))  # 设置数量
        return True

    async def _process_item(self, item, index: int):
        """
        处理单个元素（子类可覆盖）

        Args:
            item: 当前元素
            index: 索引

        Returns:
            处理结果
        """
        # 默认直接返回原元素
        return {"index": index, "item": item}