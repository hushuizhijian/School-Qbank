"""
文档解析阶段

功能：将 PDF 文件转为页面图片和原始文本
输入参数：context（含 paper_id, db_session）
返回值：context（含 pages, raw_text）
使用场景：管道第一个阶段，解析 PDF 文档
"""
import os
import fitz
from pipeline.base import StageBase


class ParseStage(StageBase):
    """文档解析阶段 — 提取 PDF 页面和文本"""

    stage_name = "parse"

    async def process(self, context: dict) -> dict:
        paper_id = context.get("paper_id")  # 试卷ID
        db_session = context.get("db_session")  # 数据库会话

        # 获取试卷信息
        from app.models.paper import Paper
        from sqlalchemy import select

        result = await db_session.execute(
            select(Paper).where(Paper.id == paper_id)
        )
        paper = result.scalar_one_or_none()

        if not paper or not paper.file_path:
            context["_error"] = "试卷文件不存在"
            return context

        pdf_path = paper.file_path
        if not os.path.exists(pdf_path):
            context["_error"] = f"PDF 文件不存在: {pdf_path}"
            return context

        # 使用 PyMuPDF 解析 PDF
        doc = fitz.open(pdf_path)  # 打开 PDF
        pages = []
        raw_text_parts = []

        for page_idx in range(len(doc)):
            page = doc[page_idx]
            text = page.get_text()  # 提取文本
            raw_text_parts.append(text)

            pages.append({
                "page_idx": page_idx,
                "text": text,
                "width": page.rect.width,  # 页面宽度
                "height": page.rect.height,  # 页面高度
            })

        doc.close()

        # 更新上下文
        context["pages"] = pages  # 页面列表
        context["raw_text"] = "\n".join(raw_text_parts)  # 完整文本
        context["page_count"] = len(pages)  # 总页数
        return context