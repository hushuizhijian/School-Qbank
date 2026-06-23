"""
AI 操作服务 — V2新增

功能：AI匹配知识点/拆分小问/错别字校正/生成解析/题干标准化/难度标注/批量标准化
输入参数：db会话 / question_id / BatchStandardizeRequest
返回值：AiOperationResponse / 批量操作结果
使用场景：AI辅助题目处理

模型解析三级优先级：
  1) 用户主动选择（provider_key/instance_name/model_key）
  2) 系统默认模型（system_settings.llm_id/img2txt_id/... 按 model_type）
  3) 兜底链（旧 ai_providers 表 → get_first_available_provider → env）
"""
import json
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.question import Question
from app.models.system_setting import SystemSetting
from app.schemas.ai import AiOperationResponse, BatchStandardizeRequest
from llm import factory as llm_factory
from app.services import knowledge_service
from app.services.system_setting_service import MODEL_TYPE_TO_KEY, parse_model_value


# ========== 解析 Prompt 模板（按题型分发） ==========

# 通用解析 prompt（默认走这条）
_GENERAL_ANALYSIS_PROMPT = """你是一名小学数学老师，请为以下题目生成解析，严格按三段固定格式输出（整段不超过 150 字）：

**解题思路：**
（1 段，不超过 3 句话。点明本题考查的知识点 + 解题核心方法。）

**解题步骤：**
（编号列表，3~5 步。每步一行；最后一步必须包含验算。）

**参考答案：**
（仅一行最终结果，格式：数字 + 单位。若无单位写"无"。）

规则：
1. 题目为纯数字读法 / 写法题时，忽略题干中虚构的情境描述（如"世界上最大的洋"），只处理数字本身。
2. 中文大写数字必须用阿拉伯数字 + 单位写出，禁止汉字堆砌。
3. 验算固定格式："验算：将 X 写成 Y 形式，无误。" 或 "验算：按 Y 反向读出 Z，与原数一致。"
4. 禁止出现"小贴士""思维导图""举一反三"等无关内容。
5. 数学公式用 LaTeX 格式（如 $a^2+b^2=c^2$）。

题目：{stem}
已知答案：{answer}
"""

# 计算题专用 prompt（question_type == "calculation" 时触发）
# ponytail: 仅在 calculation 题型下替换；通用规则不适用——递等式是计算题标准格式
_CALCULATION_ANALYSIS_PROMPT = """你是一名小学数学老师，请为以下计算题生成解析，严格按下方格式输出（整段不超过 400 字）：

**解题步骤：**
（按原式运算顺序，把计算过程拆成 3~5 行。**每个步骤占一行**——同一行内用 `=` 链连接各次变换（向右写），不同步骤之间用空行分隔。最后一步的最终答案用 Markdown 加粗（数字两侧加 `**`）。

**严禁**：
1. 整行算式用 `$$...$$` 块级 LaTeX 包裹（块级公式内部 `=` 自动居中换行，无法链式书写）
2. 每行只写一个 `=`、把递等式拉成多行
3. "第一步/第二步"等列表编号
4. "解题思路""方法总结""验算""小贴士"等段落

格式样例（行内 `=` 链，不用 `$$` 块）：
**解题步骤：**
8/9 × 2/5 ÷ 24 + 7 × 0.6 - 3/5 = 8/9 × 2/5 × 1/24 + 2/5 × 15/8 = 2×15 / (9×5) = 30/45 = 2/3

3/5 × 24 + 7 × 0.6 - 3/5 = 3/5(24-1) + 4.2 = 3/5 × 23 + 4.2 = 13.8 + 4.2 = **18**

9.83 - (4.93 + 2¼) = 9.83 - (4.93 + 2.25) = 9.83 - 7.18 = **2.65**

24 ÷ (9/10 - 3/40) × 4/15 = 24 ÷ 1/24 × 4/15 = 24 × 24 × 4/15 = 24 × 24/15 = **57**

简便计算规则（必须先用）：
1. 拿到算式后**先观察**：是否含乘法分配律（a×b ± a×c）、提取公因数（ab + ac）、凑整（99 / 9.9 / 1.01 / 0.99）、结合律、拆分（99×a = 100a - a，102×a = 100a + 2a）？
2. **存在简便方法的必须先用**，把它写在 `=` 链的变换过程中。
3. 简便方法与标准方法并存时，**优先简便方法**。
4. 无简便方法时按标准运算顺序（先括号 → 再乘除 → 最后加减）逐步化简。

其他规则：
1. 中文大写数字（如"二又四分之一"）必须先转化为阿拉伯数字 / 分数再代入。
2. 数学公式用**行内** LaTeX（如 `$\\frac{{8}}{{9}}$`），**严禁** `$$...$$` 块级。
3. 递等式要写完所有步骤，不可中途截断或省略中间变换。

题目：{stem}
已知答案：{answer}
"""


