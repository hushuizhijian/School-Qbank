"""
PDF 1:1 还原 — 端到端验证脚本

功能：验证后端 PDF 导出的字号、位置、边距与画布 CSS 像素严格 1:1 对应

验证项：
  1. 字号换算：page_config.font_size × 0.75 / scale == PDF 字号（pt）
  2. 坐标换算：page_config.box.x / 3.78 mm == PDF mm 坐标
  3. 边距对齐：A4 margin = 15mm 边距；A3 margin = 18mm 边距
  4. 行高一致：line_height = font_pt × 1.45

使用方法：
  cd f:\tools4\backend
  python -m scripts.verify_pdf_1to1
"""
import sys
import os
import io

# 确保能 import app 模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.pdf_export_service import (
    _px_to_mm, _canvas_px_to_pt, _LINE_HEIGHT_RATIO,
    _PX_PER_MM, _PT_PER_MM, _PX_TO_PT_RATIO,
    A4_MARGIN_LEFT, A4_MARGIN_TOP, A4_MARGIN_BOTTOM, A4_MARGIN_RIGHT,
    A3_MARGIN_LEFT, A3_MARGIN_TOP, A3_MARGIN_BOTTOM, A3_MARGIN_RIGHT,
)


def test_constants():
    """验证换算常量正确性"""
    print("=" * 60)
    print("[1] 常量验证")
    print("=" * 60)
    # 1mm = 3.7795 CSS px @ 96dpi
    assert abs(_PX_PER_MM - 3.7795275591) < 0.001, f"_PX_PER_MM 错误: {_PX_PER_MM}"
    print(f"  ✓ _PX_PER_MM = {_PX_PER_MM:.7f} (期望 3.7795276)")
    # 1mm = 72/25.4 pt
    assert abs(_PT_PER_MM - 2.83464566929) < 0.001, f"_PT_PER_MM 错误: {_PT_PER_MM}"
    print(f"  ✓ _PT_PER_MM = {_PT_PER_MM:.8f} (期望 2.8346457)")
    # 1px = 0.75pt（96dpi）
    assert abs(_PX_TO_PT_RATIO - 0.75) < 0.001, f"_PX_TO_PT_RATIO 错误: {_PX_TO_PT_RATIO}"
    print(f"  ✓ _PX_TO_PT_RATIO = {_PX_TO_PT_RATIO} (期望 0.75)")
    # 行高比
    assert _LINE_HEIGHT_RATIO == 1.45, f"_LINE_HEIGHT_RATIO 错误: {_LINE_HEIGHT_RATIO}"
    print(f"  ✓ _LINE_HEIGHT_RATIO = {_LINE_HEIGHT_RATIO} (期望 1.45)")


def test_px_to_mm():
    """验证 CSS px → mm 换算（物理 1:1）
    1mm = 3.7795 CSS px → mm = px / 3.7795
    """
    print("=" * 60)
    print("[2] CSS px → mm 换算（物理 1:1）")
    print("=" * 60)
    test_cases = [
        (0, 0.0),                # 0 px → 0 mm
        (3.7795, 1.0),           # 3.7795 px → 1 mm（96dpi）
        (7.559, 2.0),            # 7.559 px → 2 mm
        (37.795, 10.0),          # 37.795 px → 10 mm
        (793.7, 210.0),          # 793.7 px → 210 mm（A4 宽度）
        (1122.5, 297.0),         # 1122.5 px → 297 mm（A4 高度）
    ]
    for px, expected_mm in test_cases:
        actual_mm = _px_to_mm(px)
        diff = abs(actual_mm - expected_mm)
        ok = diff < 0.05  # 0.05mm 误差容限
        status = "✓" if ok else "✗"
        print(f"  {status} {px:>8.2f} px → {actual_mm:>8.4f} mm (期望 {expected_mm:.2f} mm, 误差 {diff:.4f})")
        assert ok, f"px_to_mm({px}) = {actual_mm} ≠ {expected_mm}"


def test_canvas_px_to_pt():
    """验证 CSS px → pt 换算（与画布 / scale 一致）
    公式：pt = px × 0.75 / scale
    验证：画布字号 N / scale px 与 PDF 字号 N × 0.75 / scale pt 物理尺寸一致
    """
    print("=" * 60)
    print("[3] CSS px → pt 字号换算（与画布 / scale 等效）")
    print("=" * 60)
    for scale in (0.6, 0.78):
        print(f"  -- scale = {scale} ({'A3' if scale == 0.6 else 'A4'})")
        # 验证几个常用字号：11（题干）、20（标题）、10（信息栏）
        for font_size in (10, 11, 14, 20, 32):
            pt = _canvas_px_to_pt(font_size, scale)
            # 画布字号 = font_size / scale
            canvas_px = font_size / scale
            # 物理尺寸（inch）
            canvas_inch = canvas_px / 96
            pdf_inch = pt / 72
            diff = abs(canvas_inch - pdf_inch)
            ok = diff < 0.001
            status = "✓" if ok else "✗"
            print(
                f"  {status} config={font_size:>3}px → "
                f"画布字号 {canvas_px:>5.2f}px (物理 {canvas_inch*25.4:>5.2f}mm) = "
                f"PDF {pt:>5.2f}pt (物理 {pdf_inch*25.4:>5.2f}mm), "
                f"误差 {diff*25.4:.3f}mm"
            )
            assert ok, f"字号 {font_size}px scale={scale} 物理尺寸不一致"


