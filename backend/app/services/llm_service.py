"""
多AI适配器 — 已废弃，请使用 llm/ 模块

⚠️ 此模块已废弃，所有功能已迁移到 llm/ 模块。
    请使用 from llm.factory import get_provider 等新接口。

功能：AI对话/题目优化/题型识别/解析生成/知识点匹配
输入参数：system_prompt / user_prompt / 题目数据
返回值：AI响应文本 / 处理后的题目数据
使用场景：所有AI相关功能（已废弃，仅保留向后兼容）
"""
import json
import httpx
from abc import ABC, abstractmethod

from app.config import settings


# ====== 抽象基类 ======

class BaseAIProvider(ABC):
    """AI 服务商适配器基类"""

    def __init__(self, api_base: str, api_key: str, model: str = ""):
        self.api_base = api_base.rstrip("/")
        self.api_key = api_key
        self.model = model

    @abstractmethod
    async def chat(self, system_prompt: str, user_prompt: str,
                   temperature: float = 0.1, max_tokens: int = 4096) -> str:
        """通用对话接口，返回文本内容"""
        ...

    async def refine_questions(self, questions: list[dict]) -> list[dict]:
        """使用 AI 增强题目识别"""
        try:
            content = await self.chat(
                system_prompt="你是一个题目解析助手，输出严格的 JSON 格式。",
                user_prompt=PROMPT_REFINE_QUESTIONS.format(
                    questions=json.dumps(questions, ensure_ascii=False)
                ),
                temperature=0.1,
                max_tokens=4096,
            )
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
        """识别题目类型"""
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
            result = await self.chat("", prompt, temperature=0, max_tokens=10)
            result = result.strip().lower()
            return result if result in {"single", "multi", "fill", "judge", "general"} else "general"
        except Exception as e:
            print(f"[AI] Type classification failed: {e}")
            return "general"

    async def generate_explanation(self, stem: str, answer: str = "") -> str:
        """生成题目解析"""
        prompt = f"题目：{stem}\n答案：{answer or '无'}\n请生成该题的详细解析（解题步骤+易错点）："
        try:
            return await self.chat("你是一个题目解析专家。", prompt, temperature=0.3, max_tokens=1024)
        except Exception as e:
            print(f"[AI] Explanation generation failed: {e}")
            return ""

    async def refine_stem(self, stem: str) -> str:
        """优化题干文本"""
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
            return await self.chat("你是一个题目文本优化专家。", prompt, temperature=0.3, max_tokens=1024)
        except Exception as e:
            print(f"[AI] Stem refinement failed: {e}")
            return ""

    async def match_knowledge_points(self, stem: str, subject: str, available_kps: list[str]) -> list[str]:
        """使用 LLM 为题目匹配知识点"""
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
                prompt, temperature=0.1, max_tokens=256
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


# ====== DeepSeek 适配器 ======

class DeepSeekProvider(BaseAIProvider):
    """DeepSeek Chat API 适配器"""

    def __init__(self, api_key: str = "", api_base: str = "", model: str = "deepseek-chat"):
        super().__init__(
            api_base=api_base or settings.deepseek_base_url,
            api_key=api_key or settings.deepseek_api_key,
            model=model,
        )

    async def chat(self, system_prompt: str, user_prompt: str,
                   temperature: float = 0.1, max_tokens: int = 4096) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.api_base}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


# ====== 通用 OpenAI 兼容适配器 ======

class OpenAICompatibleProvider(BaseAIProvider):
    """通用 OpenAI 兼容 API 适配器 — 适用于所有预设服务商"""

    def __init__(self, api_base: str, api_key: str, model: str = ""):
        super().__init__(api_base=api_base, api_key=api_key, model=model)

    async def chat(self, system_prompt: str, user_prompt: str,
                   temperature: float = 0.1, max_tokens: int = 4096) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": user_prompt})

        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


# ====== 视觉模型适配器 ======