def build_analysis_prompt(stem: str, answer: str, question_type: str = "general") -> str:
    """构建解析生成 prompt — 按题型分发模板

    功能：根据题目类型选择不同的 prompt 模板
    输入参数：
      - stem: 题干
      - answer: 已知答案
      - question_type: 题型（general / choice / fill / calculation / application）
    返回值：完整的 prompt 字符串
    使用场景：generate_analysis / generate_analysis_text 共用
    """
    answer_text = answer if answer else "（无）"
    # 计算题走专用模板，其他题型走通用模板
    if question_type == "calculation":
        return _CALCULATION_ANALYSIS_PROMPT.format(stem=stem, answer=answer_text)
    return _GENERAL_ANALYSIS_PROMPT.format(stem=stem, answer=answer_text)


def _looks_like_calculation(stem: str) -> bool:
    """启发式判断题干是否为计算题

    功能：在没有 Question 对象（如异步任务）时，从题干文本中检测计算题特征
    输入参数：stem — 题干文本
    返回值：True=计算题，False=其他
    使用场景：generate_analysis_text 异步任务入口
    """
    import re
    # 计算题特征：含多个运算符 + 数字（≥3 个数字 / ≥2 个运算符）
    # 排除：纯单位换算（如"1米=（）厘米"）和百分数 / 分数定义题
    operator_pattern = re.compile(r'[+\-×÷\*\/=]')
    digit_pattern = re.compile(r'\d')
    operator_count = len(operator_pattern.findall(stem))
    digit_count = len(digit_pattern.findall(stem))
    # 算式密集型判定：≥3 个数字 + ≥2 个运算符 → 计算题
    return digit_count >= 3 and operator_count >= 2


