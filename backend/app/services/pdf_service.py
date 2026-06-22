"""
PDF 解析辅助服务 — V2精简版（去除本地OCR，仅保留工具函数和自动优化阶段）

功能：文本处理工具函数 / LLM优化题干 / 视觉模型识别图表 / 知识点匹配
输入参数：db会话 / paper_id
返回值：无（直接更新数据库）
使用场景：VLM解析后的自动优化流水线
"""
import re
import os

import fitz
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.paper import Paper
from app.models.question import Question
from app.config import settings


def fix_brackets(text: str) -> str:
    """修复文本中不配对的括号

    OCR识别括号时经常丢失，此函数检测不配对的括号并自动补全。
    """
    bracket_pairs = [('（', '）'), ('(', ')'), ('【', '】'), ('[', ']'), ('{', '}')]

    for left, right in bracket_pairs:
        left_count = text.count(left)
        right_count = text.count(right)

        if left_count > right_count:
            # 左括号多，在末尾补右括号
            text += right * (left_count - right_count)
        elif right_count > left_count:
            # 右括号多，在开头补左括号
            text = left * (right_count - left_count) + text

    return text


def fix_fractions(text: str) -> str:
    """将文本中的分数转换为 LaTeX 格式

    OCR识别分数经常丢失或错乱，此函数将常见分数写法转为LaTeX。
    """
    # 1. 数字/数字 格式 → LaTeX（排除日期格式如 2026/06/12）
    def frac_repl(m):
        num = m.group(1)
        denom = m.group(2)
        return f'$\\frac{{{num}}}{{{denom}}}$'

    text = re.sub(
        r'(?<!\d)(?<!/)(\d{1,2})\s*/\s*(\d{1,2})(?!\d|/)',
        frac_repl,
        text
    )

    # 2. 中文分数词 → LaTeX
    cn_frac = {
        '二分之一': '$\\frac{1}{2}$', '三分之一': '$\\frac{1}{3}$',
        '三分之二': '$\\frac{2}{3}$', '四分之一': '$\\frac{1}{4}$',
        '四分之三': '$\\frac{3}{4}$', '五分之一': '$\\frac{1}{5}$',
        '五分之二': '$\\frac{2}{5}$', '五分之三': '$\\frac{3}{5}$',
        '五分之四': '$\\frac{4}{5}$', '六分之一': '$\\frac{1}{6}$',
        '八分之一': '$\\frac{1}{8}$', '十分之一': '$\\frac{1}{10}$',
    }
    for cn, latex in cn_frac.items():
        text = text.replace(cn, latex)

    # 3. "X分之Y" 通用模式 → LaTeX
    cn_num = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
              '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
              '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
              '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20}

    def cn_frac_repl(m):
        denom_str = m.group(1)
        numer_str = m.group(2)
        denom = cn_num.get(denom_str)
        numer = cn_num.get(numer_str)
        # 如果是纯数字也尝试转换
        if denom is None:
            try:
                denom = int(denom_str)
            except ValueError:
                return m.group(0)
        if numer is None:
            try:
                numer = int(numer_str)
            except ValueError:
                return m.group(0)
        return f'$\\frac{{{numer}}}{{{denom}}}$'

    text = re.sub(r'([一二三四五六七八九十]+)\s*分之\s*([一二三四五六七八九十\d]+)', cn_frac_repl, text)

    return text