class OpenAIVisionProvider(OpenAICompatibleProvider):
    """通用 OpenAI 兼容视觉 API 适配器 — 支持图片输入"""

    async def chat_with_image(self, system_prompt: str, user_prompt: str,
                              image_base64: str = "",
                              image_url: str = "",
                              temperature: float = 0.1,
                              max_tokens: int = 4096) -> str:
        """带图片的对话接口"""
        # 构建多模态 content
        content_parts = [{"type": "text", "text": user_prompt}]

        if image_base64:
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{image_base64}"}
            })
        elif image_url:
            content_parts.append({
                "type": "image_url",
                "image_url": {"url": image_url}
            })

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": content_parts})

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self.api_base}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


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


# ====== 调度器 ======

_provider_cache: dict[str, BaseAIProvider] = {}


def get_provider(provider_name: str = "deepseek", api_key: str = "",
                 api_base: str = "", model: str = "") -> BaseAIProvider | None:
    """动态获取 AI 提供者实例"""
    cache_key = f"{provider_name}:{api_key}:{model}"

    if cache_key in _provider_cache:
        return _provider_cache[cache_key]

    if provider_name == "deepseek":
        k = api_key or settings.deepseek_api_key
        if not k:
            return None
        provider = DeepSeekProvider(api_key=k, api_base=api_base, model=model or "deepseek-chat")
    elif provider_name in ("讯飞星火OCR", "智谱GLM-4V"):
        # 视觉模型使用 VisionProvider
        k = api_key
        base = api_base
        if not k or not base:
            return None
        provider = OpenAIVisionProvider(api_key=k, api_base=base, model=model)
    else:
        # 所有其他服务商走 OpenAI 兼容适配器
        k = api_key
        base = api_base
        if not k or not base:
            return None
        provider = OpenAICompatibleProvider(api_key=k, api_base=base, model=model)

    _provider_cache[cache_key] = provider
    return provider


async def get_first_available_provider(db=None) -> BaseAIProvider | None:
    """获取第一个可用的AI服务商（用于系统级AI功能）"""
    # 优先使用环境变量配置的 DeepSeek
    if settings.deepseek_api_key:
        return get_provider("deepseek")

    # 从数据库查询第一个启用的服务商
    if db:
        from app.models.ai_provider import AIProvider
        from sqlalchemy import select
        q = select(AIProvider).where(AIProvider.is_enabled == True).limit(1)
        result = await db.execute(q)
        provider_record = result.scalar_one_or_none()
        if provider_record and provider_record.api_key:
            return get_provider(
                provider_name=provider_record.provider_name,
                api_key=provider_record.api_key,
                api_base=provider_record.api_base,
                model=provider_record.model_list[0] if provider_record.model_list else "",
            )

    return None


async def get_vision_provider(db=None) -> OpenAIVisionProvider | None:
    """获取第一个可用的视觉模型服务商（用于图表识别）"""
    if db:
        from app.models.ai_provider import AIProvider
        from sqlalchemy import select
        # 优先查找视觉模型服务商
        q = select(AIProvider).where(
            AIProvider.is_enabled == True,
            AIProvider.provider_name.in_(["讯飞星火OCR", "智谱GLM-4V"])
        ).limit(1)
        result = await db.execute(q)
        provider_record = result.scalar_one_or_none()
        if provider_record and provider_record.api_key:
            provider = get_provider(
                provider_name=provider_record.provider_name,
                api_key=provider_record.api_key,
                api_base=provider_record.api_base,
                model=provider_record.model_list[0] if provider_record.model_list else "",
            )
            if isinstance(provider, OpenAIVisionProvider):
                return provider

    return None


# ====== 兼容旧接口 ======

async def refine_questions_with_llm(questions: list[dict]) -> list[dict]:
    """兼容旧调用 — 使用默认 DeepSeek 配置"""
    provider = get_provider("deepseek")
    if not provider:
        return questions
    return await provider.refine_questions(questions)


async def classify_question_type(stem: str, options: list = None) -> str:
    """兼容旧调用 — 使用默认 DeepSeek 配置"""
    provider = get_provider("deepseek")
    if not provider:
        return "general"
    return await provider.classify_type(stem, options)
