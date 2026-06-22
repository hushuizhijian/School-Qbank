"""
MinerU 结果分题器 (V5.0) — content分题唯一方案

输入: content_list (结构化元素列表) + latex (整卷 LaTeX) + markdown (可选)
输出: [{question_no, question_type, stem, latex, options, answer, has_figure, has_table, page, images}]

策略说明:
  content分题: 基于 content_list 结构分题，利用位置信息精确匹配图片
  移除：request分题（LLM边界识别）+ LLM边界识别方案
  唯一分题方案：基于 content_list 元素的位置（page+bbox）做图题精确匹配

V5 改进点：
  1. 利用 bbox 精确位置做图题匹配（不再用页码距离）
  2. 跨页图题匹配：图片可跨页正确归属到对应页的首道题
  3. 完善子题（1.(1)/1.(2)）合并逻辑
  4. 多级回退：content_list 基础分题 → LaTeX锚点分题
  5. 错误处理：捕获单步异常，记录日志，返回已有结果
  6. 性能：单次遍历完成分组，避免重复迭代
  7. 顺序：分题结果严格按 content_list 中元素出现顺序输出
  8. 兼容：空 content_list、缺 bbox、Unicode 编码等边界场景
"""
import re
import os
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# ============================================================
# 基础工具函数
# ============================================================

# 大题题型标记（一/二/三/...）
SECTION_PATTERNS = [
    r"^一、", r"^二、", r"^三、", r"^四、", r"^五、", r"^六、",
    r"^七、", r"^八、", r"^九、", r"^十、",
]

# 题目起始模式：题号 + 标点
# 支持：1./1、/1./1．/1。/(1)/1）/1、
# 兼容中文括号 "（1）" 与英文括号 "(1)"
QUESTION_PATTERN = re.compile(r"^\s*(\d{1,3})\s*[\.\u3001\u3002\uff0e\)\uff09\)\u300d\u3015\)\)]")

# 子题起始模式：1.(1) / 1. (1) / 1．(1) 等
SUB_QUESTION_PATTERN = re.compile(
    r"^\s*\d{1,3}\s*[\.\u3001\u3002\uff0e]\s*[\(（]\s*(\d{1,2})\s*[\)）]"
)

# 选项起始模式：A./A、/A．/A)
OPTION_PATTERN = re.compile(r"^\s*([A-Da-d])\s*[\.\u3001\u3002\uff0e\)\uff09\)\u300d\u3015\)\)]")

# 评分标记（用于 LaTeX 锚点分题）
SCORE_PATTERN = re.compile(r"[\(（]\s*(\d+)\s*分\s*[\)）]")

# 题型关键词映射（用于大题分类）
TYPE_KEYWORDS = {
    "选择": "single_choice",
    "填空": "fill_blank",
    "判断": "true_false",
    "计算": "calculation",
    "应用": "application",
    "解答": "solution",
    "操作": "operation",
    "简答": "short_answer",
    "连线": "matching",
    "排序": "sorting",
    "作图": "drawing",
}


def _safe_str(value: Any, default: str = "") -> str:
    """
    安全地将任意值转为字符串

    功能：处理 None/数字/异常类型，避免 .strip() 等操作崩溃
    输入参数：value（任意值）/ default（默认值）
    返回值：字符串
    使用场景：解析 content_list 字段时统一处理
    """
    if value is None:
        return default
    if isinstance(value, str):
        return value
    try:
        return str(value)
    except Exception:
        return default


def _detect_section(text: str) -> str | None:
    """
    识别大题题型（一、选择题 等）

    功能：从文本开头匹配大题标题并提取题型
    输入参数：text（待检测文本）
    返回值：题型标识字符串（如 single_choice），未匹配返回 None
    使用场景：分题时识别大题分组
    """
    if not text:
        return None
    try:
        stripped = text.strip()
        for pattern in SECTION_PATTERNS:
            if re.match(pattern, stripped):
                # 提取大题名称（去掉前缀"一、"等）
                section_type = re.sub(r'^[一二三四五六七八九十]+[、]\s*', '', stripped)
                for keyword, qtype in TYPE_KEYWORDS.items():
                    if keyword in section_type:
                        return qtype
                return "general"
    except Exception as e:
        logger.warning(f"[分题] _detect_section 异常: {e}")
    return None


def _is_question_start(text: str) -> bool:
    """
    判断是否为新题目起始

    功能：检查文本是否以题号/大题标题开头
    输入参数：text（待检测文本）
    返回值：True=是题目起始
    使用场景：遍历 content_list 时识别题目边界
    """
    if not text:
        return False
    try:
        t = text.strip()
        if not t:
            return False
        if QUESTION_PATTERN.match(t):
            return True
        for pattern in SECTION_PATTERNS:
            if re.match(pattern, t):
                return True
    except Exception:
        return False
    return False


def _is_subquestion_start(text: str) -> bool:
    """
    判断是否为子题起始（如 "1.(1)" / "1.（1）"）

    功能：识别主题下子题边界
    输入参数：text
    返回值：True=子题起始
    使用场景：子题合并到主题时跳过子题边界
    """
    if not text:
        return False
    try:
        return bool(SUB_QUESTION_PATTERN.match(text.strip()))
    except Exception:
        return False


