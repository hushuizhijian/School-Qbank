"""
LLM 题干优化阶段

功能：调用 LLM 修正错别字、转换 LaTeX 公式、判断题型
输入参数：context（含 questions 列表）
返回值：context（更新后的 questions）
使用场景：管道中的题干优化阶段
"""
import logging
from pipeline.base import StageBase

logger = logging.getLogger(__name__)


class RefineStage(StageBase):
    """题干优化阶段"""

    stage_name = "refine"

    async def process(self, context: dict) -> dict:
        questions = context.get("questions", [])  # 题目列表
        if not questions:
            return context

        # 获取 LLM 适配器
        provider = await self._get_provider(context)
        if not provider:
            logger.warning("[Refine] 无可用 AI 服务商，跳过题干优化")
            return context

        # 逐题优化
        refined_questions = []
        for q in questions:
            try:
                refined = await provider.refine_questions([q])  # 调用 LLM 优化
                if refined:
                    refined_questions.extend(refined)
                else:
                    refined_questions.append(q)  # 失败则保留原题
            except Exception as e:
                logger.error(f"[Refine] 题目优化失败: {e}")
                refined_questions.append(q)  # 失败则保留原题

        context["questions"] = refined_questions  # 更新题目列表
        logger.info(f"[Refine] 优化完成，共 {len(refined_questions)} 道题")
        return context

    async def _get_provider(self, context: dict):
        """获取 LLM 适配器 — 三级优先级解析

        解析顺序：
          1) 系统默认 chat 模型（system_settings.llm_id）
          2) 兜底：get_first_available_provider / 环境变量
        输入参数：context（管道上下文，含 db_session）
        返回值：BaseLLMProvider 实例或 None
        """
        try:
            from llm.factory import get_provider_by_model_type, get_first_available_provider
            db_session = context.get("db_session")
            # 优先级 1：系统默认 chat 模型
            try:
                provider = await get_provider_by_model_type(db_session, "chat")
                if provider is not None:
                    return provider
            except Exception:
                pass
            # 优先级 2：兜底
            return await get_first_available_provider(db_session)
        except Exception as e:
            logger.error(f"[Refine] 获取 LLM 适配器失败: {e}")
            return None