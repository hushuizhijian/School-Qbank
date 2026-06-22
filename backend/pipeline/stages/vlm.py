"""
VLM 语义理解阶段

功能：使用视觉语言模型识别题目内容、题型、图形绑定
输入参数：context（含 pages, ocr_results）
返回值：context（含 vlm_results）
使用场景：需要 VLM 语义理解的场景（当前默认使用 MinerU，此阶段为可选）
"""
import logging
from pipeline.base import StageBase

logger = logging.getLogger(__name__)


class VlmStage(StageBase):
    """VLM 语义理解阶段"""

    stage_name = "vlm"

    async def process(self, context: dict) -> dict:
        pages = context.get("pages", [])  # 页面列表
        if not pages:
            context["_error"] = "无页面数据"
            return context

        # 检查是否启用 VLM
        config = context.get("config", {})
        if not config.get("vlm_enabled", False):
            logger.info("[VLM] VLM 阶段已禁用，跳过")
            return context

        # 获取视觉模型
        db_session = context.get("db_session")
        if db_session:
            try:
                from llm.factory import get_vision_provider
                vision_provider = await get_vision_provider(db_session)
                if vision_provider:
                    context["vision_provider"] = vision_provider
                    logger.info("[VLM] 视觉模型已就绪")
                else:
                    logger.warning("[VLM] 无可用视觉模型，跳过")
            except Exception as e:
                logger.warning(f"[VLM] 获取视觉模型失败: {e}")

        # 逐页进行 VLM 语义理解
        vlm_results = []
        for page in pages:
            page_idx = page.get("page_idx", 0)
            text = page.get("text", "")

            vlm_results.append({
                "page_idx": page_idx,
                "text": text,
                "questions": [],  # VLM 识别的题目列表
            })

        context["vlm_results"] = vlm_results  # VLM 结果
        return context