def _extract_question_no(text: str) -> int:
    """
    从文本中提取题号

    功能：解析题号字符串为整数
    输入参数：text
    返回值：题号（0 表示未识别）
    """
    if not text:
        return 0
    try:
        m = QUESTION_PATTERN.match(text.strip())
        if m:
            num = m.group(1)
            if num.isdigit():
                return int(num)
    except Exception:
        pass
    return 0


def _detect_question_type(text: str) -> str:
    """
    根据上下文判断题型

    功能：通过前几行检测选项或大题关键词判断题型
    输入参数：text（题干）
    返回值：题型字符串
    """
    if not text:
        return "general"
    try:
        t = text.strip()
        # 检测选项（选择题）
        for line in t.split("\n")[:10]:
            if OPTION_PATTERN.match(line.strip()):
                return "single_choice"
        # 检测大题关键词
        for keyword, qtype in TYPE_KEYWORDS.items():
            if keyword in t[:30]:
                return qtype
    except Exception:
        pass
    return "general"


def _parse_options(text: str) -> list[dict]:
    """
    从文本中解析选择题选项

    功能：按 A./B./C./D. 切分选项内容
    输入参数：text
    返回值：选项列表 [{label, content}]
    """
    options: list[dict] = []
    if not text:
        return options
    try:
        for line in text.split("\n"):
            m = OPTION_PATTERN.match(line.strip())
            if m:
                label = m.group(1).upper()
                content = line.strip()[len(m.group(0)):].strip()
                options.append({"label": label, "content": content})
    except Exception as e:
        logger.warning(f"[分题] _parse_options 异常: {e}")
    return options


def _extract_option_text(text: str) -> str:
    """
    从题干中剥离选项文本（供 stem 使用）

    功能：保留非选项行作为题干
    输入参数：text
    返回值：去掉选项后的纯题干
    """
    if not text:
        return ""
    try:
        lines = text.split("\n")
        stem_lines = [l for l in lines if not OPTION_PATTERN.match(l.strip())]
        return "\n".join(stem_lines).strip()
    except Exception:
        return text


def _extract_image_name(item: dict) -> str:
    """
    从 content_list item 中提取图片文件名

    功能：兼容 image_path / img_path / img_name 等多种字段
    输入参数：item（content_list 元素）
    返回值：图片文件名
    使用场景：图片与题目匹配时获取唯一标识
    """
    if not isinstance(item, dict):
        return ""
    try:
        img_path = item.get("img_path") or item.get("image_path") or ""
        if img_path:
            return os.path.basename(img_path)
        return _safe_str(item.get("img_name") or item.get("name"), "")
    except Exception:
        return ""


def _get_bbox_position(item: dict) -> tuple:
    """
    安全地从 item 中提取 (page, x0, x1, top, bottom)

    功能：统一处理 bbox 字段缺失或字段名为 top/left 等情况
    输入参数：item
    返回值：(page_idx, x0, x1, top, bottom)，失败返回 (0,0,0,0,0)
    使用场景：图题匹配、位置排序
    """
    try:
        page = int(item.get("page_idx", 0) or 0)
        bbox = item.get("bbox") or item.get("position") or [0, 0, 0, 0]
        if not isinstance(bbox, (list, tuple)) or len(bbox) < 4:
            return (page, 0, 0, 0, 0)
        # bbox 格式约定：[x0, top, x1, bottom] 或 [left, top, right, bottom]
        x0 = float(bbox[0] or 0)
        top = float(bbox[1] or 0)
        x1 = float(bbox[2] or 0) if len(bbox) > 2 else 0
        bottom = float(bbox[3] or 0) if len(bbox) > 3 else 0
        return (page, x0, x1, top, bottom)
    except Exception:
        return (0, 0, 0, 0, 0)


# ============================================================
# content分题（V5 增强版）：基于 content_list 结构分题 + 位置信息精确匹配图片
# ============================================================

