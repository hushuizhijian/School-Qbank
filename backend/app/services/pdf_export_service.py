"""
PDF 导出服务 — V2 组卷版（1:1 严格还原画布）

功能：将作业导出为PDF文件，支持 A3 / A4 两种纸张、单列/双列排版、
      页眉页脚、自定义 LOGO、水印、统一字体大小。
      严格按照画布的"用户拖动后的元素位置"进行 1:1 还原：
        - 页眉/Logo 完全按 page_config.header_box / page_config.logo_box
          的 (x, y, width, height) 精确定位，与前端画布 1:1 映射
        - 试卷标题按 page_config.title_box 或 title_top_offset 定位
        - 坐标系转换：前端 padding box 定位 → PDF 页面偏移 + margin 
          公式：pdf_x = margin_left + box.x / (scale * 3.78)
                pdf_y = page_h - margin_top - box.y / (scale * 3.78)
        - 题目不再硬塞题型/分值题头栏，1:1 复现画布简化后的样式
        - 留白行数与画布一致（读取 page_config.blank_lines，不再硬塞 3 行）
输入参数：db会话 / homework_id / user_id
返回值：BytesIO（PDF文件流）
使用场景：作业导出为PDF
"""
import os
import io
import math
import re
from typing import Callable

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A3, A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.homework import Homework
from app.services.latex_render_service import (
    split_text_by_formulas, render_latex_to_image, is_latex_available
)

# 中文字体注册（Windows 系统字体）
_FONT_REGISTERED = False
_FONT_NAME = "Helvetica"  # 默认英文字体


def _register_fonts() -> str:
    """注册中文字体，返回首个可用字体名"""
    global _FONT_REGISTERED, _FONT_NAME
    if _FONT_REGISTERED:
        return _FONT_NAME
    font_paths = [
        ("C:/Windows/Fonts/simhei.ttf", "SimHei"),
        ("C:/Windows/Fonts/msyh.ttc", "MSYH"),
        ("C:/Windows/Fonts/simsun.ttc", "SimSun"),
    ]
    for path, name in font_paths:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                _FONT_NAME = name
                _FONT_REGISTERED = True
                return name
            except Exception:
                continue
    _FONT_NAME = "Helvetica"
    _FONT_REGISTERED = True
    return _FONT_NAME


# 页面默认尺寸常量
_A4_WIDTH, _A4_HEIGHT = A4  # 210 x 297 mm
_A3_WIDTH, _A3_HEIGHT = A3  # 297 x 420 mm

# A3 / A4 边距
A3_MARGIN_LEFT = 18 * mm
A3_MARGIN_RIGHT = 18 * mm
A3_MARGIN_TOP = 22 * mm
A3_MARGIN_BOTTOM = 18 * mm
A3_COL_GAP = 8 * mm  # 双列间隔

A4_MARGIN_LEFT = 15 * mm
A4_MARGIN_RIGHT = 15 * mm
A4_MARGIN_TOP = 20 * mm
A4_MARGIN_BOTTOM = 15 * mm

# 前端画布缩放因子：与 PaperPreview.tsx 中保持一致
# - A3: scale = 0.6
# - A4: scale = 0.78
# 单位换算：1mm ≈ 3.7795px（在 96dpi 下）
_PX_PER_MM = 3.7795275591
# 磅与毫米换算：1mm = 72/25.4 pt ≈ 2.8346 pt
_PT_PER_MM = 2.83464566929
# 文本行高比率：行高 = 字号(单位 pt) × 1.45（与画布 lineHeight 保持一致）
_LINE_HEIGHT_RATIO = 1.45
# CSS px 转 ReportLab pt 的换算系数：96dpi 下 1px = 0.75pt
_PX_TO_PT_RATIO = 0.75


def _px_to_mm(px: float) -> float:
    """前端画布的 CSS px 坐标转 mm（物理 1:1 换算）。

    输入参数：px - 像素值（前端画布 1:1 物理像素，与后端 paper 物理尺寸一致）
    返回值：mm 值
    使用场景：把 page_config.header_box / logo_box 等像素坐标转换为 PDF mm
    推导：1mm = 3.7795 CSS px（96dpi）→ mm = px / 3.7795
    注意：早期版本除以 scale（错误），因为当时画布尺寸本身缩放过；
          现在画布物理尺寸 = paper 物理尺寸，不需要再除以 scale
    """
    return px / _PX_PER_MM


def _canvas_px_to_pt(px: float, scale: float) -> float:
    """画布 CSS 像素（page_config 字段语义）转 ReportLab 磅数。

    输入参数：px - CSS 像素字号（与 page_config 中 font_size 字段同语义）
              scale - 画布显示缩放因子（A3=0.6, A4=0.78）
    返回值：pt 值（ReportLab 字号单位）
    使用场景：所有 c.setFont(name, size) 调用，确保 PDF 与画布 1:1
    换算公式：pt = px × 0.75 / scale
    推导：画布字号 N px，物理高度 = N / 96 inch；
          PDF 字号 M pt，物理高度 = M / 72 inch；
          1:1 一致：N / 96 = M / 72 → M = N × 72/96 = N × 0.75
          但画布字号 = 配置值 / scale，代入得 M = (配置值 / scale) × 0.75 = 配置值 × 0.75 / scale
    """
    return px * _PX_TO_PT_RATIO / scale