def split_questions(text: str, page: int, blocks: list = None, page_rect: tuple = None) -> list[dict]:
    """按题号切割文本为独立题目"""
    pattern = re.compile(
        r"(?:^|\n)\s*(\d{1,3})\s*[.、．。]\s*", re.MULTILINE
    )
    parts = pattern.split(text.strip())

    questions = []
    i = 1
    while i < len(parts):
        num = parts[i]
        stem = parts[i + 1].strip() if i + 1 < len(parts) else ""
        i += 2

        if not stem or len(stem) < 3:
            continue

        # 检测题型
        q_type = "general"
        options = []
        answer = None

        if re.search(r"[A-E]\s*[.、．]", stem):
            q_type = "single"
            option_pattern = re.compile(r"([A-E])\s*[.、．]\s*(.*?)(?=\n[A-E]\s*[.、．]|\n\s*(?:答案|解析|$))", re.DOTALL)
            opt_matches = option_pattern.findall(stem)
            if opt_matches:
                options = [{"label": m[0], "text": m[1].strip()} for m in opt_matches]
                stem = option_pattern.sub("", stem).strip()

        if "填空" in stem or "______" in stem or "___" in stem:
            q_type = "fill"
        elif "判断" in stem or "正确" in stem and "错误" in stem:
            q_type = "judge"

        answer_match = re.search(r"(?:答案|解析)[:：]\s*(.+)", stem)
        if answer_match:
            answer = answer_match.group(1).strip()
            stem = re.sub(r"\n?\s*(?:答案|解析)[:：].*", "", stem).strip()

        # 计算题目区域坐标（如果有 blocks 信息）
        boundary = {"page": page}
        if blocks and page_rect:
            y0, y1 = _compute_question_y_range(num, stem, blocks, page_rect)
            if y0 is not None:
                boundary = {
                    "page": page,
                    "x0": 0,
                    "y0": y0,
                    "x1": page_rect[2] if len(page_rect) > 2 else 595,
                    "y1": y1,
                }

        questions.append({
            "type": q_type,
            "stem": stem,
            "options": options,
            "answer": answer,
            "boundary": boundary,
        })

    return questions


def _compute_question_y_range(num: str, stem: str, blocks: list, page_rect: tuple) -> tuple:
    """根据文本块坐标计算题目的纵向范围"""
    if not blocks:
        return (None, None)

    # 在 blocks 中查找包含题号的文本块
    y0 = None

    for b in blocks:
        if len(b) < 5:
            continue
        block_text = b[4] if isinstance(b[4], str) else ""
        # 查找包含题号的块
        if re.search(rf'(?:^|\n)\s*{re.escape(num)}\s*[.、．。]', block_text):
            y0 = b[1]  # 块的顶部 y 坐标
            break

    if y0 is None:
        return (None, None)

    # y1 取下一题的 y0 或页面底部
    y1 = page_rect[3] if len(page_rect) > 3 else 842

    # 尝试找到下一个题号的位置作为 y1
    next_num = str(int(num) + 1) if num.isdigit() else None
    if next_num:
        for b in blocks:
            if len(b) < 5:
                continue
            block_text = b[4] if isinstance(b[4], str) else ""
            if re.search(rf'(?:^|\n)\s*{re.escape(next_num)}\s*[.、．。]', block_text):
                if b[1] > y0:
                    y1 = b[1]
                    break

    return (y0, y1)


def _extract_question_images(page_img_path: str, questions: list[dict],
                             paper_id: str, page_idx: int, page) -> None:
    """为每道题截取区域图片（包含图片和表格）"""
    try:
        from PIL import Image
    except ImportError:
        print("[PDF] Pillow 未安装，跳过题目区域截图")
        return

    if not os.path.exists(page_img_path):
        return

    try:
        page_img = Image.open(page_img_path)
        page_width, page_height = page_img.size
        pdf_width = page.rect.width
        pdf_height = page.rect.height

        if pdf_width <= 0 or pdf_height <= 0:
            return

        scale_x = page_width / pdf_width
        scale_y = page_height / pdf_height

        img_dir = os.path.join("data", "images", str(paper_id))

        for q in questions:
            boundary = q.get("boundary", {})
            if "y0" not in boundary:
                continue

            # 从 PDF 坐标转换为图片像素坐标
            x0 = int(boundary.get("x0", 0) * scale_x)
            y0 = int(boundary.get("y0", 0) * scale_y)
            x1 = int(boundary.get("x1", pdf_width) * scale_x)
            y1 = int(boundary.get("y1", pdf_height) * scale_y)

            # 安全边界
            x0 = max(0, x0)
            y0 = max(0, y0)
            x1 = min(page_width, x1)
            y1 = min(page_height, y1)

            # 跳过无效区域
            if x1 - x0 < 10 or y1 - y0 < 10:
                continue

            # 裁剪题目区域
            region = page_img.crop((x0, y0, x1, y1))

            # 保存
            q_no = q.get("question_no", 0)
            img_name = f"q_{page_idx}_{q_no}.png"
            img_path = os.path.join(img_dir, img_name)
            region.save(img_path, quality=90)

            # 记录图片路径
            q["images"] = [{"path": f"/data/images/{paper_id}/{img_name}", "type": "question_region"}]

    except Exception as e:
        print(f"[PDF] 题目区域截图失败: {e}")


