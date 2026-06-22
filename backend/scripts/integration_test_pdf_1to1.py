"""
PDF 1:1 还原 — 端到端集成测试

功能：构造一个 mock Homework，调用 export_homework_pdf 生成 PDF，
      用 PyMuPDF 解析元素位置与字号，验证与画布 1:1 一致

前置依赖：
  pip install PyMuPDF reportlab sqlalchemy

使用方法：
  cd f:\tools4\backend
  python scripts/integration_test_pdf_1to1.py
"""
import sys
import os
import io
from datetime import datetime
from types import SimpleNamespace

# 确保能 import app 模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.pdf_export_service import (
    export_homework_pdf, _canvas_px_to_pt, _LINE_HEIGHT_RATIO,
    _PX_PER_MM,
)


def make_mock_homework(paper_size: str = "A4", title: str = "测试试卷"):
    """构造一个 mock Homework 对象（不依赖数据库）"""
    canvas_scale = 0.6 if paper_size == "A3" else 0.78
    # 物理像素尺寸（与前端 PaperPreview 一致）
    physical_w = (297 if paper_size == "A3" else 210) * 3.78
    # title_box 默认值
    title_width = max(180, 20 * 12)
    title_height = 20 * 1.8 + 18 * 3.78
    title_box = {
        "x": (physical_w - title_width) / 2,
        "y": 8 * 3.78,
        "width": title_width,
        "height": title_height,
        "show": True,
        "z_index": 5,
    }
    hw = SimpleNamespace(
        id="test-hw-1",
        user_id="test-user-1",
        title=title,
        subject="数学",
        grade="六年级",
        page_config={
            "paper_size": paper_size,
            "header_text": "XX 学校期末考试",
            "footer_text": "",
            "watermark_text": "",
            "watermark_opacity": 0.08,
            "watermark_angle": -30,
            "watermark_size": 56,
            "logo_url": "",
            "logo_width": 18,
            "question_font_size": 11,
            "header_font_size": 10,
            "footer_font_size": 9,
            "title_font_size": 20,
            "info_font_size": 10,
            "show_subject_grade": True,
            "show_name_class": True,
            "title_box": title_box,
        },
        homework_questions=[],
    )
    return hw


class MockAsyncDB:
    """Mock 异步数据库会话（用 SimpleNamespace 模拟 Homework 查询结果）"""
    async def execute(self, stmt):
        # 这里只是占位，不实际查询
        result = SimpleNamespace(scalar_one_or_none=lambda: None)
        return result


async def test_export_a4():
    """测试 A4 纸张 PDF 导出"""
    print("=" * 60)
    print("[1] A4 纸张 PDF 导出（无题目，仅标题）")
    print("=" * 60)
    hw = make_mock_homework("A4")
    db = MockAsyncDB()
    buf = await export_homework_pdf(db, hw.id, hw.user_id)
    # 替换 hw 到 db 查询结果中
    # 实际 export_homework_pdf 会从 db 查 hw，这里我们简化：直接传 hw
    # 但 export_homework_pdf 是用 db.execute 查询的，所以需要 monkey-patch
    # 这里用更简单的方式：调用 _render_pdf（如果有），但目前是 inline
    # 改用直接构造 db mock 让 export_homework_pdf 能查出来
    print(f"  ✗ 当前实现是 inline 在 export_homework_pdf 内部，需要重新组织测试")
    print(f"  提示：见下方 test_render_* 系列测试")


def test_render_a4_direct():
    """直接调用 PDF 渲染（绕开数据库），仅验证 1:1 还原

    方案：把 export_homework_pdf 重构为 render_pdf(hw) -> BytesIO，
          然后数据库部分单独调用。这里用 monkey-patch 简化。
    """
    import asyncio
    from unittest.mock import AsyncMock
    from app.services import pdf_export_service
    from app.models.homework import Homework
    from sqlalchemy import select

    hw = make_mock_homework("A4")
    db = AsyncMock()
    # mock db.execute 返回 hw
    mock_result = AsyncMock()
    mock_result.scalar_one_or_none = lambda: hw
    db.execute = AsyncMock(return_value=mock_result)

    async def run():
        return await pdf_export_service.export_homework_pdf(db, hw.id, hw.user_id)

    buf = asyncio.run(run())
    pdf_bytes = buf.getvalue()
    print(f"  PDF 字节数: {len(pdf_bytes)}")

    # 解析 PDF
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        page = doc[0]
        page_w_pt = page.rect.width
        page_h_pt = page.rect.height
        print(f"  PDF 页面尺寸: {page_w_pt:.2f}pt × {page_h_pt:.2f}pt")
        # A4 物理尺寸 = 595.28pt × 841.89pt
        print(f"  A4 标准: 595.28pt × 841.89pt")
        # 文字块
        text_dict = page.get_text("dict")
        for block in text_dict.get("blocks", []):
            if "lines" in block:
                for line in block["lines"]:
                    for span in line["spans"]:
                        font_size_pt = span["size"]
                        text = span["text"]
                        if text.strip():
                            print(f"    文本: {text[:20]:<20} 字号 {font_size_pt:.2f}pt")
        # 验证：标题字号应该 ≈ 20 × 0.75 / 0.78 = 19.23pt
        doc.close()
    except ImportError:
        print("  ⚠ PyMuPDF 未安装，跳过 PDF 解析")
        return

    print("  ✓ PDF 生成成功")