def _canvas_y_to_pdf_y(canvas_y_px: float, page_h_mm: float) -> float:
    """前端画布 y（自上而下）转 PDF y（自下而上，物理 1:1）。

    输入参数：canvas_y_px - 画布 y（自上而下 CSS px，画布物理尺寸与 paper 一致）；
              page_h_mm - 纸张高度（mm）
    返回值：PDF 坐标系下的 y（mm，自下而上）
    使用场景：把元素画布位置（顶左原点）转为 ReportLab 画布位置（底左原点）
    推导：画布 y CSS px 物理 = y / 3.78 mm；PDF y（自下而上）= page_h - y / 3.78
    """
    y_mm = _px_to_mm(canvas_y_px)
    return page_h_mm - y_mm


def _type_label(t: str) -> str:
    """题型中文标签"""
    labels = {
        "single": "单选题",
        "multi": "多选题",
        "fill": "填空题",
        "judge": "判断题",
        "general": "解答题",
    }
    return labels.get(t, "解答题")


def _strip_html(text: str) -> str:
    """简单去除 HTML 标签，保留文本与公式占位符"""
    if not text:
        return ""
    # 去掉 <img> 等标签但保留 alt
    text = re.sub(r"<img[^>]*alt=\"([^\"]*)\"[^>]*/?>", r"[图片:\1]", text)
    text = re.sub(r"<img[^>]*/?>", "[图片]", text)
    # 去掉其他 HTML 标签
    text = re.sub(r"<[^>]+>", "", text)
    # 解码 HTML 实体
    text = text.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return text.strip()


def _extract_img_srcs(html_text: str) -> list[str]:
    """从 HTML 文本中提取所有 <img> 标签的 src 属性。

    输入参数：html_text - 可能包含 HTML 的文本
    返回值：src URL 列表（按出现顺序）
    使用场景：题干中嵌入的图片，需要渲染到 PDF 中
    """
    if not html_text:
        return []
    srcs = []
    # 匹配 <img ... src="..." ...> 或 <img ... src='...' ...>
    for m in re.finditer(r'<img[^>]+src\s*=\s*["\']([^"\']+)["\'][^>]*>', html_text, re.IGNORECASE):
        srcs.append(m.group(1))
    return srcs


def _wrap_text_to_width(text: str, font_name: str, size: float, max_width: float) -> list[str]:
    """根据字体和最大宽度对文本进行按行换行（中英文粗略处理）"""
    if not text:
        return []
    lines = []
    for raw_line in text.split("\n"):
        if not raw_line:
            lines.append("")
            continue
        # 优先按显式换行符分块
        chunks = re.split(r"(<br\s*/?>)", raw_line, flags=re.IGNORECASE)
        for chunk in chunks:
            if not chunk:
                continue
            if re.match(r"<br\s*/?>", chunk, re.IGNORECASE):
                lines.append("")
                continue
            # 中文按字符切分，英文按空格切分
            # 简单策略：连续中文字符按字符切分，其他按空格切分
            tokens: list[str] = []
            i = 0
            while i < len(chunk):
                ch = chunk[i]
                if re.match(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]", ch):
                    # 单个中文汉字
                    tokens.append(ch)
                    i += 1
                elif ch == " ":
                    # 连续空格作为一个 token
                    j = i
                    while j < len(chunk) and chunk[j] == " ":
                        j += 1
                    tokens.append(chunk[i:j])
                    i = j
                else:
                    # 连续的英数 / 标点
                    j = i
                    while j < len(chunk) and not re.match(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef ]", chunk[j]):
                        j += 1
                    tokens.append(chunk[i:j])
                    i = j

            cur = ""
            for tok in tokens:
                candidate = cur + tok
                try:
                    w = pdfmetrics.stringWidth(candidate, font_name, size)
                except Exception:
                    w = len(candidate) * size * 0.5
                if w <= max_width:
                    cur = candidate
                else:
                    if cur:
                        lines.append(cur)
                    # 单词/长 token 强制切分
                    if pdfmetrics.stringWidth(tok, font_name, size) > max_width:
                        # 切分长 token
                        sub = ""
                        for ch in tok:
                            sub2 = sub + ch
                            if pdfmetrics.stringWidth(sub2, font_name, size) <= max_width:
                                sub = sub2
                            else:
                                if sub:
                                    lines.append(sub)
                                sub = ch
                        cur = sub
                    else:
                        cur = tok
            if cur:
                lines.append(cur)
    return lines


def _draw_wrapped_text(c, text, x, y, font_name, size, max_width, line_height, usable_bottom):
    """绘制按宽度自动换行的文本，返回绘制结束后的 y 坐标"""
    cleaned = _strip_html(text)
    lines = _wrap_text_to_width(cleaned, font_name, size, max_width)
    for line in lines:
        if y < usable_bottom:
            return y, True  # 触发换页
        if font_name:
            c.setFont(font_name, size)
        else:
            c.setFont("Helvetica", size)
        c.drawString(x, y, line)
        y -= line_height
    return y, False