async def _resolve_chat_provider(db: AsyncSession):
    """按三级优先级解析 chat 模型 provider

    解析顺序：
      1) 系统默认 chat 模型（system_settings.llm_id，按 provider|instance|model 解析）
      2) 兜底：get_first_available_provider / 环境变量
    输入参数：db（数据库会话）
    返回值：BaseLLMProvider 实例或 None
    使用场景：PDF 解析阶段（题干优化 / 知识点匹配）
    """
    # 优先级 1：系统默认 chat 模型
    try:
        from llm.factory import get_provider_by_model_type
        provider = await get_provider_by_model_type(db, "chat")
        if provider is not None:
            return provider
    except Exception as e:
        print(f"[PDF] 系统默认 chat 模型解析失败: {e}")

    # 优先级 2：兜底
    from llm.factory import get_first_available_provider
    return await get_first_available_provider(db)


async def _auto_vision_stage(db: AsyncSession, paper: Paper) -> None:
    """阶段2.5：视觉模型识别图表内容"""
    try:
        from llm.factory import get_vision_provider

        vision_provider = await get_vision_provider(db)
        if not vision_provider:
            print("[PDF] 无可用视觉模型服务商，跳过图表识别")
            return

        paper.parse_stage = "vision"
        await db.commit()

        result = await db.execute(
            select(Question)
            .where(Question.paper_id == paper.id)
            .order_by(Question.question_no)
        )
        questions = result.scalars().all()

        # 筛选有图片的题目
        questions_with_images = [q for q in questions if q.images and len(q.images) > 0]
        total = len(questions_with_images)

        if total == 0:
            print("[PDF] 无带图片的题目，跳过图表识别")
            return

        print(f"[PDF] 开始图表识别，共 {total} 道题有图片")

        for idx, q in enumerate(questions_with_images):
            paper.parse_progress = {
                "stage": "vision",
                "current": idx + 1,
                "total": total,
                "message": f"正在识别第{q.question_no}题图表 ({idx + 1}/{total})..."
            }
            await db.commit()

            try:
                # 读取图片并转为 base64
                import base64
                img_info = q.images[0]
                img_path = img_info.get("path", "")

                # 将 URL 路径转为文件路径
                if img_path.startswith("/data/images/"):
                    file_path = os.path.join("data", img_path.replace("/data/", "", 1).lstrip("/"))
                elif img_path.startswith("/images/"):
                    file_path = os.path.join("data", img_path.lstrip("/"))
                else:
                    file_path = img_path

                if not os.path.exists(file_path):
                    print(f"[PDF] 题目{q.question_no}图片不存在: {file_path}")
                    continue

                with open(file_path, "rb") as f:
                    img_base64 = base64.b64encode(f.read()).decode("utf-8")

                # 调用视觉模型识别
                vision_result = await vision_provider.chat_with_image(
                    system_prompt="你是一个试卷图表识别专家。请识别图片中的图表、图形、几何图形等内容，用文字描述其关键信息。如果是数学图形，描述其形状、标注、坐标等；如果是表格，描述其行列内容。只输出识别结果，不要其他内容。",
                    user_prompt=f"请识别这道题目图片中的图表/图形内容：",
                    image_base64=img_base64,
                    temperature=0.1,
                    max_tokens=1024,
                )

                if vision_result and vision_result.strip():
                    # 将识别结果追加到题干
                    q.stem = q.stem + f"\n[图表内容：{vision_result.strip()}]"
                    await db.commit()
                    print(f"[PDF] 题目{q.question_no}图表识别完成")
                else:
                    print(f"[PDF] 题目{q.question_no}图表识别无结果")

            except Exception as e:
                print(f"[PDF] 题目{q.question_no}图表识别失败: {e}")
                continue

        print(f"[PDF] 图表识别完成，共处理 {total} 道题")
    except Exception as e:
        print(f"[PDF] 图表识别阶段失败（不阻塞）: {e}")


