"""
条件分支组件

功能：根据条件判断结果选择不同的下游路径
输入参数：conditions（条件列表）、input_key（判断输入键）
返回值：branch（选中的分支索引）
使用场景：不同题型分流处理
"""
from agent.component.base import ComponentBase
from agent.component.param import ComponentParamBase


class SwitchParam(ComponentParamBase):
    """条件分支组件参数"""

    def __init__(self, **kwargs):
        self.conditions: list[dict] = kwargs.get("conditions", [])  # 条件列表
        self.input_key: str = kwargs.get("input_key", "")  # 输入键名
        super().__init__(**kwargs)


class Switch(ComponentBase):
    """条件分支组件"""

    component_name = "Switch"

    def _create_params(self, params: dict) -> SwitchParam:
        """创建参数对象"""
        return SwitchParam(**params)

    async def invoke(self, **kwargs) -> bool:
        """
        条件判断：根据输入值选择分支

        Args:
            **kwargs: 输入参数

        Returns:
            True 表示执行成功
        """
        # 获取判断输入值
        input_key = self._params.input_key
        if input_key:
            value = self.get_input(input_key, "")
        else:
            value = kwargs.get("value", "")

        # 遍历条件，找到第一个匹配的分支
        branch = -1
        for idx, condition in enumerate(self._params.conditions):
            if self._check_condition(value, condition):
                branch = idx
                break

        self.set_output("branch", branch)  # 设置分支索引
        self.set_output("value", value)  # 设置原始值
        return True

    def _check_condition(self, value: str, condition: dict) -> bool:
        """
        检查条件是否匹配

        Args:
            value: 输入值
            condition: 条件字典

        Returns:
            True 表示匹配
        """
        op = condition.get("op", "eq")  # 操作符
        expected = condition.get("value", "")  # 期望值

        if op == "eq":
            return value == expected  # 等于
        elif op == "neq":
            return value != expected  # 不等于
        elif op == "contains":
            return expected in str(value)  # 包含
        elif op == "in":
            return value in expected  # 在列表中
        elif op == "regex":
            import re
            return bool(re.search(expected, str(value)))  # 正则匹配
        return False