class AIService:
    """AI 操作服务类

    构造参数：
      - db: 数据库会话
      - provider_key: 前端选择的供应商标识（最高优先）
      - instance_name: 前端选择的实例名称（多实例时区分）
      - model_key: 前端选择的模型标识
      - model_type: 模型类型（chat/embedding/image2text/...），用于从系统默认模型解析
    """

    def __init__(
        self,
        db: AsyncSession,
        provider_key: str = "",
        instance_name: str = "",
        model_key: str = "",
        model_type: str = "chat",
    ):
        self.db = db
        self.provider_key = provider_key      # 前端选择的供应商标识
        self.instance_name = instance_name    # 前端选择的实例名称（多实例时区分）
        self.model_key = model_key            # 前端选择的模型标识
        self.model_type = model_type          # 模型类型（默认 chat）

    async def _get_question(self, question_id: str) -> Question:
        """获取题目，不存在则抛异常"""
        q = await self.db.get(Question, question_id)
        if not q:
            raise HTTPException(status_code=404, detail="题目不存在")
        return q

    async def _get_provider(self):
        """获取AI提供商 — 三级优先级解析

        解析顺序：
          1) 用户主动选择（provider_key/instance_name/model_key 非空）
          2) 系统默认模型（按 model_type 读取 system_settings 对应字段）
          3) 兜底：get_first_available_provider / 环境变量
        """
        # 优先级 1：前端指定了供应商和模型
        if self.provider_key and self.model_key:
            provider = await self._get_provider_by_key(
                self.provider_key, self.model_key, self.instance_name
            )
            if provider:
                return provider

        # 优先级 2：系统默认模型（按 model_type 解析 system_settings）
        provider = await self._get_provider_by_default(self.model_type)
        if provider:
            return provider

        # 优先级 3：兜底
        provider = await llm_factory.get_first_available_provider(self.db)
        if not provider:
            raise HTTPException(status_code=503, detail="无可用AI服务商，请在系统设置中配置")
        return provider

    async def _get_provider_by_default(self, model_type: str):
        """按 model_type 解析 system_settings 中的系统默认模型

        功能：从 system_settings 表读取 model_type 对应的默认配置（llm_id / embd_id / img2txt_id / ...），
              解析 "provider|instance|model" 格式，构造 AI 适配器实例
        输入参数：model_type — 模型类型（chat / embedding / image2text / speech2text / rerank / tts）
        返回值：BaseLLMProvider 实例或 None
        使用场景：用户未主动选择模型时，按系统默认模型解析
        """
        # 查询 system_settings 中该 model_type 对应的 setting_key
        setting_key = MODEL_TYPE_TO_KEY.get(model_type)
        if not setting_key:
            return None

        try:
            # 按 setting_key 查询（主键是 id，需用 select + where）
            stmt = select(SystemSetting).where(SystemSetting.setting_key == setting_key)
            result = await self.db.execute(stmt)
            row = result.scalar_one_or_none()
        except Exception:
            return None
        if not row or not row.setting_value:
            return None

        # 解析 "provider|instance|model" 格式
        parsed = parse_model_value(row.setting_value)
        if not parsed:
            return None

        # 复用 _get_provider_by_key 解析具体实例
        return await self._get_provider_by_key(
            parsed["model_provider"],
            parsed["model_name"],
            parsed["model_instance"],
        )

    async def _get_provider_by_key(self, provider_key: str, model_key: str, instance_name: str = ""):
        """根据供应商标识、模型标识和实例名称获取AI提供商实例

        功能：从数据库中查询匹配的供应商、实例、模型，构造对应的AI适配器实例
        输入参数：
          - provider_key（供应商名称或ID）
          - model_key（模型名称）
          - instance_name（实例名称，多实例场景下区分；空时取第一个 active 实例）
        返回值：BaseLLMProvider 实例或 None
        使用场景：前端AiModelSelector选择供应商/模型后调用
        """
        import json
        from llm.factory import get_provider
        from app.models.tenant_provider import TenantModelProvider
        from app.models.provider_instance import ProviderInstance
        from sqlalchemy import select as sa_select

        # 从数据库查询匹配的供应商（按名称匹配）
        provider_q = sa_select(TenantModelProvider).where(
            TenantModelProvider.provider_name == provider_key
        ).limit(1)
        provider_result = await self.db.execute(provider_q)
        provider_record = provider_result.scalar_one_or_none()

        if not provider_record:
            # 兼容旧逻辑：尝试从 ai_providers 表查找
            return await self._get_provider_by_key_legacy(provider_key, model_key)

        # 查询该供应商下的实例（按 instance_name 精确匹配；为空则取第一个 active 实例）
        instance_q = sa_select(ProviderInstance).where(
            ProviderInstance.provider_id == provider_record.id,
            ProviderInstance.status == "active",
        )
        if instance_name:
            instance_q = instance_q.where(ProviderInstance.instance_name == instance_name)
        instance_q = instance_q.limit(1)
        instance_result = await self.db.execute(instance_q)
        instance_record = instance_result.scalar_one_or_none()

        if not instance_record or not instance_record.api_key:
            return None

        # 解析 base_url（存储在 extra 字段中）
        api_base = ""
        try:
            extra_data = json.loads(instance_record.extra or "{}")
            api_base = extra_data.get("base_url", "") or ""
        except (json.JSONDecodeError, TypeError):
            pass

        # 构造AI适配器实例
        return get_provider(
            provider_name=provider_record.provider_name,
            api_key=instance_record.api_key,
            api_base=api_base,
            model=model_key,
        )

    async def _get_provider_by_key_legacy(self, provider_key: str, model_key: str):
        """兼容旧 ai_providers 表的供应商查找逻辑

        功能：当新表（tenant_model_providers）找不到时，回退到旧表 ai_providers
        输入参数：provider_key（供应商名称或ID）、model_key（模型名称）
        返回值：BaseLLMProvider 实例或 None
        使用场景：升级过渡期或历史数据
        """
        from llm.factory import get_provider
        from app.models.ai_provider import AIProvider
        from sqlalchemy import select as sa_select

        q = sa_select(AIProvider).where(
            (AIProvider.provider_name == provider_key) | (AIProvider.id == provider_key),
            AIProvider.is_enabled == True
        ).limit(1)
        result = await self.db.execute(q)
        provider_record = result.scalar_one_or_none()

        if not provider_record or not provider_record.api_key:
            return None

        return get_provider(
            provider_name=provider_record.provider_name,
            api_key=provider_record.api_key,
            api_base=provider_record.api_base,
            model=model_key,
        )

    @staticmethod
    def _build_response(
        question_id: str,
        action: str,
        success: bool,
        data: dict,
        message: str,
        confidence: float = 0.0,
        needs_confirmation: bool = False,
    ) -> AiOperationResponse:
        """构造 AI 操作响应 — 同时填充 data 与 result 字段以兼容新旧前端

        功能：与前端 AiOperationResponse 类型对齐，统一通过 data 字段传递操作结果
        输入参数：question_id / action / success / data / message / confidence / needs_confirmation
        返回值：AiOperationResponse 实例
        使用场景：AI 操作服务内部统一构造响应对象
        """
        return AiOperationResponse(
            question_id=question_id,
            action=action,
            success=success,
            data=data,                # 新字段：与前端 AiOperationResponse 对齐
            result=data,              # 旧字段：保留兼容历史代码
            message=message,
            confidence=confidence,
            needs_confirmation=needs_confirmation,
        )

    async def match_knowledge(self, question_id: str) -> AiOperationResponse:
        """AI 匹配知识点 — 调用LLM分析题干，推荐匹配的知识点（最多 3 个）"""
        q = await self._get_question(question_id)
        provider = await self._get_provider()

        # 获取知识点体系概要
        from app.models.paper import Paper
        paper = await self.db.get(Paper, q.paper_id) if q.paper_id else None
        subject = paper.subject if paper else "数学"

        # 获取知识点名称列表
        kp_list = await knowledge_service.list_by_subject(self.db, subject)
        kp_names = [kp["name"] for kp in kp_list]
        kp_name_to_id = {kp["name"]: kp["id"] for kp in kp_list}

        # 调用 LLM 匹配知识点
        matched_names = await provider.match_knowledge_points(q.stem, subject, kp_names)

        # 将匹配到的名称转为结构化的 matches 列表（与前端 AiMatchKnowledgeResult 对齐）
        matches = []
        matched_ids = []
        new_kps = []

        for name in matched_names:
            name = name.strip()
            if not name:
                continue
            # 默认置信度：已知知识点 0.92，AI 新建 0.6
            if name in kp_name_to_id:
                kp_id = kp_name_to_id[name]
                confidence = 0.92
                reason = "AI 基于题干内容推荐"
            else:
                # 自动创建新知识点（挂到 AI 推荐的最相似父节点下）
                new_kp = await knowledge_service.find_or_create_smart(
                    self.db, subject, name, provider=provider
                )
                kp_id = new_kp["id"]
                confidence = 0.6
                reason = "AI 识别到新知识点，已自动创建并挂到最相似父节点"
                new_kps.append(name)
            matched_ids.append(kp_id)
            matches.append({
                "kp_code": kp_id,           # 前端期望的字段：知识点编码（这里使用 id）
                "kp_name": name,            # 前端期望的字段：知识点名称
                "confidence": confidence,   # 前端期望的字段：置信度
                "reason": reason,           # 前端期望的字段：匹配理由
            })

        # 业务规则：一道题最多绑定 3 个知识点（去重保序）
        seen = set()
        limited = []
        for mid in matched_ids:
            if mid in seen:
                continue
            seen.add(mid)
            limited.append(mid)
            if len(limited) >= 3:
                break
        matched_ids = limited
        # 同步裁剪 matches 列表（按 matched_ids 顺序）
        if matches:
            id_to_match = {m["kp_code"]: m for m in matches}
            matches = [id_to_match[i] for i in matched_ids if i in id_to_match]

        # 更新题目的知识点
        if matched_ids:
            q.knowledge_points = matched_ids
            await self.db.commit()

        return self._build_response(
            question_id=question_id,
            action="match_knowledge",
            success=True,
            data={
                "matches": matches,                        # 与前端 AiMatchKnowledge 对齐
                "matched_ids": matched_ids,                # 兼容旧字段
                "matched_names": matched_names,            # 兼容旧字段
                "new_knowledge_points": new_kps,           # 兼容旧字段
            },
            message=f"匹配到{len(matched_ids)}个知识点" + (f"，新建{len(new_kps)}个" if new_kps else ""),
        )

    async def split_subquestions(self, question_id: str) -> AiOperationResponse:
        """AI 拆分小问 — 将综合题拆分为多个小问"""
        q = await self._get_question(question_id)
        provider = await self._get_provider()
        original_text = q.stem or ""

        prompt = f"""请将以下综合题拆分为多个小问，保持原意不变。

题目：{q.stem}

输出格式（严格 JSON）：
{{
  "subquestions": [
    {{"no": 1, "stem": "小问1的题干", "answer": "小问1的答案（如有）"}},
    {{"no": 2, "stem": "小问2的题干", "answer": "小问2的答案（如有）"}}
  ]
}}

只返回 JSON，不要其他内容。"""

        try:
            content = await provider.chat("你是一个题目拆分专家。", prompt, temperature=0.1, max_tokens=2048)
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]
            result = json.loads(content.strip())
            subquestions_raw = result.get("subquestions", [])

            # 转换为前端期望的 sub_questions 字段（{ sub_no, content } 结构）
            sub_questions = []
            for sq in subquestions_raw:
                sub_questions.append({
                    "sub_no": sq.get("no") or sq.get("sub_no") or 0,
                    "content": sq.get("stem") or sq.get("content") or "",
                })

            return self._build_response(
                question_id=question_id,
                action="split_subquestions",
                success=True,
                data={
                    "sub_questions": sub_questions,  # 与前端 AiSplitSubQuestions 对齐
                    "original_text": original_text,  # 与前端期望对齐
                    "subquestions": subquestions_raw,  # 兼容旧字段
                },
                message=f"成功拆分为{len(sub_questions)}个小问",
            )
        except Exception as e:
            return self._build_response(
                question_id=question_id,
                action="split_subquestions",
                success=False,
                data={"sub_questions": [], "original_text": original_text, "subquestions": []},
                message=f"拆分失败: {str(e)[:200]}",
            )

    async def fix_typos(self, question_id: str) -> AiOperationResponse:
        """AI 错别字校正 — 检测并修正题干中的错别字"""
        q = await self._get_question(question_id)
        provider = await self._get_provider()
        original_text = q.stem or ""

        prompt = f"""请检查以下题目文本中的错别字并修正。只返回修正后的文本，不要其他内容。
如果没有任何错别字，直接返回原文。

题目：{q.stem}

修正后的题目："""

        try:
            corrected = await provider.chat("你是一个中文校对专家，擅长发现并修正错别字。", prompt, temperature=0.1, max_tokens=1024)
            corrected = corrected.strip()
            changed = bool(corrected) and corrected != original_text

            # 更新题干
            if changed:
                q.stem = corrected
                await self.db.commit()

            # 构造前端期望的 corrections 列表
            corrections = []
            if changed:
                # 简化处理：整段作为一个修正项
                corrections.append({
                    "original": original_text,
                    "corrected": corrected,
                    "reason": "AI 检测到错别字或可优化表达",
                })

            return self._build_response(
                question_id=question_id,
                action="fix_typos",
                success=True,
                data={
                    "corrections": corrections,                  # 与前端 AiFixTypos 对齐
                    "original": original_text,                  # 兼容旧字段
                    "corrected": corrected,                      # 兼容旧字段
                    "changed": changed,                          # 兼容旧字段
                },
                message="已修正错别字" if changed else "未发现错别字",
            )
        except Exception as e:
            return self._build_response(
                question_id=question_id,
                action="fix_typos",
                success=False,
                data={"corrections": [], "original": original_text, "corrected": original_text, "changed": False},
                message=f"校正失败: {str(e)[:200]}",
            )

    async def generate_analysis(self, question_id: str) -> AiOperationResponse:
        """AI 生成精简解析 — 为题目生成精炼的解题步骤"""
        q = await self._get_question(question_id)
        provider = await self._get_provider()
        stem = q.stem or ""

        try:
            # 按题型分发 prompt：计算题走递等式专用模板，其他走通用模板
            analysis_prompt = build_analysis_prompt(
                stem=stem,
                answer=q.answer or "",
                question_type=q.question_type or "general",
            )
            analysis = await provider.chat(
                "你是一名小学数学老师，擅长用简洁的语言讲解解题思路。",
                analysis_prompt,
                temperature=0.3,
                max_tokens=1024,
            )
            analysis = (analysis or "").strip()

            if analysis:
                # ★ 关键修复：保存到 analysis 字段（原代码错存到 answer）
                q.analysis = analysis
                await self.db.commit()

            return self._build_response(
                question_id=question_id,
                action="generate_analysis",
                success=bool(analysis),
                data={
                    "analysis": analysis,        # 与前端 AiGenerateAnalysis 对齐
                    "stem": stem,                # 附带题干，方便前端做 diff
                    "model": getattr(provider, "model", "") or self.model_key,  # 当前所用模型
                },
                message="已生成标准解析" if analysis else "生成解析失败",
            )
        except Exception as e:
            return self._build_response(
                question_id=question_id,
                action="generate_analysis",
                success=False,
                data={"analysis": "", "stem": stem},
                message=f"生成解析失败: {str(e)[:200]}",
            )

    async def standardize_stem(self, question_id: str) -> AiOperationResponse:
        """AI 题干标准化 — 规范化题干格式、LaTeX公式、标点符号"""
        q = await self._get_question(question_id)
        provider = await self._get_provider()
        original_stem = q.stem or ""

        try:
            standardized = await provider.refine_stem(original_stem)
            changed = bool(standardized) and standardized != original_stem

            # 更新题干
            if changed:
                q.stem = standardized
                await self.db.commit()

            return self._build_response(
                question_id=question_id,
                action="standardize_stem",
                success=bool(standardized),
                data={
                    "original_stem": original_stem,            # 与前端 AiStandardizeStem 对齐
                    "standardized_stem": standardized or "",   # 与前端 AiStandardizeStem 对齐
                    "standardized": standardized or "",        # 兼容旧字段
                    "changed": changed,                        # 兼容旧字段
                },
                message="已标准化题干" if changed else "题干已符合标准格式",
            )
        except Exception as e:
            return self._build_response(
                question_id=question_id,
                action="standardize_stem",
                success=False,
                data={"original_stem": original_stem, "standardized_stem": original_stem, "changed": False},
                message=f"标准化失败: {str(e)[:200]}",
            )

    async def auto_difficulty(self, question_id: str) -> AiOperationResponse:
        """AI 难度自动标注 — 根据题目内容自动判断 0.1~1.0 难度值
        评分规则：
        - 0.1~0.3 简单（基础概念、直接计算）
        - 0.4~0.6 中等（需要一定推理、多步计算）
        - 0.7~1.0 困难（综合应用、复杂推理、竞赛级）
        """
        q = await self._get_question(question_id)
        provider = await self._get_provider()

        prompt = f"""请为以下题目打一个 0.1~1.0 范围的难度分（保留 1 位小数）：
- 0.1~0.3 简单：基础概念、直接计算
- 0.4~0.6 中等：需要一定推理、多步计算
- 0.7~1.0 困难：综合应用、复杂推理、竞赛级

评分参考：
- 0.1 极简单（如 1+1=？）
- 0.3 较简单（如基础概念直接套公式）
- 0.5 中等（多步计算、需理解）
- 0.7 较难（多知识点综合）
- 0.9 困难（竞赛级、需创造性思维）
- 1.0 极难（超纲/竞赛压轴题）

题目：{q.stem}

要求：只返回一个 0.1~1.0 的小数（如 0.5），不要任何其他文字。"""

        try:
            result = await provider.chat("你是一个题目难度评估专家。", prompt, temperature=0, max_tokens=20)
            # 解析返回的数字，匹配第一个 0~1 范围的小数
            import re
            match = re.search(r"([01]?\.\d+|[01])", result.strip())
            if match:
                score = float(match.group(1))
            else:
                score = 0.5  # 默认中等
            # 截断到 0.1~1.0 范围，保留 1 位小数
            score = round(max(0.1, min(1.0, score)), 1)

            # 仅更新 ai_difficulty，不动 user_difficulty 和旧 difficulty
            q.ai_difficulty = score
            await self.db.commit()

            return self._build_response(
                question_id=question_id,
                action="auto_difficulty",
                success=True,
                data={
                    "ai_difficulty": score,                       # 与前端对齐
                    "score": score,                                # 兼容旧字段
                    "label": f"{score}",                           # 兼容旧字段
                    "reason": f"AI 根据题干内容评估为 {score}/1.0",
                },
                message=f"AI 难度评分：{score}/1.0",
                confidence=0.85,
            )
        except Exception as e:
            return self._build_response(
                question_id=question_id,
                action="auto_difficulty",
                success=False,
                data={"ai_difficulty": 0.5, "score": 0.5, "label": "0.5", "reason": ""},
                message=f"难度标注失败: {str(e)[:200]}",
            )

    async def generate_analysis_text(self, stem: str, answer: str = "") -> str:
        """AI 生成精简解析 — 给定题干/答案返回解析文本

        功能：复用 provider 适配器，调用 chat 模型生成解题解析
        输入参数：stem（题干）、answer（已知答案，可空）
        返回值：解析文本（失败返回空串）
        使用场景：questions.ai_explain / 异步任务
        """
        try:
            provider = await self._get_provider()
        except HTTPException:
            return ""
        # 异步任务没有 question 对象，按题干启发式判断题型：含大量算式/运算是计算题
        question_type = "calculation" if _looks_like_calculation(stem or "") else "general"
        prompt = build_analysis_prompt(
            stem=stem or "",
            answer=answer or "",
            question_type=question_type,
        )
        try:
            result = await provider.chat(
                "你是一名小学数学老师，擅长用简洁的语言讲解解题思路。",
                prompt,
                temperature=0.3,
                max_tokens=1024,
            )
            return (result or "").strip()
        except Exception as e:
            print(f"[AIService] generate_analysis_text 失败: {e}")
            return ""

    async def refine_stem_text(self, stem: str) -> str:
        """AI 优化题干 — 返回优化后的题干

        功能：复用 provider 适配器，调用 chat 模型优化题干
        输入参数：stem（原始题干）
        返回值：优化后的题干（失败返回空串）
        使用场景：questions.ai_refine / 异步任务
        """
        try:
            provider = await self._get_provider()
        except HTTPException:
            return ""
        try:
            result = await provider.refine_stem(stem or "")
            return (result or "").strip()
        except Exception as e:
            print(f"[AIService] refine_stem_text 失败: {e}")
            return ""

    async def batch_standardize(self, request: BatchStandardizeRequest) -> dict:
        results = []
        success_count = 0
        fail_count = 0

        for qid in request.question_ids:
            try:
                if request.action == "match_knowledge":
                    resp = await self.match_knowledge(qid)
                elif request.action == "fix_typos":
                    resp = await self.fix_typos(qid)
                elif request.action == "generate_analysis":
                    resp = await self.generate_analysis(qid)
                elif request.action == "standardize_stem":
                    resp = await self.standardize_stem(qid)
                elif request.action == "auto_difficulty":
                    resp = await self.auto_difficulty(qid)
                else:
                    results.append({"question_id": qid, "success": False, "message": f"不支持的操作: {request.action}"})
                    fail_count += 1
                    continue

                results.append({
                    "question_id": qid,
                    "success": resp.success,
                    "message": resp.message,
                })
                if resp.success:
                    success_count += 1
                else:
                    fail_count += 1
            except Exception as e:
                results.append({"question_id": qid, "success": False, "message": str(e)[:200]})
                fail_count += 1

        return {
            "action": request.action,
            "total": len(request.question_ids),
            "success_count": success_count,
            "fail_count": fail_count,
            "results": results,
        }

    async def batch_auto_ai(self, paper_id: str) -> dict:
        """进入校对工作台时，批量给试卷下所有缺 AI 标注的题目补全
        - ai_difficulty（0.1~1.0）
        - knowledge_points（最多 3 个；不存在的会通过 AI 智能创建）

        只对"还没自动打过分数"的题目补全（ai_difficulty IS NULL
        且 knowledge_points 为空），已被用户编辑过的不会重打。

        输入参数：paper_id — 试卷 ID
        返回值：{"total", "filled", "skipped", "failed", "details": [...]}
        使用场景：校对工作台进入时前端调用一次
        """
        from app.models.paper import Paper
        from app.models.question import Question
        from sqlalchemy import or_, update as sa_update

        # 找到该试卷下所有需要补全的题目
        stmt = select(Question).where(
            Question.paper_id == paper_id,
            Question.question_status != "error",
            or_(
                Question.ai_difficulty.is_(None),
                Question.knowledge_points == [],  # 空列表
            ),
        )
        result = await self.db.execute(stmt)
        questions = result.scalars().all()

        # 找到试卷学科
        paper = await self.db.get(Paper, paper_id)
        subject = paper.subject if paper else "数学"

        # 一次性拿 AI provider（每题复用）
        try:
            provider = await self._get_provider()
        except Exception as e:
            return {
                "total": len(questions),
                "filled": 0,
                "skipped": 0,
                "failed": len(questions),
                "details": [],
                "message": f"AI 供应商不可用：{str(e)[:200]}",
            }

        filled = 0
        failed = 0
        details: list[dict] = []

        for q in questions:
            update_fields: dict = {}
            try:
                # ---- 1) 难度 ----
                if q.ai_difficulty is None:
                    diff_resp = await self.auto_difficulty(q.id)
                    if diff_resp.success:
                        new_score = (diff_resp.data or {}).get("ai_difficulty")
                        if new_score is not None:
                            update_fields["ai_difficulty"] = new_score
                    else:
                        details.append({
                            "question_id": q.id,
                            "step": "auto_difficulty",
                            "message": diff_resp.message,
                        })

                # 刷新当前对象拿到最新 ai_difficulty（auto_difficulty 内部已 commit）
                await self.db.refresh(q)

                # ---- 2) 知识点 ----
                if not q.knowledge_points:
                    kp_resp = await self.match_knowledge(q.id)
                    if kp_resp.success:
                        matched_ids = (kp_resp.data or {}).get("matched_ids") or []
                        if matched_ids:
                            update_fields["knowledge_points"] = matched_ids
                    else:
                        details.append({
                            "question_id": q.id,
                            "step": "match_knowledge",
                            "message": kp_resp.message,
                        })

                # 写入数据库（合并两次可能的更新）
                if update_fields:
                    await self.db.execute(
                        sa_update(Question)
                        .where(Question.id == q.id)
                        .values(**update_fields)
                    )
                    await self.db.commit()
                    filled += 1
            except Exception as e:
                failed += 1
                details.append({
                    "question_id": q.id,
                    "step": "exception",
                    "message": str(e)[:200],
                })

        return {
            "total": len(questions),
            "filled": filled,
            "failed": failed,
            "skipped": 0,
            "details": details,
            "message": f"已为 {filled} 道题补全 AI 标注（失败 {failed}）",
        }