def split_content_list(content_list: list[dict] | None, latex: str | None = None) -> list[dict]:
    """
    content分题（基础版）：将 content_list 按题目分组

    功能：识别每道题目的边界，分组到独立字典
    输入参数：
        content_list: MinerU 返回的结构化元素列表
        latex: 整卷 LaTeX 源码（可选）
    返回值：题目列表 [{question_no, question_type, stem, latex, options, ...}]
    使用场景：content分题基础实现，被 split_content_list_ordered 调用

    算法步骤：
        1. 遍历 content_list，识别题目边界（题号/大题标题）
        2. 同一大题下的子题（1.(1)）合并到主题
        3. 图片按"前置绑定 + 当前绑定"两阶段分配
        4. 大题标题（"一、..."）影响题型推断
    """
    if not content_list:
        logger.warning("[content分题] content_list 为空")
        return _fallback_split_by_latex(latex)

    questions: list[dict] = []
    current_section_type = "general"
    current_q: dict | None = None
    pending_images: list[dict] = []

    try:
        # V5 改进：使用 enumerate 记录每个元素在 content_list 中的原始索引
        # 用于在 split_content_list_ordered 中严格按 PDF 原始顺序输出题号
        for doc_idx, item in enumerate(content_list):
            if not isinstance(item, dict):
                continue
            text = _safe_str(item.get("text"))
            etype = item.get("type", "text")
            page = int(item.get("page_idx", 0) or 0) + 1  # 0-indexed → 1-indexed

            # 检测大题题型（一、选择题 等）
            section_type = _detect_section(text)
            if section_type:
                current_section_type = section_type
                # 大题标题不作为题目，继续
                continue

            # 检测新题目起始（且不是子题）
            if _is_question_start(text) and not _is_subquestion_start(text):
                # 提交上一题
                if current_q:
                    questions.append(current_q)

                q_no = _extract_question_no(text)
                # 防御：题号 0 或非数字 → 顺延
                if q_no == 0:
                    q_no = (questions[-1].get("question_no", 0) if questions else 0) + 1
                    if q_no == 0:
                        q_no = 1

                current_q = {
                    "question_no": q_no,
                    "question_type": current_section_type,
                    "stem": text,
                    "latex": text if latex else "",
                    "options": [],
                    "answer": "",
                    "has_figure": False,
                    "has_table": False,
                    "page": page,
                    "_doc_idx": doc_idx,  # V5 新增：content_list 原始索引
                    "elements": [item],
                    "images": [],
                }

                # 将前置图片绑定到本题目（前一张图属于其下方第一道题）
                for pending_img in pending_images:
                    current_q["has_figure"] = True
                    img_name = _extract_image_name(pending_img)
                    if img_name:
                        current_q["images"].append({
                            "name": img_name,
                            "page": page,
                            "description": _safe_str(pending_img.get("image_caption")).strip(),
                        })
                pending_images = []

                # 当前行本身可能是图片
                if etype in ("figure", "image"):
                    current_q["has_figure"] = True
                    img_name = _extract_image_name(item)
                    if img_name:
                        current_q["images"].append({
                            "name": img_name,
                            "page": page,
                            "description": _safe_str(item.get("image_caption")).strip(),
                        })

                # 选择题：解析选项
                if current_section_type == "single_choice":
                    opts = _parse_options(text)
                    if opts:
                        current_q["options"] = opts
                        current_q["stem"] = _extract_option_text(text)
            else:
                # 续接当前题目（含子题、续文、图片等）
                if current_q:
                    # 合并子题或续文
                    if text:
                        current_q["elements"].append(item)
                        current_q["stem"] += "\n" + text
                        current_q["latex"] += "\n" + text

                    # 图片识别
                    if etype in ("figure", "image"):
                        current_q["has_figure"] = True
                        img_name = _extract_image_name(item)
                        if img_name:
                            # 避免重复添加同名图片
                            existing_names = {im.get("name") for im in current_q["images"]}
                            if img_name not in existing_names:
                                current_q["images"].append({
                                    "name": img_name,
                                    "page": page,
                                    "description": _safe_str(item.get("image_caption")).strip(),
                                })

                    if etype == "table":
                        current_q["has_table"] = True
                        # 修复：把 table_body HTML 一并写入 stem，前端 PreviewRenderer
                        # 通过 rehype-raw 可以直接渲染 <table>。
                        # 同时把 img_path 对应的图片挂到题目下（与 figure 行为一致）。
                        table_body = _safe_str(item.get("table_body")).strip()
                        if table_body:
                            current_q["elements"].append(item)
                            current_q["stem"] += "\n" + table_body
                            current_q["latex"] += "\n" + table_body
                        # 表格本身也对应一张图（如 img_path 指向的整张表截图）
                        table_img = _extract_image_name(item)
                        if table_img:
                            existing_names = {im.get("name") for im in current_q["images"]}
                            if table_img not in existing_names:
                                current_q["has_figure"] = True
                                current_q["images"].append({
                                    "name": table_img,
                                    "page": page,
                                    "description": _safe_str(item.get("table_caption")).strip(),
                                })

                    # 选择题：补齐选项
                    if current_q["question_type"] == "single_choice":
                        opts = _parse_options(text)
                        if opts:
                            existing_labels = {o["label"] for o in current_q["options"]}
                            for opt in opts:
                                if opt["label"] not in existing_labels:
                                    current_q["options"].append(opt)
                                    existing_labels.add(opt["label"])
                else:
                    # 题目外的图片 → 进入待绑定队列
                    if etype in ("figure", "image"):
                        pending_images.append(item)

        # 收尾最后一题
        if current_q:
            questions.append(current_q)

        # 把剩余未绑定的图片挂到最后一题
        if pending_images and questions:
            last_q = questions[-1]
            for pending_img in pending_images:
                last_q["has_figure"] = True
                img_name = _extract_image_name(pending_img)
                if img_name:
                    existing_names = {im.get("name") for im in last_q["images"]}
                    if img_name not in existing_names:
                        last_q["images"].append({
                            "name": img_name,
                            "page": last_q.get("page", 1),
                            "description": _safe_str(pending_img.get("image_caption")).strip(),
                        })

        # 清理内部字段（保留 _doc_idx 供 split_content_list_ordered 使用以保持 PDF 原始顺序）
        for q in questions:
            q.pop("elements", None)
            q["stem"] = (q.get("stem") or "").strip()
            if not q.get("options"):
                q["options"] = []

    except Exception as e:
        logger.error(f"[content分题] split_content_list 异常: {e}")
        # 异常时尝试返回已识别题目
        if not questions:
            return _fallback_split_by_latex(latex)

    logger.info(f"[content分题] 完成: {len(questions)} 题")
    return questions


