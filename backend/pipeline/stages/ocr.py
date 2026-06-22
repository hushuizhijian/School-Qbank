"""
OCR 版面分析阶段

功能：对页面进行 OCR 识别，检测文本块和图形区域
输入参数：context（含 pages）
返回值：context（含 ocr_results）
使用场景：需要 OCR 识别的场景（当前默认使用 MinerU，此阶段为可选）
"""
import logging
from pipeline.base import StageBase

logger = logging.getLogger(__name__)


class OcrStage(StageBase):
    """OCR 版面分析阶段"""

    stage_name = "ocr"

    async def process(self, context: dict) -> dict:
        pages = context.get("pages", [])  # 页面列表
        if not pages:
            context["_error"] = "无页面数据"
            return context

        # 检查是否启用 OCR
        config = context.get("config", {})
        if not config.get("ocr_enabled", False):
            logger.info("[OCR] OCR 阶段已禁用，跳过")
            return context

        # 版面分析：检测文本块、图形区域坐标
        ocr_results = []
        for page in pages:
            page_idx = page.get("page_idx", 0)
            # 从文本中提取基本块信息
            blocks = self._detect_blocks(page.get("text", ""))
            ocr_results.append({
                "page_idx": page_idx,
                "blocks": blocks,
            })

        context["ocr_results"] = ocr_results  # OCR 结果
        return context

    def _detect_blocks(self, text: str) -> list[dict]:
        """
        检测文本块

        Args:
            text: 页面文本

        Returns:
            文本块列表
        """
        blocks = []
        lines = text.strip().split("\n")  # 按行分割
        for line in lines:
            line = line.strip()
            if not line:
                continue
            blocks.append({
                "text": line,
                "type": "text",  # 默认为文本块
            })
        return blocks