async def _auto_refine_stage(db: AsyncSession, paper: Paper) -> None:
    """阶段2：LLM自动优化题干（修错字、LaTeX转换、题型判断）"""
    try:
        # 解析 chat provider：系统默认 chat 模型（system_settings.llm_id）→ 兜底
        provider = await _resolve_chat_provider(db)
        if not provider:
            print("[PDF] 无可用AI服务商，跳过题干优化")
            return

        paper.parse_stage = "refining"
        await db.commit()

        result = await db.execute(
            select(Question)
            .where(Question.paper_id == paper.id)
            .order_by(Question.question_no)
        )
        questions = result.scalars().all()
        total = len(questions)

        # 逐题调用LLM优化，以便更新进度
        for idx, q in enumerate(questions):
            paper.parse_progress = {
                "stage": "refining",
                "current": idx + 1,
                "total": total,
                "message": f"正在优化第{idx + 1}/{total}题..."
            }
            await db.commit()

            try:
                raw = [{
                    "question_no": q.question_no,
                    "stem": q.stem,
                    "question_type": q.question_type,
                    "options": q.options,
                    "answer": q.answer,
                }]
                refined = await provider.refine_questions(raw)
                if refined and len(refined) > 0:
                    item = refined[0]
                    q.stem = item.get("stem", q.stem)
                    q.question_type = item.get("question_type", q.question_type)
                    q.options = item.get("options", q.options)
                    q.answer = item.get("answer", q.answer)
                    await db.commit()
            except Exception as e:
                print(f"[PDF] 题目{q.question_no}优化失败: {e}")
                continue

        print(f"[PDF] 题干优化完成，共优化 {total} 道题")
    except Exception as e:
        print(f"[PDF] 题干优化失败（不阻塞）: {e}")


async def _auto_knowledge_stage(db: AsyncSession, paper: Paper) -> None:
    """阶段3：LLM自动匹配知识点，无匹配则自动创建分支"""
    try:
        from app.services.knowledge_service import get_tree, find_or_create

        # 解析 chat provider：系统默认 chat 模型（system_settings.llm_id）→ 兜底
        provider = await _resolve_chat_provider(db)
        if not provider:
            print("[PDF] 无可用AI服务商，跳过知识点匹配")
            return

        paper.parse_stage = "matching"
        await db.commit()

        # 获取该学科的知识点树
        subject = paper.subject or ""
        if not subject:
            print("[PDF] 试卷未设置学科，跳过知识点匹配")
            return

        kp_tree = await get_tree(db, subject)
        # 构建知识点名称→ID映射
        kp_name_map = _flatten_knowledge_tree(kp_tree)

        result = await db.execute(
            select(Question)
            .where(Question.paper_id == paper.id)
            .order_by(Question.question_no)
        )
        questions = result.scalars().all()
        total = len(questions)

        for idx, q in enumerate(questions):
            # 逐题更新进度
            paper.parse_progress = {
                "stage": "matching",
                "current": idx + 1,
                "total": total,
                "message": f"正在匹配第{idx + 1}/{total}题知识点..."
            }
            await db.commit()

            if not q.stem:
                continue
            try:
                # 调用LLM匹配知识点
                matched_names = await provider.match_knowledge_points(
                    q.stem, subject, list(kp_name_map.keys())
                )
                if not matched_names:
                    continue

                matched_ids = []
                for name in matched_names:
                    name = name.strip()
                    if not name:
                        continue
                    if name in kp_name_map:
                        matched_ids.append(kp_name_map[name])
                    else:
                        # 自动创建缺失的知识点分支
                        new_kp = await find_or_create(db, subject, name)
                        kp_name_map[name] = new_kp.id
                        matched_ids.append(new_kp.id)

                if matched_ids:
                    q.knowledge_points = matched_ids

            except Exception as e:
                print(f"[PDF] 题目{q.question_no}知识点匹配失败: {e}")
                continue

        await db.commit()
        print(f"[PDF] 知识点匹配完成，共处理 {len(questions)} 道题")
    except Exception as e:
        print(f"[PDF] 知识点匹配阶段失败（不阻塞）: {e}")


def _flatten_knowledge_tree(tree: list[dict], prefix: str = "") -> dict[str, str]:
    """将知识点树扁平化为 name→id 映射"""
    result = {}
    for node in tree:
        name = node.get("name", "")
        node_id = node.get("id", "")
        if name and node_id:
            result[name] = node_id
        children = node.get("children", [])
        if children:
            result.update(_flatten_knowledge_tree(children))
    return result