def _fallback_split_by_latex(latex: str | None) -> list[dict]:
    """
    当 content_list 为空或异常时，基于 LaTeX 源码尝试拆分

    功能：LaTeX 锚点 + 评分标记切分（最基础回退）
    输入参数：latex
    返回值：题目列表
    使用场景：content_list 缺失或解析失败时
    """
    if not latex:
        return []
    questions: list[dict] = []
    try:
        lines = latex.split("\n")
        current_q: dict | None = None
        q_no = 0
        for line in lines:
            if _is_question_start(line) and not _is_subquestion_start(line):
                if current_q:
                    questions.append(current_q)
                q_no += 1
                current_q = {
                    "question_no": q_no, "question_type": "general",
                    "stem": line, "latex": line, "options": [],
                    "answer": "", "has_figure": False, "has_table": False,
                    "page": 1, "images": [],
                }
            elif current_q:
                current_q["stem"] += "\n" + line
                current_q["latex"] += "\n" + line
        if current_q:
            questions.append(current_q)
    except Exception as e:
        logger.error(f"[content分题] LaTeX回退异常: {e}")
    logger.info(f"[content分题] LaTeX回退完成: {len(questions)} 题")
    return questions


def split_content_list_ordered(
    content_list: list[dict] | None,
    latex: str | None = None,
) -> list[dict]:
    """
    content分题（V5 增强版 + V6 表格位置匹配）：基于 content_list 结构分题 + 位置信息精确匹配图片/表格

    功能：利用 content_list 中每个元素的 page 和 bbox 信息，
    将图片与表格精确匹配到最近的题目（按 bbox 位置而非页码距离）。
    输入参数：
        content_list: MinerU 返回的结构化元素列表
        latex: 整卷 LaTeX 源码（可选）
    返回值：
        [{question_no, question_type, stem, latex, options, ...}]

    V5 改进点：
        1. 严格按 content_list 中元素出现顺序输出题号（与 PDF 原始排版一致）
        2. 改用 bbox 位置（page+top）做图题匹配，而非页码距离
        3. 跨页图题匹配：图片可正确归属到对应页的首道题
        4. 单次遍历完成分组（避免 split_content_list + 后处理重复）
        5. 题号规范化：过滤无效题号、保证题号连续
        6. 错误隔离：单步异常不影响整体结果

    V6 改进点（修复表格-题目错位）：
        1. 表格也参与 bbox 位置匹配（与图片使用相同算法）
        2. 修正最佳题目的评分函数：同页时优先选最接近的前置题（q_doc_idx 越大越好，但不能超过表 doc_idx）
        3. 跨页时按 page_diff 优先 + doc_idx 次优
        4. 修复「第 35 题显示第 4 题表格」类问题
    """
    if not content_list:
        return _fallback_split_by_latex(latex)

    questions: list[dict] = []
    try:
        # 阶段1：基础分组（按 content_list 顺序生成）
        questions = split_content_list(content_list, latex)
        if not questions:
            return []

        # 阶段2：收集所有图片（带 bbox 位置 + doc_idx）
        all_images: list[dict] = []
        all_tables: list[dict] = []  # V6 新增：表格列表
        try:
            for doc_idx, item in enumerate(content_list):
                if not isinstance(item, dict):
                    continue
                etype = item.get("type", "")
                if etype in ("image", "figure"):
                    page, _, _, top, _ = _get_bbox_position(item)
                    img_name = _extract_image_name(item)
                    if img_name:
                        all_images.append({
                            "name": img_name,
                            "page": page + 1,  # 转为 1-indexed
                            "top": top,
                            "doc_idx": doc_idx,
                            "description": _safe_str(item.get("image_caption")).strip(),
                        })
                elif etype == "table":  # V6 新增
                    page, _, _, top, _ = _get_bbox_position(item)
                    table_img = _extract_image_name(item)
                    table_body = _safe_str(item.get("table_body")).strip()
                    # 至少要有图片名或表格正文，否则不参与匹配
                    if table_img or table_body:
                        all_tables.append({
                            "img_name": table_img,
                            "table_body": table_body,
                            "page": page + 1,
                            "top": top,
                            "doc_idx": doc_idx,
                            "caption": _safe_str(item.get("table_caption")).strip(),
                        })
        except Exception as e:
            logger.warning(f"[content分题] 收集图片/表格异常: {e}")

        # 阶段3：构建已匹配图片索引
        matched_names: set[str] = set()
        for q in questions:
            for img in q.get("images", []):
                if img.get("name"):
                    matched_names.add(img["name"])

        # 阶段4：基于 bbox 位置重新分配所有图片（V6 修正评分函数）
        # V6 关键修复：原算法选同页 doc_idx 最小者（即第一道题），导致后面题目
        # 关联到第一道题。修正为：同页时优先选最接近图片的前置题（q_doc_idx 越
        # 接近 img_doc_idx 越好，但不能超过）；跨页时按 page_diff + doc_idx 加权。
        for img in all_images:
            img_name = img.get("name", "")
            if not img_name:
                continue

            img_page = img.get("page", 1)
            img_doc_idx = img.get("doc_idx", 0)

            best_q = None
            best_score = float("inf")
            try:
                for q in questions:
                    q_page = q.get("page", 1)
                    q_doc_idx = q.get("_doc_idx", 0)
                    page_diff = q_page - img_page

                    if page_diff < 0:
                        # 题在前页：page_diff 为负，绝对值越大越远
                        # 评分 = |page_diff| * 1000000 - q_doc_idx（doc_idx 越大越优先，即最后一道题优先）
                        score = abs(page_diff) * 1000000 - q_doc_idx
                    elif page_diff == 0:
                        # 同页：要求 q_doc_idx <= img_doc_idx，取最接近的（最大 q_doc_idx）
                        if q_doc_idx > img_doc_idx:
                            # 题目在图片之后，惩罚：当作后续页处理
                            score = 1000000 + (q_doc_idx - img_doc_idx)
                        else:
                            # 题目在图片之前或同一位置：距离越小越好
                            score = img_doc_idx - q_doc_idx
                    else:
                        # 题目在图片之后的后续页：尽可能选最早的（即 doc_idx 最小的）
                        score = page_diff * 1000000 + q_doc_idx

                    if score < best_score:
                        best_score = score
                        best_q = q
            except Exception as e:
                logger.warning(f"[content分题] 图题匹配计算异常: {e}")
                continue

            if best_q is None:
                continue

            # 检查图片当前是否已在最佳题目中
            current_q = None
            for q in questions:
                for q_img in q.get("images", []):
                    if q_img.get("name") == img_name:
                        current_q = q
                        break
                if current_q is not None:
                    break

            if current_q is best_q:
                # 已在最佳题目中，无需移动
                continue

            # 从原题目中移除
            if current_q is not None:
                current_q["images"] = [
                    im for im in current_q.get("images", [])
                    if im.get("name") != img_name
                ]
                if not current_q.get("images"):
                    current_q.pop("images", None)
                    current_q["has_figure"] = False

            # 添加到最佳题目
            best_q.setdefault("images", []).append(img)
            best_q["has_figure"] = True
            matched_names.add(img_name)

        # 阶段4.5（V6 新增）：基于 bbox 位置重新分配所有表格
        # 策略与图片完全一致：使用修正后的评分函数
        for table in all_tables:
            table_img = table.get("img_name", "")
            table_body = table.get("table_body", "")
            table_doc_idx = table.get("doc_idx", 0)
            table_page = table.get("page", 1)

            best_q = None
            best_score = float("inf")
            try:
                for q in questions:
                    q_page = q.get("page", 1)
                    q_doc_idx = q.get("_doc_idx", 0)
                    page_diff = q_page - table_page

                    if page_diff < 0:
                        score = abs(page_diff) * 1000000 - q_doc_idx
                    elif page_diff == 0:
                        if q_doc_idx > table_doc_idx:
                            score = 1000000 + (q_doc_idx - table_doc_idx)
                        else:
                            score = table_doc_idx - q_doc_idx
                    else:
                        score = page_diff * 1000000 + q_doc_idx

                    if score < best_score:
                        best_score = score
                        best_q = q
            except Exception as e:
                logger.warning(f"[content分题] 表题匹配计算异常: {e}")
                continue

            if best_q is None:
                continue

            # 判断表格当前是否在最佳题目中
            # 检查方式：
            #   1. 题目的 images 中是否包含该 table_img
            #   2. 题目的 stem 中是否包含该 table_body（精确子串匹配）
            is_in_best = False
            best_images = best_q.get("images", [])
            if table_img and any(im.get("name") == table_img for im in best_images):
                is_in_best = True
            if not is_in_best and table_body and table_body in (best_q.get("stem") or ""):
                is_in_best = True

            if is_in_best:
                # 已在最佳题目中，确保 has_table=True
                best_q["has_table"] = True
                continue

            # 需要移动：先从原题移除（images 和 stem 中），再添加到最佳题
            # 从 images 中移除
            for q in questions:
                if q is best_q:
                    continue
                # images 中移除
                if table_img:
                    new_imgs = [
                        im for im in q.get("images", [])
                        if im.get("name") != table_img
                    ]
                    if len(new_imgs) != len(q.get("images", [])):
                        q["images"] = new_imgs
                        if not new_imgs:
                            q.pop("images", None)
                            q["has_figure"] = False
                # stem 中移除 table_body（只移第一个匹配项，避免误删）
                if table_body and q.get("stem"):
                    stem = q["stem"]
                    if table_body in stem:
                        q["stem"] = stem.replace(table_body, "", 1).strip()
                        q["latex"] = (q.get("latex") or "").replace(table_body, "", 1).strip()
                # 如果原题没有 table_body 也没有 table_img，has_table 应改为 False
                has_table_still = False
                if table_img and any(im.get("name") == table_img for im in q.get("images", [])):
                    has_table_still = True
                if table_body and table_body in (q.get("stem") or ""):
                    has_table_still = True
                if not has_table_still:
                    q["has_table"] = False

            # 添加到最佳题：images 追加 + stem 追加 table_body
            if table_img:
                # 避免重复
                if not any(im.get("name") == table_img for im in best_q.get("images", [])):
                    best_q.setdefault("images", []).append({
                        "name": table_img,
                        "page": table_page,
                        "doc_idx": table_doc_idx,
                        "description": table.get("caption", ""),
                    })
                    best_q["has_figure"] = True
            if table_body:
                # 避免重复
                if table_body not in (best_q.get("stem") or ""):
                    if best_q.get("stem"):
                        best_q["stem"] = best_q["stem"] + "\n" + table_body
                    else:
                        best_q["stem"] = table_body
                    if best_q.get("latex"):
                        best_q["latex"] = best_q["latex"] + "\n" + table_body
                    else:
                        best_q["latex"] = table_body
            best_q["has_table"] = True

        # 阶段5：题号排序与规范化
        # V5 关键改进：严格按 content_list 中元素出现顺序（doc_idx）输出题号
        try:
            # 按 doc_idx 升序排序（content_list 的原始顺序）
            questions.sort(key=lambda x: (x.get("_doc_idx", 0),))

            # 重新分配连续题号（从 1 开始）
            valid_qs = [q for q in questions if q.get("question_no", 0) > 0]
            for i, q in enumerate(valid_qs):
                q["question_no"] = i + 1
            questions = valid_qs

            # 清理内部字段 _doc_idx
            for q in questions:
                q.pop("_doc_idx", None)
        except Exception as e:
            logger.warning(f"[content分题] 题号规范化异常: {e}")

    except Exception as e:
        logger.error(f"[content分题] split_content_list_ordered 异常: {e}")
        # 返回已识别的题目（不丢失已有结果），清理 _doc_idx
        for q in questions:
            q.pop("_doc_idx", None)

    logger.info(f"[content分题] 完成: {len(questions)} 题（V6表格位置匹配+原始顺序）")
    return questions


