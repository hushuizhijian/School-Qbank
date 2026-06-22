"""
题目拆分阶段

功能：按题号切割文本为独立题目
输入参数：context（含 raw_text, pages）
返回值：context（含 questions）
使用场景：管道中识别题目边界后拆分
"""
import re
import logging
from pipeline.base import StageBase

logger = logging.getLogger(__name__)


class ChunkStage(StageBase):
    """题目拆分阶段 — 按题号切割文本"""

    stage_name = "chunk"

    async def process(self, context: dict) -> dict:
        raw_text = context.get("raw_text", "")  # 原始文本
        pages = context.get("pages", [])  # 页面列表

        if not raw_text:
            context["_error"] = "无文本数据"
            return context

        # 按题号切割文本
        questions = self._split_by_question_no(raw_text, pages)

        if not questions:
            logger.warning("[Chunk] 未识别到题目，使用分页文本作为整体")
            # 回退：每页作为一个题目
            questions = self._split_by_page(pages)

        context["questions"] = questions  # 题目列表
        context["question_count"] = len(questions)  # 题目数量
        logger.info(f"[Chunk] 拆分完成，共 {len(questions)} 道题")
        return context

    def _split_by_question_no(self, text: str, pages: list) -> list[dict]:
        """
        按题号切割文本为独立题目

        Args:
            text: 完整文本
            pages: 页面列表

        Returns:
            题目列表
        """
        # 匹配题号模式：数字 + 标点
        pattern = re.compile(
            r"(?:^|\n)\s*(\d{1,3})\s*[.、．。]\s*", re.MULTILINE
        )
        parts = pattern.split(text.strip())

        questions = []
        i = 1
        while i < len(parts):
            num = parts[i]  # 题号
            stem = parts[i + 1].strip() if i + 1 < len(parts) else ""  # 题干
            i += 2

            if not stem or len(stem) < 3:
                continue

            # 检测题型
            q_type = "general"  # 默认通用题
            options = []
            answer = None

            # 检测选项
            if re.search(r"[A-E]\s*[.、．]", stem):
                q_type = "single"  # 单选题
                option_pattern = re.compile(
                    r"([A-E])\s*[.、．]\s*(.*?)(?=\n[A-E]\s*[.、．]|\n\s*(?:答案|解析|$))",
                    re.DOTALL,
                )
                opt_matches = option_pattern.findall(stem)
                if opt_matches:
                    options = [{"label": m[0], "text": m[1].strip()} for m in opt_matches]
                    stem = option_pattern.sub("", stem).strip()

            # 检测填空题
            if "填空" in stem or "______" in stem or "___" in stem:
                q_type = "fill"
            # 检测判断题
            elif "判断" in stem or ("正确" in stem and "错误" in stem):
                q_type = "judge"

            # 检测答案
            answer_match = re.search(r"(?:答案|解析)[:：]\s*(.+)", stem)
            if answer_match:
                answer = answer_match.group(1).strip()
                stem = re.sub(r"\n?\s*(?:答案|解析)[:：].*", "", stem).strip()

            # 估算题目所在页码
            page = self._estimate_page(num, stem, pages)

            questions.append({
                "question_no": int(num) if num.isdigit() else 999,
                "stem": stem,
                "question_type": q_type,
                "options": options,
                "answer": answer,
                "page": page,
            })

        return questions

    def _estimate_page(self, num: str, stem: str, pages: list) -> int:
        """
        估算题目所在页码

        Args:
            num: 题号
            stem: 题干
            pages: 页面列表

        Returns:
            页码（从1开始）
        """
        if not pages:
            return 1
        # 简单策略：根据题号在 pages 中的位置估算
        page_idx = min(int(num) // 5, len(pages) - 1) if num.isdigit() else 0
        return page_idx + 1

    def _split_by_page(self, pages: list) -> list[dict]:
        """
        按页面拆分（回退策略）

        Args:
            pages: 页面列表

        Returns:
            题目列表
        """
        questions = []
        for page in pages:
            page_idx = page.get("page_idx", 0)
            text = page.get("text", "").strip()
            if text:
                questions.append({
                    "question_no": page_idx + 1,
                    "stem": text,
                    "question_type": "general",
                    "options": [],
                    "answer": None,
                    "page": page_idx + 1,
                })
        return questions