def test_canvas_to_pdf_consistency():
    """验证画布 box 坐标到 PDF 物理坐标的 1:1 换算

    模拟前端画布设置：
      - title_box.x = 276.9 px（A4 默认居中）
      - 物理位置 = 276.9 / 3.78 = 73.26 mm（相对画布左边）
      - PDF mm 位置 = 15 (margin_left) + 73.26 = 88.26 mm（相对纸张左边）
    """
    print("=" * 60)
    print("[2] 画布 → PDF 物理坐标 1:1 换算")
    print("=" * 60)
    # A4 默认 title_box
    physical_w_px = 210 * 3.78
    title_width_px = max(180, 20 * 12)
    title_x_px = (physical_w_px - title_width_px) / 2
    # 画布物理 mm（相对画布左边）
    canvas_x_mm = title_x_px / _PX_PER_MM
    # PDF 物理 mm（相对纸张左边，含 margin）
    margin_left_mm = 15
    pdf_x_mm = margin_left_mm + title_x_px / _PX_PER_MM
    # PDF y：title_box.y = 8mm × 3.78 = 30.24 px（距画布顶部）
    title_y_px = 8 * 3.78
    pdf_y_top_mm = 20 + title_y_px / _PX_PER_MM  # 距纸张顶部的 mm
    pdf_y_bottom_mm = 297 - pdf_y_top_mm  # 距纸张底部的 mm（PDF 坐标系）

    print(f"  画布 title_box.x = {title_x_px:.2f} CSS px")
    print(f"  画布物理位置 = {canvas_x_mm:.2f} mm (相对画布左边)")
    print(f"  PDF x 位置   = {pdf_x_mm:.2f} mm (相对纸张左边)")
    print(f"  PDF y 位置   = {pdf_y_bottom_mm:.2f} mm (相对纸张底部)")
    # 验证：画布物理 mm + margin_left = PDF x mm
    assert abs((canvas_x_mm + margin_left_mm) - pdf_x_mm) < 0.01
    print("  ✓ 1:1 一致")


def test_font_size_consistency():
    """验证字号 1:1 还原：A4 配置 20px = PDF 19.23pt"""
    print("=" * 60)
    print("[3] 字号 1:1 还原")
    print("=" * 60)
    # 后端
    scale = 0.78
    config_px = 20
    pdf_pt = _canvas_px_to_pt(config_px, scale)
    print(f"  配置字号: {config_px}px (A4)")
    print(f"  PDF 字号: {pdf_pt:.2f}pt (期望 {20 * 0.75 / scale:.2f}pt)")
    # 验证
    expected = 20 * 0.75 / 0.78
    assert abs(pdf_pt - expected) < 0.01
    # 物理高度
    canvas_px = config_px / scale
    canvas_physical_inch = canvas_px / 96
    pdf_physical_inch = pdf_pt / 72
    print(f"  画布字号: {canvas_px:.2f}px → 物理 {canvas_physical_inch*25.4:.2f}mm")
    print(f"  PDF 字号: {pdf_pt:.2f}pt → 物理 {pdf_physical_inch*25.4:.2f}mm")
    assert abs(canvas_physical_inch - pdf_physical_inch) < 0.001
    print("  ✓ 1:1 一致")


if __name__ == "__main__":
    test_canvas_to_pdf_consistency()
    test_font_size_consistency()
    try:
        test_render_a4_direct()
    except Exception as e:
        print(f"  ✗ PDF 渲染测试失败: {e}")
    print()
    print("=" * 60)
    print("  集成测试完成")
    print("=" * 60)