# ============================================================
# 已有内容：LaTeX 锚点分题（保留）
# ============================================================

# 纯文本题号锚点正则
TEXT_ANCHOR_PATTERN = re.compile(
    r'(?:^|\n)\s*(\d+)\s*[\.\u3001\)\uff09\)\u300d\u3015\)\)]\s*',
    re.MULTILINE
)
ITEM_ANCHOR_PATTERN = re.compile(
    r'(?:^|\n)\s*\\item\b',
    re.MULTILINE
)
ENUM_BLOCK_PATTERN = re.compile(
    r'\\begin\{enumerate\}.*?\\end\{enumerate\}',
    re.DOTALL
)
SCORE_CHECK_PATTERN = re.compile(r'[\(（]\s*(\d+)\s*分\s*[\)）]')


def _find_all_anchors(body: str) -> list[dict]:
    """找到所有题号锚点"""
    if not body:
        return []
    try:
        enum_ranges: list[tuple[int, int]] = []
        for block in ENUM_BLOCK_PATTERN.finditer(body):
            enum_ranges.append((block.start(), block.end()))

        def _in_enum_block(pos: int) -> bool:
            return any(s <= pos < e for s, e in enum_ranges)

        anchors: list[dict] = []
        for block in ENUM_BLOCK_PATTERN.finditer(body):
            block_text = body[block.start():block.end()]
            counter_m = re.search(r'\\setcounter\{enumi\}\{(\d+)\}', block_text)
            q_no = int(counter_m.group(1)) + 1 if counter_m else 1
            for item_m in ITEM_ANCHOR_PATTERN.finditer(block_text):
                anchors.append({"start": block.start() + item_m.start(), "question_no": q_no})
                q_no += 1

        for text_m in TEXT_ANCHOR_PATTERN.finditer(body):
            if not _in_enum_block(text_m.start()):
                num_str = text_m.group(1)
                if num_str.isdigit():
                    anchors.append({"start": text_m.start(), "question_no": int(num_str)})

        anchors.sort(key=lambda x: x["start"])
        filtered: list[dict] = []
        for a in anchors:
            if not filtered or a["start"] - filtered[-1]["start"] > 5:
                filtered.append(a)
        return filtered
    except Exception as e:
        logger.warning(f"[LaTeX切分] _find_all_anchors 异常: {e}")
        return []