def _draw_stem_with_formulas(
    c, text, x, y, font_name, size, max_width, line_height, usable_bottom, new_page_fn
):
    """绘制包含 LaTeX 公式的题干文本，返回绘制后的 y 坐标 + 是否换页"""
    segments = split_text_by_formulas(text)
    page_broken = False

    for seg in segments:
        if seg["type"] == "text":
            y, broken = _draw_wrapped_text(
                c, seg["content"], x, y, font_name, size,
                max_width, line_height, usable_bottom
            )
            if broken:
                new_page_fn()
                page_broken = True
                # 换页后从页顶继续
                y = c._current_y if hasattr(c, "_current_y") else y
        elif seg["type"] == "formula" and is_latex_available():
            img_bytes = render_latex_to_image(seg["content"], dpi=150, fontsize=size)
            if img_bytes:
                img_reader = ImageReader(io.BytesIO(img_bytes))
                iw, ih = img_reader.getSize()
                target_h = size + 6
                scale = target_h / ih
                target_w = iw * scale
                if y - target_h < usable_bottom:
                    new_page_fn()
                    page_broken = True
                c.drawImage(img_reader, x, y - target_h, width=target_w, height=target_h, mask='auto')
                y -= target_h + 2
            else:
                cleaned = _strip_html(seg["content"])
                y, broken = _draw_wrapped_text(
                    c, cleaned, x, y, font_name, size,
                    max_width, line_height, usable_bottom
                )
                if broken:
                    new_page_fn()
                    page_broken = True
        else:
            cleaned = _strip_html(seg["content"])
            y, broken = _draw_wrapped_text(
                c, cleaned, x, y, font_name, size,
                max_width, line_height, usable_bottom
            )
            if broken:
                new_page_fn()
                page_broken = True
    return y


def _resolve_image_path(path_or_url: str) -> str | None:
    """把传入的图片路径解析为磁盘绝对路径，兼容 /data/ 前缀、相对路径等"""
    if not path_or_url:
        return None
    p = path_or_url
    # 去掉 /data 前缀，转为相对路径
    if p.startswith("/data/"):
        p = p[len("/data/"):]
    # 已是磁盘绝对路径
    if os.path.isabs(p) and os.path.exists(p):
        return p
    # 相对路径：尝试在项目根的 data 目录中查找
    candidate = os.path.join("data", p)
    if os.path.exists(candidate):
        return candidate
    if os.path.exists(p):
        return p
    return None


