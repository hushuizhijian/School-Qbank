"""
LaTeX 公式渲染服务 — 将 LaTeX 渲染为 PNG 图片（PDF 导出用）

功能：LaTeX公式渲染/公式提取/文本分段
输入参数：LaTeX公式文本 / DPI / 字体大小
返回值：PNG图片字节数据 / 公式位置列表
使用场景：PDF导出中的公式渲染
"""
import io
import re
import logging

logger = logging.getLogger(__name__)

# 检测 matplotlib 是否可用
_MATPLOTLIB_AVAILABLE = False
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    _MATPLOTLIB_AVAILABLE = True
except ImportError:
    logger.warning("matplotlib 未安装，LaTeX 公式将回退为纯文本显示。安装: pip install matplotlib")


def is_latex_available() -> bool:
    """检查 LaTeX 渲染是否可用"""
    return _MATPLOTLIB_AVAILABLE


def render_latex_to_image(latex: str, dpi: int = 150, fontsize: int = 12) -> bytes | None:
    """将 LaTeX 公式渲染为 PNG 图片字节"""
    if not _MATPLOTLIB_AVAILABLE:
        return None

    try:
        fig, ax = plt.subplots(figsize=(0.01, 0.01))
        ax.text(0, 0, f'${latex}$', size=fontsize)
        ax.axis('off')

        buf = io.BytesIO()
        fig.savefig(buf, format='png', dpi=dpi, bbox_inches='tight',
                    pad_inches=0.05, transparent=False, facecolor='white')
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()
    except Exception as e:
        logger.warning(f"LaTeX 渲染失败: {latex}, 错误: {e}")
        try:
            plt.close('all')
        except Exception:
            pass
        return None


def extract_latex_formulas(text: str) -> list[tuple[str, str, int]]:
    """从文本中提取 LaTeX 公式

    Returns:
        [(公式文本, 匹配原文, 起始位置), ...]
        - 行内公式: $...$
        - 块级公式: $$...$$
    """
    formulas = []

    # 先匹配块级公式 $$...$$
    for m in re.finditer(r'\$\$(.+?)\$\$', text, re.DOTALL):
        formulas.append((m.group(1).strip(), m.group(0), m.start()))

    # 再匹配行内公式 $...$（排除已被块级公式匹配的部分）
    block_ranges = [(m.start(), m.end()) for m in re.finditer(r'\$\$.+?\$\$', text, re.DOTALL)]
    for m in re.finditer(r'(?<!\$)\$(?!\$)(.+?)(?<!\$)\$(?!\$)', text):
        # 检查是否在块级公式范围内
        in_block = any(start <= m.start() < end for start, end in block_ranges)
        if not in_block:
            formulas.append((m.group(1).strip(), m.group(0), m.start()))

    # 按位置排序
    formulas.sort(key=lambda x: x[2])
    return formulas


def split_text_by_formulas(text: str) -> list[dict]:
    """将文本按公式位置分段

    Returns:
        [{"type": "text", "content": "..."}, {"type": "formula", "content": "...", "display": "inline|block"}, ...]
    """
    if not text:
        return []

    segments = []
    formulas = extract_latex_formulas(text)

    if not formulas:
        return [{"type": "text", "content": text}]

    last_end = 0
    for formula_content, match_text, start_pos in formulas:
        # 判断是行内还是块级
        is_block = match_text.startswith('$$')

        # 公式前的文本
        if start_pos > last_end:
            text_before = text[last_end:start_pos]
            if text_before:
                segments.append({"type": "text", "content": text_before})

        segments.append({
            "type": "formula",
            "content": formula_content,
            "display": "block" if is_block else "inline",
        })
        last_end = start_pos + len(match_text)

    # 最后一段文本
    if last_end < len(text):
        remaining = text[last_end:]
        if remaining:
            segments.append({"type": "text", "content": remaining})

    return segments