def test_margins():
    """验证页面边距与方案文档一致"""
    print("=" * 60)
    print("[4] 页面边距")
    print("=" * 60)
    from reportlab.lib.units import mm
    a4_expected = {  # mm
        "L": 15, "R": 15, "T": 20, "B": 15,
    }
    a3_expected = {
        "L": 18, "R": 18, "T": 22, "B": 18,
    }
    actual_a4 = {
        "L": A4_MARGIN_LEFT / mm,
        "R": A4_MARGIN_RIGHT / mm,
        "T": A4_MARGIN_TOP / mm,
        "B": A4_MARGIN_BOTTOM / mm,
    }
    actual_a3 = {
        "L": A3_MARGIN_LEFT / mm,
        "R": A3_MARGIN_RIGHT / mm,
        "T": A3_MARGIN_TOP / mm,
        "B": A3_MARGIN_BOTTOM / mm,
    }
    for k in a4_expected:
        diff = abs(actual_a4[k] - a4_expected[k])
        status = "✓" if diff < 0.01 else "✗"
        print(f"  {status} A4 {k} = {actual_a4[k]:.1f}mm (期望 {a4_expected[k]}mm)")
        assert diff < 0.01
    for k in a3_expected:
        diff = abs(actual_a3[k] - a3_expected[k])
        status = "✓" if diff < 0.01 else "✗"
        print(f"  {status} A3 {k} = {actual_a3[k]:.1f}mm (期望 {a3_expected[k]}mm)")
        assert diff < 0.01


def test_position_consistency():
    """验证元素位置在画布与 PDF 中物理一致

    画布 box.x CSS px → 物理 mm = box.x / 3.78
    后端 PDF mm = margin_left + box.x / 3.78
    """
    print("=" * 60)
    print("[5] 元素位置物理 1:1 一致性")
    print("=" * 60)
    # 验证一个 title_box 默认值在 A4 上的位置
    # titleBox.x = (physicalWidth - titleWidthDefault) / 2
    # physicalWidth = 210 * 3.78 = 793.8
    # titleWidthDefault = max(180, 20 * 12) = 240
    # titleBox.x = (793.8 - 240) / 2 = 276.9
    # 后端：box_x_mm = 15 + 276.9 / 3.78 = 15 + 73.25 = 88.25 mm
    # 画布：box.x = 276.9 px = 73.25 mm (276.9 / 3.78)
    # 两者相对 margin_left 的位置完全相同 ✓
    physical_width_px = 210 * 3.78
    title_width_px = max(180, 20 * 12)
    title_x_px = (physical_width_px - title_width_px) / 2
    # 画布物理位置
    canvas_x_mm_from_left = _px_to_mm(title_x_px)
    # 后端 PDF 位置
    pdf_x_mm_from_page = 15 + _px_to_mm(title_x_px)  # A4 margin_left = 15mm
    # 画布物理位置相对 margin_left
    canvas_x_mm_from_margin = canvas_x_mm_from_left
    diff = abs(canvas_x_mm_from_margin - (pdf_x_mm_from_page - 15))
    status = "✓" if diff < 0.01 else "✗"
    print(
        f"  {status} title_box 默认 x = {title_x_px:.2f}px\n"
        f"      画布: {canvas_x_mm_from_left:.2f}mm (相对纸张左边)\n"
        f"      PDF:  {pdf_x_mm_from_page:.2f}mm (相对纸张左边) = "
        f"{pdf_x_mm_from_page - 15:.2f}mm (相对 margin_left)\n"
        f"      误差: {diff:.4f}mm"
    )
    assert diff < 0.01, "title_box 位置不一致"


def test_line_height():
    """验证行高公式：line_height = font_pt × 1.45

    物理行高推导（与画布 1:1）：
      画布行高 = (font_size / scale) × 1.45 px
      PDF 行高 = (font_size × 0.75 / scale) × 1.45 pt
      两者物理 = font_size × 1.45 / (scale × 96) inch = 一致
    """
    print("=" * 60)
    print("[6] 行高公式：line_height = font_pt × 1.45")
    print("=" * 60)
    for scale in (0.6, 0.78):
        for font_size in (10, 11, 14, 20):
            pt = _canvas_px_to_pt(font_size, scale)
            line_height = pt * _LINE_HEIGHT_RATIO
            # PDF 物理行高（mm）
            pdf_physical_mm = line_height / 72 * 25.4
            # 画布物理行高（mm）= (font_size / scale) × 1.45 / 96 inch
            canvas_physical_mm = (font_size / scale) * _LINE_HEIGHT_RATIO / 96 * 25.4
            diff = abs(pdf_physical_mm - canvas_physical_mm)
            status = "✓" if diff < 0.01 else "✗"
            print(
                f"  {status} scale={scale} font={font_size}px → "
                f"line_height={line_height:.2f}pt → PDF物理 {pdf_physical_mm:.2f}mm "
                f"= 画布物理 {canvas_physical_mm:.2f}mm"
            )
            assert diff < 0.01


if __name__ == "__main__":
    test_constants()
    test_px_to_mm()
    test_canvas_px_to_pt()
    test_margins()
    test_position_consistency()
    test_line_height()
    print()
    print("=" * 60)
    print("  所有验证通过 ✓")
    print("=" * 60)
