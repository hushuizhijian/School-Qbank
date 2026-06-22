"""
PDF 解析器

功能：使用 PyMuPDF 解析 PDF 文件，提取文本和页面图片
输入参数：pdf_path（PDF 文件路径）
返回值：解析结果字典（含 pages, raw_text）
使用场景：管道解析阶段，解析 PDF 格式的试卷
"""
import os
import fitz


class PDFParser:
    """PDF 文档解析器"""

    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path  # PDF 文件路径

    def parse(self) -> dict:
        """
        解析 PDF 文件

        Returns:
            解析结果字典，包含 pages 和 raw_text
        """
        if not os.path.exists(self.pdf_path):
            return {"error": f"PDF 文件不存在: {self.pdf_path}"}

        doc = fitz.open(self.pdf_path)  # 打开 PDF
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

        return {
            "pages": pages,
            "raw_text": "\n".join(raw_text_parts),
            "page_count": len(pages),
        }

    def render_page_image(self, page_idx: int, output_path: str, dpi: int = 200) -> bool:
        """
        将指定页面渲染为图片

        Args:
            page_idx: 页面索引（从0开始）
            output_path: 输出图片路径
            dpi: 渲染分辨率

        Returns:
            是否成功
        """
        try:
            doc = fitz.open(self.pdf_path)  # 打开 PDF
            if page_idx >= len(doc):
                doc.close()
                return False

            page = doc[page_idx]
            # 渲染页面为图片
            pix = page.get_pixmap(dpi=dpi)
            pix.save(output_path)
            doc.close()
            return True
        except Exception as e:
            print(f"[PDFParser] 渲染页面图片失败: {e}")
            return False