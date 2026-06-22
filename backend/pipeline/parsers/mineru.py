"""
MinerU 云端解析器

功能：封装 MinerU 云端 API 调用，将 PDF 提交到云端解析
输入参数：pdf_path（PDF 文件路径）/ config（解析配置）
返回值：MinerU 解析结果
使用场景：管道解析阶段，使用 MinerU 云端解析 PDF
"""
import os
import logging
from pipeline.parsers.pdf import PDFParser

logger = logging.getLogger(__name__)


class MinerUParser:
    """MinerU 云端解析器适配器"""

    def __init__(self, pdf_path: str, config: dict = None):
        self.pdf_path = pdf_path  # PDF 文件路径
        self.config = config or {}  # 解析配置

    async def parse(self) -> dict:
        """
        使用 MinerU 云端解析 PDF

        Returns:
            解析结果字典
        """
        if not os.path.exists(self.pdf_path):
            return {"error": f"PDF 文件不存在: {self.pdf_path}"}

        try:
            from app.services.mineru_service import mineru_service

            # 获取配置参数
            model = self.config.get("model", "vlm")  # 解析模型
            language = self.config.get("language", "ch")  # 语言
            timeout = self.config.get("timeout", 300)  # 超时时间

            # 调用 MinerU 服务
            result = await mineru_service.parse_pdf(
                self.pdf_path,
                model=model,
                language=language,
                timeout=timeout,
            )

            if result.error:
                return {"error": f"MinerU 解析失败: {result.error}"}

            return {
                "task_id": result.task_id,
                "markdown": result.markdown or "",
                "latex": result.latex or "",
                "content_list": result.content_list or [],
                "images": result.images or [],
                "success": True,
            }
        except Exception as e:
            logger.error(f"[MinerUParser] 解析失败: {e}")
            return {"error": str(e)}

    def parse_local(self) -> dict:
        """
        本地回退解析（使用 PyMuPDF）

        Returns:
            解析结果字典
        """
        parser = PDFParser(self.pdf_path)  # 本地 PDF 解析器
        return parser.parse()