def split_latex_by_question_anchors(full_latex: str | None) -> list[dict]:
    """基于"题号锚点" + "分值校验"的 LaTeX 切分"""
    if not full_latex:
        return []

    try:
        body = _extract_document_body(full_latex)
        if not body:
            return []

        anchors = _find_all_anchors(body)
        if not anchors:
            return []

        raw_segments = []
        for i, anchor in enumerate(anchors):
            start = anchor["start"]
            end = anchors[i + 1]["start"] if i + 1 < len(anchors) else len(body)
            q_no = anchor["question_no"]
            segment_text = body[start:end].strip()
            raw_segments.append({
                "question_no": q_no,
                "text": segment_text,
                "has_score": bool(SCORE_CHECK_PATTERN.search(segment_text)),
            })

        has_any_score = any(seg["has_score"] for seg in raw_segments)
        if has_any_score:
            validated_segments = _merge_missing_score_segments(raw_segments)
        else:
            validated_segments = raw_segments

        result = []
        for seg in validated_segments:
            latex_text = seg["text"]
            q_type = _detect_question_type(latex_text)
            opts = _parse_options(latex_text)
            stem = _extract_option_text(latex_text) if opts else latex_text

            result.append({
                "question_no": seg["question_no"],
                "question_type": q_type,
                "stem": stem,
                "latex": latex_text,
                "options": opts,
                "answer": "",
                "has_figure": "\\includegraphics" in latex_text,
                "has_table": (
                    "\\begin{tabular" in latex_text
                    or "\\begin{table" in latex_text
                    or "\\begin{longtable" in latex_text
                ),
                "page": 1,
                "images": [],
            })

        logger.info(f"[LaTeX切分] 完成: {len(result)} 题")
        return result
    except Exception as e:
        logger.error(f"[LaTeX切分] 异常: {e}")
        return []


