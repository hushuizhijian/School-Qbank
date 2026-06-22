"""
LLM 适配器抽象基类

功能：定义所有 AI 供应商适配器的统一接口
输入参数：api_key / api_base / model
返回值：BaseLLMProvider 实例
使用场景：所有 LLM 适配器继承此基类
"""
import json
from abc import ABC, abstractmethod
from typing import AsyncGenerator

from common.constants import (
    DEFAULT_TEMPERATURE,
    DEFAULT_MAX_TOKENS,
    EXPLANATION_MAX_TOKENS,
    CLASSIFY_MAX_TOKENS,
    KNOWLEDGE_MATCH_MAX_TOKENS,
    VALID_QUESTION_TYPES,
)


class BaseLLMProvider(ABC):
    """AI 服务商适配器基类 — 统一接口"""

    # 供应商名称（子类必须覆盖）
    provider_name: str = ""

    def __init__(self, api_key: str, api_base: str, model: str = ""):
        self.api_key = api_key  # API 密钥
        self.api_base = api_base.rstrip("/")  # API 基础地址
        self.model = model  # 模型名称

    @abstractmethod
    async def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = DEFAULT_TEMPERATURE,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> str:
        """通用对话接口，返回文本内容"""
        ...

    @abstractmethod
    async def chat_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = DEFAULT_TEMPERATURE,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> AsyncGenerator[str, None]:
        """流式对话接口，异步生成器"""
        ...

    async def health_check(self) -> bool:
        """
        健康检查：验证 API Key 是否有效

        Returns:
            True 表示 API Key 有效
        """
        try:
            result = await self.chat("", "ping", temperature=0, max_tokens=5)
            return bool(result)  # 有返回则视为有效
        except Exception:
            return False

    async def list_models(self) -> list[dict]:
        """
        获取该供应商的可用模型列表

        Returns:
            模型列表
        """
        return []

    # ====== 题库业务方法 ======

    async def refine_questions(self, questions: list[dict]) -> list[dict]:
        """
        使用 AI 增强题目识别

        Args:
            questions: 题目列表

        Returns:
            优化后的题目列表
        """
        try:
            content = await self.chat(
                system_prompt="你是一个题目解析助手，输出严格的 JSON 格式。",
                user_prompt=PROMPT_REFINE_QUESTIONS.format(
                    questions=json.dumps(questions, ensure_ascii=False)
                ),
                temperature=DEFAULT_TEMPERATURE,
                max_tokens=DEFAULT_MAX_TOKENS,
            )
            # 提取 JSON 内容
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            refined = json.loads(content.strip())
            return refined.get("questions", questions)
        except Exception as e:
            print(f"[AI] Refinement failed: {e}")
            return questions

    async def classify_type(self, stem: str, options: list = None) -> str:
        """
        识别题目类型

        Args:
            stem: 题干文本
            options: 选项列表

        Returns:
            题型标识（single/multi/fill/judge/general）
        """
        prompt = f"""判断以下题目的题型，只返回一个单词：
- single: 单选题（有 A/B/C/D 选项）
- multi: 多选题
- fill: 填空题（有下划线或横线填空）
- judge: 判断题（对/错、正确/错误）
- general: 解答题、计算题等

题目：{stem}
选项：{options or '无'}

题型："""
        try:
            result = await self.chat("", prompt, temperature=0, max_tokens=CLASSIFY_MAX_TOKENS)
            result = result.strip().lower()
            return result if result in VALID_QUESTION_TYPES else "general"
        except Exception as e:
            print(f"[AI] Type classification failed: {e}")
            return "general"

    async def generate_explanation(self, stem: str, answer: str = "") -> str:
        """
        生成题目解析

        Args:
            stem: 题干文本
            answer: 答案

        Returns:
            题目解析文本
        """
        prompt = f"题目：{stem}\n答案：{answer or '无'}\n请生成该题的详细解析（解题步骤+易错点）："
        try:
            return await self.chat(
                "你是一个题目解析专家。", prompt,
                temperature=0.3,
                max_tokens=EXPLANATION_MAX_TOKENS
            )
        except Exception as e:
            print(f"[AI] Explanation generation failed: {e}")
            return ""

    async def refine_stem(self, stem: str) -> str:
        """
        优化题干文本

        Args:
            stem: 原题干文本

        Returns:
            优化后的题干文本
        """
        prompt = f"""请优化以下题目文本，使其更加规范、清晰：
1. 修正错别字和标点符号
2. 修正括号配对：确保每个左括号都有对应的右括号
3. 将所有分数转换为 LaTeX 格式：1/2 → $\\frac{{1}}{{2}}$，三分之二 → $\\frac{{2}}{{3}}$
4. 规范数学符号和公式（使用LaTeX格式，如 $a^2+b^2=c^2$）
5. 保持原意不变，不要改变题目内容

原题干：
{stem}

优化后的题干："""
        try:
            return await self.chat(
                "你是一个题目文本优化专家。", prompt,
                temperature=0.3,
                max_tokens=EXPLANATION_MAX_TOKENS
            )
        except Exception as e:
            print(f"[AI] Stem refinement failed: {e}")
            return ""

    async def match_knowledge_points(
        self, stem: str, subject: str, available_kps: list[str]
    ) -> list[str]:
        """
        使用 LLM 为题目匹配知识点

        Args:
            stem: 题干文本
            subject: 学科
            available_kps: 已有知识点列表

        Returns:
            匹配的知识点名称列表
        """
        kp_list_str = "\n".join(f"- {kp}" for kp in available_kps[:200])  # 限制长度避免超token
        prompt = f"""请为以下{subject}题目匹配最合适的知识点。

题目：{stem}

已有知识点列表：
{kp_list_str}

要求：
1. 从已有知识点列表中选择最匹配的1-3个知识点名称
2. 如果已有知识点中没有合适的，可以建议1个新的知识点名称（简短精确，如"一元二次方程"）
3. 只返回知识点名称，每行一个，不要编号，不要其他内容

匹配的知识点："""
        try:
            result = await self.chat(
                "你是一个知识点分类专家，擅长将题目归类到正确的知识点。",
                prompt,
                temperature=DEFAULT_TEMPERATURE,
                max_tokens=KNOWLEDGE_MATCH_MAX_TOKENS,
            )
            # 解析返回的知识点名称
            names = []
            for line in result.strip().split("\n"):
                line = line.strip().lstrip("0123456789.-) ")
                if line:
                    names.append(line)
            return names[:5]  # 最多5个知识点
        except Exception as e:
            print(f"[AI] Knowledge point matching failed: {e}")
            return []


# ====== Prompt 模板 ======

PROMPT_REFINE_QUESTIONS = """你是一个题目解析助手。请分析以下从 PDF 提取的题目文本，对每道题进行结构化整理。

对于每道题，请：
1. 修正 OCR 错误（修正错字、补齐漏字）
2. 修正括号配对：确保每个左括号都有对应的右括号，反之亦然
3. 将所有分数转换为 LaTeX 格式：1/2 → $\\frac{{1}}{{2}}$，三分之二 → $\\frac{{2}}{{3}}$
4. 规范数学符号和公式（使用LaTeX格式，如 $a^2+b^2=c^2$）
5. 判断题型：single(单选)、multi(多选)、fill(填空)、judge(判断)、general(通用)
6. 如果是指定选项题，提取选项（label: A/B/C/D，text: 选项内容）
7. 如果文本中包含答案，提取答案
8. 保持原始题号

输入题目 JSON：
{questions}

输出格式（严格 JSON）：
{{
  "questions": [
    {{
      "question_no": 1,
      "stem": "修正后的题目文本",
      "question_type": "single",
      "options": [{{"label": "A", "text": "..."}}, ...],
      "answer": "A"
    }},
    ...
  ]
}}

只返回 JSON，不要其他内容。"""