async def export_homework_pdf(
    db: AsyncSession, homework_id: str, user_id: str
) -> io.BytesIO:
    """
    导出作业为 PDF（A3/A4 + 单列/双列，1:1 还原画布）

    功能：根据 page_config 渲染完整试卷 PDF，**完全按用户在画布上拖动后的位置**还原：
          - 页眉（header_box）和 Logo（logo_box）按元素 (x, y, width, height) 精确定位
          - 试卷标题按 title_top_offset 上下偏移（正值下移，与画布一致）
          - 题目不再显示题型/分值题头栏（与画布简化样式一致）
          - 留白行数读取 page_config.blank_lines（每题独立，不再硬塞 3 行）
          - 水印 / 字号仍按 page_config 应用
          - 需求（画布优化）：页脚已从格式设置中移除，PDF 不再绘制页脚
          - 需求（画布优化）：标题块布局 1:1 匹配画布（学科/年级行 + 姓名/班级/得分 + 学科/年级第二行）
    输入参数：db / homework_id / user_id
    返回值：BytesIO PDF 数据流
    使用场景：组卷页"导出 PDF"按钮
    """
    font_name = _register_fonts()

    # 读取作业
    result = await db.execute(
        select(Homework).where(
            Homework.id == homework_id, Homework.user_id == user_id
        )
    )
    hw = result.scalar_one_or_none()
    if not hw:
        raise ValueError("作业不存在")

    # 解析 page_config
    pc = hw.page_config or {}
    paper_size = (pc.get("paper_size") or "A4").upper()
    if paper_size not in ("A3", "A4"):
        paper_size = "A4"

    # 前端画布缩放因子，与 PaperPreview.tsx 中保持一致
    canvas_scale = 0.6 if paper_size == "A3" else 0.78

    header_text = pc.get("header_text") or ""
    footer_text = pc.get("footer_text") or ""
    watermark_text = pc.get("watermark_text") or ""
    watermark_opacity = float(pc.get("watermark_opacity", 0.08))
    watermark_angle = float(pc.get("watermark_angle", -30))
    logo_url = pc.get("logo_url") or ""
    logo_width_mm = float(pc.get("logo_width", 18))  # 单位 mm
    question_font_size = float(pc.get("question_font_size", 11))  # 题目正文字号（CSS px）
    header_font_size = float(pc.get("header_font_size", 10))  # 页眉字号（CSS px）
    footer_font_size = float(pc.get("footer_font_size", 9))  # 页脚字号（CSS px）
    title_font_size = float(pc.get("title_font_size", 20))  # 标题字号（CSS px）
    info_font_size = float(pc.get("info_font_size", 10))  # 信息栏字号（CSS px）
    # 需求（1:1 还原）：将 page_config 中的 CSS px 字号统一换算为 ReportLab pt，
    # 使 PDF 渲染尺寸与画布预览保持 1:1 物理尺寸
    question_pt = _canvas_px_to_pt(question_font_size, canvas_scale)  # 题目正文字号(pt)
    header_pt = _canvas_px_to_pt(header_font_size, canvas_scale)  # 页眉字号(pt)
    footer_pt = _canvas_px_to_pt(footer_font_size, canvas_scale)  # 页脚字号(pt)
    title_pt = _canvas_px_to_pt(title_font_size, canvas_scale)  # 标题字号(pt)
    info_pt = _canvas_px_to_pt(info_font_size, canvas_scale)  # 信息栏字号(pt)
    watermark_pt = _canvas_px_to_pt(float(pc.get("watermark_size", 56)), canvas_scale)  # 水印字号(pt)
    show_subject_grade = bool(pc.get("show_subject_grade", True))  # 是否在页眉显示学科年级
    show_name_class = bool(pc.get("show_name_class", True))  # 是否显示姓名班级得分

    # 需求 2：试卷标题相对默认位置的垂直偏移量（mm）
    # 负值上移，正值下移
    title_top_offset_mm = float(pc.get("title_top_offset", 0) or 0)

    # 需求 3：每题用户手动添加的留白行数（key = homework_questions.id）
    blank_lines_map: dict = pc.get("blank_lines") or {}

    # 需求 1：页眉/Logo 元素位置（px 坐标，画布坐标系）
    #   需求：完全按元素 (x, y, width, height) 定位
    #   - 不存在时回退到默认位置
    header_box = pc.get("header_box") or None
    logo_box = pc.get("logo_box") or None

    # 页面尺寸
    if paper_size == "A3":
        page_w, page_h = _A3_WIDTH, _A3_HEIGHT
        margin_left = A3_MARGIN_LEFT
        margin_right = A3_MARGIN_RIGHT
        margin_top = A3_MARGIN_TOP
        margin_bottom = A3_MARGIN_BOTTOM
        col_gap = A3_COL_GAP
    else:
        page_w, page_h = _A4_WIDTH, _A4_HEIGHT
        margin_left = A4_MARGIN_LEFT
        margin_right = A4_MARGIN_RIGHT
        margin_top = A4_MARGIN_TOP
        margin_bottom = A4_MARGIN_BOTTOM
        col_gap = 0

    usable_w = page_w - margin_left - margin_right
    usable_top = page_h - margin_top
    usable_bottom = margin_bottom

    # 双列布局下，每个列宽
    if paper_size == "A3":
        col_width = (usable_w - col_gap) / 2
    else:
        col_width = usable_w

    # 行高：与画布 lineHeight=1.45 保持一致，pt 单位
    line_height = question_pt * _LINE_HEIGHT_RATIO

    # 准备 logo（按原始 mm 尺寸加载）
    logo_img = None
    logo_img_w_mm = 0
    logo_img_h_mm = 0
    if logo_url:
        logo_path = _resolve_image_path(logo_url)
        if logo_path:
            try:
                logo_img = ImageReader(logo_path)
                iw, ih = logo_img.getSize()
                # 等比缩放到指定宽度（mm）
                target_w_mm = logo_width_mm
                scale_logo = target_w_mm / iw
                logo_img_w_mm = target_w_mm * mm
                logo_img_h_mm = ih * scale_logo * mm
            except Exception:
                logo_img = None

    # 是否需要标题区（首页顶部）
    has_cover = bool(hw.title or hw.subject or hw.grade)

    # 创建 PDF 画布
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))

    # 状态：每列的当前 y 坐标
    col_y = [usable_top, usable_top]  # 左列、右列当前 y
    current_col = 0  # 当前填充的列（0=左，1=右）
    page_num = 1

    def draw_watermark():
        """在当前页绘制水印"""
        if not watermark_text:
            return
        c.saveState()
        try:
            c.setFont(font_name, watermark_pt)
        except Exception:
            c.setFont("Helvetica", watermark_pt)
        c.setFillColorRGB(0.7, 0.7, 0.7)
        c.setFillAlpha(watermark_opacity)
        # 3 行 2 列均匀分布
        for row in range(3):
            for col in range(2):
                cx = page_w * (0.25 + col * 0.5)
                cy = page_h * (0.20 + row * 0.3)
                c.saveState()
                c.translate(cx, cy)
                c.rotate(watermark_angle)
                c.drawCentredString(0, 0, watermark_text)
                c.restoreState()
        c.restoreState()

    def draw_header():
        """绘制页眉 + Logo — 完全按 page_config.header_box / logo_box 的 (x, y, w, h) 定位。

        坐标系转换：
          - 前端：origin 在纸张左上角，y 自上而下，单位 px
          - PDF：origin 在纸张左下角，y 自下而上，单位 mm
          - 转换公式：pdf_x = box.x / (scale * 3.78) mm
                    pdf_y = page_h - box.y / (scale * 3.78) mm
                    pdf_w = box.width / (scale * 3.78) mm
                    pdf_h = box.height / (scale * 3.78) mm

        需求（Photoshop 图层）：按 z_index 升序自下而上叠加：
          - 先绘制 z 较小的，再绘制 z 较大的（z 大的覆盖在 z 小的之上）
          - 默认 z：页眉 (10) < Logo (20)
          - 未配置 z 时使用默认值
        """
        if not (header_text or logo_img or (show_subject_grade and (hw.subject or hw.grade))):
            return

        # 计算各元素的有效 z_index
        def _resolve_z(box, default_z):
            if not box:
                return default_z
            z = box.get("z_index")
            if z is None:
                return default_z
            try:
                return int(z)
            except (TypeError, ValueError):
                return default_z

        # 默认 z：页眉 10、Logo 20
        z_header = _resolve_z(header_box, 10)
        z_logo = _resolve_z(logo_box, 20)

        # 按 z 升序排序，依次绘制（z 小的先画，z 大的后画 → 覆盖在上）
        # 仅在两个元素都存在且都可见时才排序
        elements = []
        if logo_img and logo_box and logo_box.get("show", True) is not False:
            elements.append((z_logo, "logo"))
        if header_text and header_box and header_box.get("show", True) is not False:
            elements.append((z_header, "header"))
        # 按 z 升序排序
        elements.sort(key=lambda e: e[0])

        for z, etype in elements:
            if etype == "logo":
                try:
                    box_w_mm = _px_to_mm(logo_box.get("width", 0) or 0)
                    box_h_mm = _px_to_mm(logo_box.get("height", 0) or 0)
                    box_x_px = logo_box.get("x", 0) or 0
                    box_y_px = logo_box.get("y", 0) or 0
                    # 物理 1:1 换算：画布 CSS px 1:1 对应 paper 物理尺寸
                    # 画布 box 坐标即物理像素（mm × 3.78），不再除以 scale
                    box_x_mm = margin_left / mm + _px_to_mm(box_x_px)
                    box_y_pdf = page_h / mm - margin_top / mm - _px_to_mm(box_y_px)
                    # ReportLab drawImage 的 y 是图片底边的 y 坐标
                    img_bottom_y = box_y_pdf - box_h_mm
                    c.drawImage(
                        logo_img,
                        box_x_mm * mm,
                        img_bottom_y * mm,
                        width=box_w_mm * mm,
                        height=box_h_mm * mm,
                        mask='auto', preserveAspectRatio=True,
                    )
                except Exception:
                    pass
            elif etype == "header":
                try:
                    box_x_px = header_box.get("x", 0) or 0
                    box_y_px = header_box.get("y", 0) or 0
                    box_w_mm = _px_to_mm(header_box.get("width", 0) or 0)
                    box_h_mm = _px_to_mm(header_box.get("height", 0) or 0)
                    # 物理 1:1 换算
                    box_x_mm = margin_left / mm + _px_to_mm(box_x_px)
                    box_y_pdf = page_h / mm - margin_top / mm - _px_to_mm(box_y_px)
                    # 文字基线 y：垂直居中（box 中心 + ascent 偏移）
                    # 与画布 flex items-center justify-center 行为一致
                    text_y = box_y_pdf - box_h_mm / 2 + header_pt * 0.3
                    # 文字 x：水平居中于元素框
                    text_x = box_x_mm + box_w_mm / 2
                    try:
                        c.setFont(font_name, header_pt)
                    except Exception:
                        c.setFont("Helvetica", header_pt)
                    c.setFillColorRGB(0, 0, 0)
                    c.drawCentredString(text_x * mm, text_y * mm, header_text)
                except Exception:
                    pass

        # 兼容旧数据：未配置 logo_box 时按 logo_width 默认放在页眉左上
        # 仅在元素排序循环未处理到时执行
        if logo_img and not logo_box:
            header_top_y = page_h - 8 * mm
            try:
                c.drawImage(
                    logo_img, margin_left, header_top_y - logo_img_h_mm,
                    width=logo_img_w_mm, height=logo_img_h_mm,
                    mask='auto', preserveAspectRatio=True
                )
            except Exception:
                pass
        # 兼容旧数据：未配置 header_box 时按默认中央位置
        if header_text and not header_box:
            header_top_y = page_h - 8 * mm
            try:
                c.setFont(font_name, header_pt)
            except Exception:
                c.setFont("Helvetica", header_pt)
            c.setFillColorRGB(0, 0, 0)
            c.drawCentredString(page_w / 2, header_top_y - 2, header_text)

    def draw_footer():
        """绘制页脚：页码"""
        if not footer_text:
            return
        footer_y = margin_bottom - 6 * mm
        try:
            c.setFont(font_name, footer_pt)
        except Exception:
            c.setFont("Helvetica", footer_pt)
        c.setFillColorRGB(0, 0, 0)
        text = footer_text.replace("{page}", str(page_num))
        c.drawCentredString(page_w / 2, footer_y, text)

    def new_page():
        """换页：结束当前页，绘制页眉/水印，开新页
        需求（画布优化）：页脚已从格式设置中移除，新页面不再绘制页脚"""
        nonlocal page_num, col_y, current_col
        c.showPage()
        page_num += 1
        col_y = [usable_top, usable_top]
        current_col = 0
        draw_watermark()
        draw_header()
        # 需求（画布优化）：已移除页脚，draw_footer 不再调用

    def col_x(idx: int) -> float:
        """获取第 idx 列的左侧 x 坐标"""
        if paper_size == "A3":
            if idx == 0:
                return margin_left
            else:
                return margin_left + col_width + col_gap
        return margin_left

    def new_column():
        """切换到下一列（A3 双列专用），列满则换页"""
        nonlocal current_col, col_y
        if paper_size != "A3":
            # A4 单列：列满即换页
            new_page()
            return
        if current_col == 0:
            # 切换到右列
            current_col = 1
            col_y[1] = usable_top
        else:
            # 双列都满，换页
            new_page()

    def ensure_space(need: float) -> bool:
        """确保当前列有足够空间，必要时切换列/换页。返回是否换页"""
        # 关键：必须声明 nonlocal，否则函数内对 current_col/col_y 的赋值
        # 会让 Python 把整个函数体视为局部作用域，导致读取时 UnboundLocalError
        nonlocal current_col, col_y
        if col_y[current_col] - need >= usable_bottom:
            return False
        # 剩余空间不足
        if paper_size == "A3" and current_col == 0:
            # 切换到右列
            current_col = 1
            col_y[1] = usable_top
            return True
        # 右列或单列已满：换页
        new_page()
        return True

    # ===== 首页：标题区（可选）+ 题目区 =====
    # 需求（画布优化）：1:1 严格匹配画布布局
    # 画布布局：标题 → 学科/年级（第一行）→ 姓名/班级/得分（可选）→ 学科/年级（第二行，可选）→ 分隔线
    draw_watermark()
    draw_header()
    # 需求（画布优化）：页脚已从格式设置中移除，PDF 不再绘制页脚
    # draw_footer()

    # 首页标题区 — 需求（图层化）：支持 page_config.title_box 独立定位
    # 行为：
    #  - 配置了 title_box：按 title_box 的 (x, y, width, height) 在画布上精确定位
    #  - 未配置 title_box：使用传统的"居中标题"布局（向下兼容）
    # 坐标系转换：
    #   - 前端：origin 在纸张左上角，y 自上而下，单位 px
    #   - PDF：origin 在纸张左下角，y 自下而上，单位 pt
    #   - 转换公式：pdf_x = margin_left / mm + box.x / (scale * 3.78) mm
    #                pdf_y = page_h / mm - margin_top / mm - box.y / (scale * 3.78) mm
    # 注意：前端 absolute 定位在 padding box 内，PDF 需加上 margin_left/margin_top 偏移
    # 后续元素（学科年级行/姓名班级行/分隔线）从 title_box 底部向下继续排版
    title_box = pc.get("title_box") or None
    # 需求（1:1 还原）：标题 show=false 时，PDF 也不绘制标题，仅画封面
    title_visible = bool(hw.title) and bool(title_box) and title_box.get("show", True) is not False
    if title_visible:
        # 使用 title_box 精确定位
        try:
            box_x_px = title_box.get("x", 0) or 0
            box_y_px = title_box.get("y", 0) or 0
            box_w_mm = _px_to_mm(title_box.get("width", 0) or 0)
            box_h_mm = _px_to_mm(title_box.get("height", 0) or 0)
            # 物理 1:1 换算
            box_x_mm = margin_left / mm + _px_to_mm(box_x_px)
            box_y_pdf = page_h / mm - margin_top / mm - _px_to_mm(box_y_px)
            # 文字水平居中于 box
            text_x = box_x_mm + box_w_mm / 2
            # 需求（B-3 标题垂直居中）：与画布 flex items-center justify-center 行为一致
            # 文字基线 = box 中心 + ascent 偏移（字号 × 0.3 近似为 ascent 高度）
            text_y = box_y_pdf - box_h_mm / 2 + title_pt * 0.3
            try:
                c.setFont(font_name, title_pt)
            except Exception:
                c.setFont("Helvetica", title_pt)
            c.setFillColorRGB(0, 0, 0)
            c.drawCentredString(text_x * mm, text_y * mm, hw.title)
            # 学科年级（如果配置了且 box 高度够大，画在标题下方）
            if (hw.subject or hw.grade) and box_h_mm > title_pt * 1.8:
                # 学科年级行：在标题文本下方，与标题保持小间距
                info_y = text_y - title_pt * 1.1
                try:
                    c.setFont(font_name, info_pt)
                except Exception:
                    c.setFont("Helvetica", info_pt)
                c.setFillColorRGB(0.3, 0.3, 0.3)
                sub_grade = f"{hw.subject or ''} · {hw.grade or ''}".strip(" ·")
                c.drawCentredString(text_x * mm, info_y * mm, sub_grade)
            # 后续内容从 title_box 底部继续
            cover_bottom = box_y_pdf - box_h_mm - 4
        except Exception:
            # 出错时回退到居中布局
            cover_bottom = usable_top - title_top_offset_mm * mm
    else:
        # 兼容旧数据：未配置 title_box 时使用居中布局 + title_top_offset
        cover_bottom = usable_top - title_top_offset_mm * mm

    if has_cover and (not title_box or title_box.get("show", True) is False):
        if hw.title:
            title_text = hw.title or ""
            title_lines = _wrap_text_to_width(title_text, font_name, title_pt, usable_w)
            for line in title_lines:
                try:
                    c.setFont(font_name, title_pt)
                except Exception:
                    c.setFont("Helvetica", title_pt)
                c.setFillColorRGB(0, 0, 0)
                c.drawCentredString(page_w / 2, cover_bottom - title_pt, line)
                cover_bottom -= title_pt + 4
            cover_bottom -= 4
        # 学科/年级（第一行）— 与画布完全一致：学科：xxx  年级：xxx（flex 布局）
        # 不再合并"总分"项（画布不显示总分），保持 1:1 一致
        if hw.subject or hw.grade:
            try:
                c.setFont(font_name, info_pt)
            except Exception:
                c.setFont("Helvetica", info_pt)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            # 画布使用"学科：xxx   年级：xxx"  形式（三个空格分隔），保持 1:1
            sub_grade_parts = []
            if hw.subject:
                sub_grade_parts.append(f"学科：{hw.subject}")
            if hw.grade:
                sub_grade_parts.append(f"年级：{hw.grade}")
            sub_grade_text = "   ".join(sub_grade_parts)
            c.drawCentredString(page_w / 2, cover_bottom - info_pt, sub_grade_text)
            cover_bottom -= info_pt + 6
        # 姓名 / 班级 / 得分（与画布一致：show_name_class 为 true 时才显示）
        if show_name_class:
            try:
                c.setFont(font_name, info_pt)
            except Exception:
                c.setFont("Helvetica", info_pt)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.drawCentredString(
                page_w / 2, cover_bottom - info_pt,
                "姓名：__________   班级：__________   得分：__________"
            )
            cover_bottom -= info_pt + 6
        # 学科/年级（第二行，可选）— 与画布一致：show_subject_grade 为 true 时才显示
        # 画布中这一行显示 "学科：xxx   年级：xxx"
        if show_subject_grade and (hw.subject or hw.grade):
            try:
                c.setFont(font_name, info_pt * 0.9)
            except Exception:
                c.setFont("Helvetica", info_pt * 0.9)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.drawCentredString(
                page_w / 2, cover_bottom - info_pt * 0.9,
                f"学科：{hw.subject or '—'}   年级：{hw.grade or '—'}"
            )
            cover_bottom -= info_pt * 0.9 + 6
        # 分隔线 — 颜色与画布的 border-slate-400 接近（0.6 灰度）
        c.setStrokeColorRGB(0.6, 0.6, 0.6)
        c.setLineWidth(0.5)
        c.line(margin_left, cover_bottom, page_w - margin_right, cover_bottom)
    elif has_cover and title_visible:
        # 需求（图层化）：使用了 title_box 精确定位标题后，
        # 仍按原顺序绘制：学科年级、姓名班级、第二行学科年级、分隔线
        # 但起始位置从 title_box 底部开始
        if hw.subject or hw.grade:
            try:
                c.setFont(font_name, info_pt)
            except Exception:
                c.setFont("Helvetica", info_pt)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            sub_grade_parts = []
            if hw.subject:
                sub_grade_parts.append(f"学科：{hw.subject}")
            if hw.grade:
                sub_grade_parts.append(f"年级：{hw.grade}")
            sub_grade_text = "   ".join(sub_grade_parts)
            c.drawCentredString(page_w / 2, cover_bottom - info_pt, sub_grade_text)
            cover_bottom -= info_pt + 6
        if show_name_class:
            try:
                c.setFont(font_name, info_pt)
            except Exception:
                c.setFont("Helvetica", info_pt)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.drawCentredString(
                page_w / 2, cover_bottom - info_pt,
                "姓名：__________   班级：__________   得分：__________"
            )
            cover_bottom -= info_pt + 6
        if show_subject_grade and (hw.subject or hw.grade):
            try:
                c.setFont(font_name, info_pt * 0.9)
            except Exception:
                c.setFont("Helvetica", info_pt * 0.9)
            c.setFillColorRGB(0.3, 0.3, 0.3)
            c.drawCentredString(
                page_w / 2, cover_bottom - info_pt * 0.9,
                f"学科：{hw.subject or '—'}   年级：{hw.grade or '—'}"
            )
            cover_bottom -= info_pt * 0.9 + 6
        # 分隔线
        c.setStrokeColorRGB(0.6, 0.6, 0.6)
        c.setLineWidth(0.5)
        c.line(margin_left, cover_bottom, page_w - margin_right, cover_bottom)
        cover_bottom -= 8

        # 边界保护：cover_bottom 不能超过 usable_top（完全离开页面顶部）
        cover_bottom = min(cover_bottom, usable_top)
        # 边界保护：cover_bottom 不能低于 usable_bottom + 至少一题所需空间
        cover_bottom = max(cover_bottom, usable_bottom + title_pt * 4)

    col_y[0] = min(col_y[0], cover_bottom)
    if paper_size == "A3":
        col_y[1] = min(col_y[1], cover_bottom)

    # ===== 题目区 =====
    # 需求 3：与画布一致 — 不再硬塞题头栏（题型/分值），仅显示题号 + 题干
    # 题号位置：左列，左侧留出 ~6mm 距离
    qno = 0
    for hq in hw.homework_questions:
        if not hq.question:
            continue
        qno += 1
        q = hq.question
        # 题号单独绘制（位置：左列左对齐 4mm），题干从题号右侧 ~10mm 开始
        # 注意：使用更紧凑的格式（与画布左列题号 1. 2. 3. 对齐）
        stem_text = f"{q.stem or ''}"
        # 估算题干占用高度（保守估计：3 行题干 + 选项 + 间距 + 留白行）
        option_lines_est = 0
        if q.options and isinstance(q.options, list):
            option_lines_est = len(q.options)
        # 留白行（需求 3：使用 page_config.blank_lines，不再硬塞）
        user_blank_lines = int(blank_lines_map.get(str(hq.id), 0) or 0)
        # 兼容性：未配置时，对于 fill/general 题型仍保持最少 1 行（防止完全没有作答区）
        if user_blank_lines == 0 and q.question_type in ("fill", "general"):
            user_blank_lines = 1
        estimate_h = 30 + 4 * line_height + option_lines_est * line_height + user_blank_lines * line_height

        # 确保空间足够（不够则切换列/换页）
        ensure_space(estimate_h)

        x = col_x(current_col)
        y = col_y[current_col]

        # 1) 绘制题号（左侧对齐 4mm）
        # 需求（PDF 1:1 还原）：使用 question_pt（已换算为 pt），而非原始 px 值
        try:
            c.setFont(font_name, question_pt + 1)
        except Exception:
            c.setFont("Helvetica", question_pt + 1)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.drawString(x + 4, y, f"{qno}.")
        # 题干起始 x 偏移：题号宽度 + 6mm
        stem_x = x + 12
        stem_w = col_width - 16  # 题干可用宽度

        # 2) 绘制题干（支持 LaTeX 公式 + 自动换行）— 从 stem_x 开始
        usable_bottom_for_col = usable_bottom

        def _new_page_in_col():
            new_page()

        y_after_stem = _draw_stem_with_formulas(
            c, stem_text, stem_x, y, font_name, question_pt,
            stem_w, line_height, usable_bottom_for_col, _new_page_in_col
        )
        y = y_after_stem

        # 2.5) 题干中嵌入的图片 — 需求（PDF 1:1 还原）：渲染 stem HTML 中的 <img> 标签
        # 提取 stem 中的图片 src，逐个渲染到题干下方
        stem_img_srcs = _extract_img_srcs(stem_text)
        for img_src in stem_img_srcs:
            resolved = _resolve_image_path(img_src)
            if not resolved:
                continue
            try:
                img_reader = ImageReader(resolved)
                iw, ih = img_reader.getSize()
                # 图片最大宽度 = 题干可用宽度，最大高度 = 当前列剩余空间 * 0.4
                max_img_w = stem_w
                max_img_h = (y - usable_bottom) * 0.4 if y - usable_bottom > 0 else 60
                scale_img = min(max_img_w / iw, max_img_h / ih, 1.0)
                img_w = iw * scale_img
                img_h = ih * scale_img
                if y - img_h < usable_bottom:
                    new_page()
                    x = col_x(current_col)
                    y = col_y[current_col]
                c.drawImage(
                    img_reader,
                    stem_x + 4, y - img_h,
                    width=img_w, height=img_h,
                    mask='auto', preserveAspectRatio=True,
                )
                y -= img_h + 4
            except Exception:
                continue

        # 3) 选项（与画布一致：选项缩进到 stem_x 下方）
        if q.options:
            opts = q.options if isinstance(q.options, list) else []
            for opt in opts:
                label = ""
                text = ""
                if isinstance(opt, dict):
                    label = str(opt.get("label", ""))
                    text = str(opt.get("text", "") or opt.get("content", ""))
                else:
                    text = str(opt)
                # 选项前缀：标签. 文本
                line = f"{label}. {text}".strip() if label else text
                if not line.strip():
                    continue
                # 单行：尝试绘制，不够则换页
                if y - line_height < usable_bottom:
                    new_page()
                    x = col_x(current_col)
                    y = col_y[current_col]
                cleaned = _strip_html(line)
                lines = _wrap_text_to_width(cleaned, font_name, question_pt, stem_w)
                for ln in lines:
                    if y - line_height < usable_bottom:
                        new_page()
                        x = col_x(current_col)
                        y = col_y[current_col]
                    try:
                        c.setFont(font_name, question_pt)
                    except Exception:
                        c.setFont("Helvetica", question_pt)
                    c.drawString(stem_x + 4, y, ln)
                    y -= line_height

        # 4) 题目配图 — 需求（PDF 1:1 还原）：渲染 question.images 中的图片
        # 与前端画布 SortableCanvasItem 中 images 渲染保持一致
        if q.images and isinstance(q.images, list):
            for img_item in q.images:
                # 提取图片路径：支持字符串或对象格式
                img_path = ""
                if isinstance(img_item, str):
                    img_path = img_item
                elif isinstance(img_item, dict):
                    img_path = str(img_item.get("path") or img_item.get("url") or "")
                if not img_path:
                    continue
                # 解析为磁盘绝对路径
                resolved = _resolve_image_path(img_path)
                if not resolved:
                    continue
                try:
                    img_reader = ImageReader(resolved)
                    iw, ih = img_reader.getSize()
                    # 图片最大宽度 = 题干可用宽度，最大高度 = 当前列剩余空间 * 0.5
                    max_img_w = stem_w
                    max_img_h = (y - usable_bottom) * 0.5 if y - usable_bottom > 0 else 80
                    # 等比缩放
                    scale_img = min(max_img_w / iw, max_img_h / ih, 1.0)
                    img_w = iw * scale_img
                    img_h = ih * scale_img
                    # 确保空间足够
                    if y - img_h < usable_bottom:
                        new_page()
                        x = col_x(current_col)
                        y = col_y[current_col]
                    c.drawImage(
                        img_reader,
                        stem_x + 4, y - img_h,
                        width=img_w, height=img_h,
                        mask='auto', preserveAspectRatio=True,
                    )
                    y -= img_h + 4
                except Exception:
                    continue

        # 5) 留白作答行 — 需求 3：使用 page_config.blank_lines（每题独立）
        # 与画布一致：所有题型都支持；默认为 0（不画任何留白）；为 0 时 fill/general
        # 至少 1 行（保持最小作答区）
        for _ in range(user_blank_lines):
            if y - line_height < usable_bottom:
                new_page()
                x = col_x(current_col)
                y = col_y[current_col]
            c.setStrokeColorRGB(0.7, 0.7, 0.7)
            c.setLineWidth(0.2)
            # 与画布一致：留白行在 stem_x 下方（左对齐）
            c.line(stem_x + 4, y, x + col_width - 4, y)
            y -= line_height

        # 题间间距
        y -= 6
        col_y[current_col] = y

    c.save()
    buf.seek(0)
    return buf