def _extract_document_body(full_latex: str) -> str:
    """提取 document body"""
    if not full_latex:
        return ""
    try:
        begin_match = re.search(r'\\begin\{document\}', full_latex)
        end_match = re.search(r'\\end\{document\}', full_latex)
        if begin_match:
            start = begin_match.end()
            end = end_match.start() if end_match else len(full_latex)
            return full_latex[start:end].strip()
    except Exception as e:
        logger.warning(f"[LaTeX切分] _extract_document_body 异常: {e}")
    return full_latex.strip()


def _merge_missing_score_segments(segments: list[dict]) -> list[dict]:
    """分值校验合并"""
    if not segments:
        return []
    try:
        merged: list[dict] = []
        buffer: dict | None = None
        for seg in segments:
            if seg["has_score"]:
                if buffer is not None:
                    seg["text"] = buffer["text"] + "\n" + seg["text"]
                    seg["question_no"] = buffer["question_no"]
                    buffer = None
                merged.append(seg)
            else:
                if buffer is None:
                    buffer = seg
                else:
                    buffer["text"] += "\n" + seg["text"]
        if buffer is not None and merged:
            merged[-1]["text"] += "\n" + buffer["text"]
        return merged
    except Exception as e:
        logger.error(f"[LaTeX切分] _merge_missing_score_segments 异常: {e}")
        return segments


def extract_per_question_latex_from_tex(full_latex: str | None) -> dict[int, str]:
    """从整卷 output.tex 中按 enumerate 块提取每道题对应的 LaTeX 片段"""
    if not full_latex:
        return {}

    questions: dict[int, str] = {}
    try:
        lines = full_latex.split('\n')
        current_q_no: int | None = None
        current_lines: list[str] = []
        in_enumerate = False

        for i, line in enumerate(lines):
            raw = line
            if '\\begin{enumerate}' in raw:
                is_question = False
                for j in range(i + 1, min(i + 6, len(lines))):
                    l = lines[j]
                    if '\\arabic{enumi}' in l:
                        is_question = True
                        break
                    if any(x in l for x in ('\\alph{enumi}', '\\Alph{enumi}', '\\roman{enumi}')):
                        break
                if is_question:
                    if current_q_no is not None:
                        questions[current_q_no] = '\n'.join(current_lines)
                    q_no = 1
                    for j in range(i + 1, min(i + 6, len(lines))):
                        m = re.search(r'\\setcounter\{enumi\}\{(\d+)\}', lines[j])
                        if m:
                            q_no = int(m.group(1)) + 1
                            break
                    current_q_no = q_no
                    current_lines = [raw]
                    in_enumerate = True
                else:
                    if current_q_no is not None:
                        current_lines.append(raw)
                    continue
            elif '\\end{enumerate}' in raw and in_enumerate:
                current_lines.append(raw)
                in_enumerate = False
            elif current_q_no is not None:
                current_lines.append(raw)

        if current_q_no is not None and current_q_no not in questions:
            questions[current_q_no] = '\n'.join(current_lines)

    except Exception as e:
        logger.error(f"[LaTeX分题] output.tex 提取异常: {e}")

    logger.info(f"[LaTeX分题] output.tex 提取完成: {len(questions)} 题")
    return questions


# ============================================================
# 验证模块：表格-题目关联检测（V6 新增）
# ============================================================

