"""
LLM 调用组件

功能：调用 LLM 进行推理，支持供应商和模型选择
输入参数：provider / model / system_prompt / user_prompt / temperature
返回值：content（LLM 响应内容）
使用场景：所有 AI 推理节点
"""
from agent.component.base import ComponentBase
from agent.component.param import ComponentParamBase


class LLMParam(ComponentParamBase):
    """LLM 组件参数"""

    def __init__(self, **kwargs):
        self.provider: str = kwargs.get("provider", "DeepSeek")  # 供应商名称
        self.model: str = kwargs.get("model", "")  # 模型名称
        self.system_prompt: str = kwargs.get("system_prompt", "")  # 系统提示词
        self.user_prompt: str = kwargs.get("user_prompt", "")  # 用户提示词
        self.temperature: float = kwargs.get("temperature", 0.1)  # 温度参数
        self.max_tokens: int = kwargs.get("max_tokens", 4096)  # 最大 Token 数
        super().__init__(**kwargs)

    def check(self) -> bool:
        """参数校验"""
        return bool(self.user_prompt)  # 用户提示词必填


class LLM(ComponentBase):
    """LLM 调用组件"""

    component_name = "LLM"

    def _create_params(self, params: dict) -> LLMParam:
        """创建参数对象"""
        return LLMParam(**params)

    async def invoke(self, **kwargs) -> bool:
        """
        调用 LLM 进行推理

        Args:
            **kwargs: 输入参数（可覆盖组件参数）

        Returns:
            True 表示执行成功
        """
        try:
            from llm.factory import get_provider

            # 解析提示词中的变量引用（{component_id@key}）
            system_prompt = self._resolve_prompt(self._params.system_prompt)
            user_prompt = self._resolve_prompt(self._params.user_prompt)

            # 获取 LLM 适配器
            provider = get_provider(
                provider_name=self._params.provider,
                model=self._params.model,
            )

            if not provider:
                self.error(f"无可用 AI 服务商: {self._params.provider}")
                return False

            # 调用 LLM
            content = await provider.chat(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=self._params.temperature,
                max_tokens=self._params.max_tokens,
            )

            self.set_output("content", content)  # 设置输出
            return True

        except Exception as e:
            self.exception_handler(e)
            return False

    def _resolve_prompt(self, prompt: str) -> str:
        """
        解析提示词中的变量引用

        格式：{component_id@key} → 从上游组件获取输出值

        Args:
            prompt: 原始提示词

        Returns:
            解析后的提示词
        """
        import re

        def replacer(match):
            ref = match.group(1)  # 变量引用
            value = self.get_input(ref, "")
            return str(value)

        return re.sub(r"\{(\w+@\w+)\}", replacer, prompt)