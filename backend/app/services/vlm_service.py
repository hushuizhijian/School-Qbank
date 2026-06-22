"""
VLM 语义理解层 — GLM-4.1V-Thinking-Flash

职责（只做语义理解，不参与像素定位）：
  1. 完整识别试卷文本，拆分题干/选项/答案/解析，转换 LaTeX 公式
  2. 识别与题目强绑定的有效图形，生成 [FIGURE:N] 占位符
  3. 区分有效题目配图 / 水印 / 装饰边框 / 无关色块
  4. 输出粗粒度图形坐标 + 图形对应题号，建立「题目 - 图片」关联

输入：页面图片 base64 + OCR 版面提示（可选）
输出：结构化题目 JSON（含 figures 语义绑定）
"""
import os
import asyncio
import base64
import httpx
import json

from app.config import settings


class VLMService:
    """GLM-4.1V-Thinking-Flash 语义理解服务

    与 OCR 的分工：
      OCR（版面定位层）→ 输出像素级图形坐标框
      VLM（语义理解层）→ 判定哪些图形是题目配图（过滤水印/装饰），
                        建立题目-图形绑定关系，输出结构化题目内容
    """

    def __init__(self):
        self.api_key = settings.vlm_api_key
        self.base_url = settings.vlm_base_url
        self.model = settings.vlm_model
        self.timeout = settings.vlm_timeout
        self.max_retries = settings.vlm_max_retries
        self.client = httpx.AsyncClient(timeout=float(self.timeout))

    async def analyze_page(self, image_base64: str, page_num: int,
                           ocr_hints: dict = None) -> dict:
        """分析单页试卷 — 语义理解为主

        Args:
            image_base64: 页面图片的 base64 编码
            page_num: 页码
            ocr_hints: OCR 版面分析结果（可选）
                {
                    "text_blocks": [{"bbox": [x1,y1,x2,y2]}, ...],
                    "figure_regions": [{"bbox": [x1,y1,x2,y2], "area": int}, ...]
                }
                当 OCR 未启用时传 None，VLM 自行完成全部识别

        Returns:
            {"success": bool, "data": {questions: [...]}} 或 {"success": False, "message": str}
        """
        if not self.api_key:
            return {"success": False, "message": "VLM API Key 未配置"}

        prompt = self._build_prompt(page_num, ocr_hints)

        last_error = None
        for attempt in range(self.max_retries + 1):
            try:
                content_parts = [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_base64}"}
                    }
                ]

                resp = await self.client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": content_parts}],
                        "temperature": 0.1,
                        "max_tokens": 4096,
                    },
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]

                # 解析 JSON
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0]
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0]

                result = json.loads(content.strip())
                return {"success": True, "data": result}

            except httpx.TimeoutException as e:
                last_error = e
                if attempt < self.max_retries:
                    await asyncio.sleep(2 ** attempt)
                    continue
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    await asyncio.sleep(1)
                    continue

        return {"success": False, "message": f"VLM分析失败（重试{self.max_retries}次后）: {str(last_error)[:200]}"}

    def _build_prompt(self, page_num: int, ocr_hints: dict = None) -> str:
        """构建 VLM 分析 prompt

        核心原则：VLM 只做语义理解，不做像素检测。
        OCR 已经提供了精确的图形坐标（如果启用），VLM 只需：
          1. 理解题目内容
          2. 判断哪些图形是题目配图（vs 水印/装饰）
          3. 建立题目-图形绑定
        """
        has_ocr = ocr_hints and ocr_hints.get("figure_regions")

        if has_ocr:
            figures = ocr_hints.get("figure_regions", [])
            figure_hint_text = self._format_ocr_hints(figures)
            ocr_section = f"""
【OCR 版面定位层已检测到的图形区域（像素坐标）】
以下图形已被 OCR 精确检测到位置，你的任务是判断哪些是题目配图：
{figure_hint_text}

注意：
- 请忽略水印、页码、装饰边框等无关图形
- 将每个有效图形绑定到对应的题目（加入 figures 数组）
- figures 中的 bbox 坐标请使用 OCR 提供的精确坐标（更准确）
"""
        else:
            ocr_section = """
【注意】OCR 版面定位未启用，你需要自行观察页面布局，给出图形的大致坐标。
"""

        return f"""你是一个小学数学试卷的语义理解引擎。请分析第{page_num}页的试卷内容。

{ocr_section}

【你的任务 — 纯语义理解】
1. 识别每道题目的完整文本（题干、选项、答案）
2. 数学公式请转换为 LaTeX 格式（如 $x^2 + y^2 = z^2$）
3. 判断题目类型（single_choice / multi_choice / fill_blank / true_false / calculation / application / solution）
4. 识别与题目强绑定的有效图形（几何图、线段图、函数图、插图等），忽略水印、页码、装饰边框
5. 在题干文本中图形的对应位置插入 [FIGURE:N] 占位符（N 为 figures 数组索引）

【输出格式 — 严格 JSON】
{{
  "questions": [
    {{
      "question_no": 1,
      "stem": "题干文本（图形位置用 [FIGURE:0] [FIGURE:1] 占位符标记）",
      "question_type": "single_choice|multi_choice|fill_blank|true_false|calculation|application|solution",
      "options": [{{"label": "A", "text": "选项内容"}}],
      "answer": "答案（如有）",
      "has_figure": false,
      "has_table": false,
      "figures": [
        {{
          "bbox": {{"x0": 120, "y0": 350, "x1": 380, "y1": 520}},
          "type": "geometry|chart|illustration",
          "description": "三角形ABC示意图"
        }}
      ]
    }}
  ]
}}

【重要】
- bbox 坐标是相对于页面图片的像素坐标
- 只在题目确实包含配图时才添加 figures
- 无配图的题目 figures 为空数组 []
- 只返回 JSON，不要其他内容"""

    def _format_ocr_hints(self, figures: list) -> str:
        """将 OCR 图形检测结果格式化为 VLM 可读的提示文本"""
        lines = []
        for i, fig in enumerate(figures):
            bbox = fig.get("bbox", [0, 0, 0, 0])
            area = fig.get("area", 0)
            lines.append(
                f"  图形{i}: 坐标({bbox[0]}, {bbox[1]}) → ({bbox[2]}, {bbox[3]}), "
                f"面积={area}px²"
            )
        return "\n".join(lines) if lines else "（无图形）"

    async def analyze_full_paper(self, paper_id: str, db,
                                  ocr_layouts: dict = None) -> list:
        """分析整份试卷的所有页面

        Args:
            paper_id: 试卷ID
            db: 数据库会话
            ocr_layouts: OCR 版面分析结果（可选）
                {page_num: {"text_blocks": [...], "figure_regions": [...]}}

        Returns:
            所有页面的题目列表
        """
        img_dir = os.path.join("data", "images", paper_id)
        if not os.path.isdir(img_dir):
            return []

        page_files = sorted(
            [f for f in os.listdir(img_dir)
             if f.startswith("page_") and f.endswith(".png")],
            key=lambda f: int(f.replace("page_", "").replace(".png", ""))
        )

        all_questions = []
        for page_file in page_files:
            page_num = int(page_file.replace("page_", "").replace(".png", ""))
            img_path = os.path.join(img_dir, page_file)

            with open(img_path, "rb") as f:
                img_base64 = base64.b64encode(f.read()).decode("utf-8")

            # 获取该页的 OCR 版面提示
            ocr_hints = None
            if ocr_layouts:
                ocr_hints = ocr_layouts.get(page_num)

            result = await self.analyze_page(img_base64, page_num, ocr_hints)
            if result.get("success"):
                questions = result["data"].get("questions", [])
                for q in questions:
                    q["page"] = page_num
                all_questions.extend(questions)

        return all_questions


# 全局单例
vlm_service = VLMService()