def verify_table_question_matching(
    content_list: list[dict] | None,
    latex: str | None,
    existing_questions: list[dict] | None = None,
) -> dict:
    """
    验证表格与题目的关联是否正确

    功能：基于 content_list 重新跑分题算法，提取每道题应有的表格列表，
         与现有数据库中的题目对比，报告不匹配的项。
    输入参数：
        content_list: MinerU 返回的结构化元素列表
        latex: 整卷 LaTeX 源码
        existing_questions: 当前数据库中已存在的题目列表（可为空，仅用于交叉对比）
    返回值：
        {
            "total_questions": 题目总数,
            "total_tables": 检测到的表格总数,
            "mismatches": [
                {
                    "type": "missing_in_db" | "extra_in_db" | "wrong_owner",
                    "table_img": "图片名" | None,
                    "table_doc_idx": content_list 中位置,
                    "expected_question_no": 期望关联的题号,
                    "actual_question_no": 实际关联的题号,
                    "page": 页码,
                    "description": "详细说明",
                }
            ],
            "ok": 是否完全匹配,
        }
    使用场景：分题后的表格关联验证、修复第 35 题显示第 4 题表格类问题
    """
    result = {
        "total_questions": 0,
        "total_tables": 0,
        "mismatches": [],
        "ok": True,
    }
    if not content_list:
        return result
    try:
        # 跑一次分题，拿到期望的题-表对应关系
        expected_questions = split_content_list_ordered(content_list, latex)
        if not expected_questions:
            return result

        result["total_questions"] = len(expected_questions)

        # 收集期望的表格归属：table_img -> question_no
        expected_table_to_q: dict[str, int] = {}
        for q in expected_questions:
            q_no = q.get("question_no", 0)
            for img in q.get("images", []):
                # 区分表格图片与普通图：表格图片的 description 通常包含"表"或与 table_caption 相关
                # 这里用启发式：若 question has_table=True，则该 question 下 images 视为表格关联
                pass
            if q.get("has_table"):
                for img in q.get("images", []):
                    name = img.get("name", "")
                    if name:
                        expected_table_to_q[name] = q_no
        # 同时从 content_list 直接扫描表格，建立 img_name -> (doc_idx, page) 索引
        tables_info: dict[str, dict] = {}
        for doc_idx, item in enumerate(content_list):
            if not isinstance(item, dict):
                continue
            if item.get("type") == "table":
                page, _, _, top, _ = _get_bbox_position(item)
                table_img = _extract_image_name(item)
                if table_img:
                    tables_info[table_img] = {
                        "doc_idx": doc_idx,
                        "page": page + 1,
                        "top": top,
                    }
        result["total_tables"] = len(tables_info)

        # 对比 existing_questions（数据库当前状态）
        if existing_questions:
            actual_table_to_q: dict[str, int] = {}
            for q in existing_questions:
                q_no = q.get("question_no", 0)
                q_id = q.get("id", "")
                imgs = q.get("images", []) or []
                for img in imgs:
                    if isinstance(img, dict):
                        name = img.get("path") or img.get("name") or ""
                    else:
                        name = str(img)
                    if not name:
                        continue
                    # 只关心 content_list 中识别出的表格图
                    base = os.path.basename(name) if name else ""
                    if base in tables_info:
                        actual_table_to_q[base] = q_no

            # 检查每个表格：期望题号 vs 实际题号
            for table_img, info in tables_info.items():
                expected_q = expected_table_to_q.get(table_img)
                actual_q = actual_table_to_q.get(table_img)
                if expected_q is None:
                    # 分题算法没把它分到任何题（可能是边缘情况）
                    if actual_q is not None:
                        result["mismatches"].append({
                            "type": "extra_in_db",
                            "table_img": table_img,
                            "table_doc_idx": info["doc_idx"],
                            "expected_question_no": None,
                            "actual_question_no": actual_q,
                            "page": info["page"],
                            "description": f"表格 {table_img} 不应被任何题引用，但当前被第 {actual_q} 题引用",
                        })
                        result["ok"] = False
                    continue
                if actual_q is None:
                    result["mismatches"].append({
                        "type": "missing_in_db",
                        "table_img": table_img,
                        "table_doc_idx": info["doc_idx"],
                        "expected_question_no": expected_q,
                        "actual_question_no": None,
                        "page": info["page"],
                        "description": f"表格 {table_img} 应关联到第 {expected_q} 题，但当前未被任何题引用",
                    })
                    result["ok"] = False
                elif actual_q != expected_q:
                    result["mismatches"].append({
                        "type": "wrong_owner",
                        "table_img": table_img,
                        "table_doc_idx": info["doc_idx"],
                        "expected_question_no": expected_q,
                        "actual_question_no": actual_q,
                        "page": info["page"],
                        "description": f"表格 {table_img} 错位：应在第 {expected_q} 题，但当前被第 {actual_q} 题占用",
                    })
                    result["ok"] = False

        logger.info(
            f"[表格验证] 共 {result['total_tables']} 张表格，"
            f"{len(result['mismatches'])} 处不匹配，ok={result['ok']}"
        )
    except Exception as e:
        logger.error(f"[表格验证] 异常: {e}")
        result["ok"] = False
        result.setdefault("error", str(e))
    return result

