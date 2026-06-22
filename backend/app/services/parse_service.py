"""
PDF 解析调度服务 — 仅 MinerU 云端解析引擎 + content分题（唯一方案）

二期优化：MinerU 云端解析与分题切分拆分为两个独立阶段
  阶段一（parse_paper）：MinerU 云端解析 → 保存产物 → status="parsed"
  阶段二（split_paper）：读取产物 → content分题 → 入库 → 自动优化 → status="completed"

不再使用 VLM、本地 OCR 和 request分题（LLM边界识别），完全依赖 content分题。
"""
import os
import re
import json
import shutil
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.paper import Paper
from app.models.question import Question
from app.services.mineru_service import mineru_service
from app.services.mineru_splitter import (
    split_content_list,
    split_content_list_ordered,
    split_latex_by_question_anchors,
    extract_per_question_latex_from_tex,
)
from app.services.pdf_service import (
    _auto_refine_stage, _auto_knowledge_stage,
)
from app.config import settings

logger = logging.getLogger(__name__)


class ParseService:
    """PDF 解析调度服务（仅 MinerU 云端 + content分题）"""

    # ============================================================
    # 阶段一：MinerU 云端解析（仅解析 + 保存产物，不触发分题）
    # ============================================================

    async def parse_paper(self, paper_id: str, db: AsyncSession, config: dict = None):
        """
        阶段一：MinerU 云端解析

        功能：上传PDF到MinerU → 云端解析 → 保存产物到磁盘 → 保存图片
        输入参数：paper_id / db / config
        返回值：无（通过 paper.status 反映状态）
        使用场景：上传API后台任务，解析完成后 status="parsed" 等待分题
        """
        config = config or {}
        result = await db.execute(select(Paper).where(Paper.id == paper_id))
        paper = result.scalar_one_or_none()
        if not paper:
            return

        paper.status = "parsing"
        paper.parse_stage = "mineru_upload"
        paper.parse_progress = {
            "stage": "mineru_upload", "current": 0, "total": 0,
            "message": "正在上传至 MinerU 云端解析...",
        }
        await db.commit()

        try:
            await self._run_mineru_parse(paper_id, db, config)
        except Exception as e:
            paper = await db.get(Paper, paper_id)
            if paper:
                paper.status = "failed"
                paper.parse_stage = ""
                paper.error_message = str(e)
                await db.commit()

    async def _run_mineru_parse(self, paper_id: str, db: AsyncSession, config: dict):
        """
        执行 MinerU 云端解析 + 保存产物（不触发分题）

        功能：调用MinerU SDK解析PDF → 保存五种格式产物 → 保存图片
        输入参数：paper_id / db / config
        返回值：无
        使用场景：parse_paper 内部调用
        """
        paper = await db.get(Paper, paper_id)
        if not paper or not paper.file_path:
            return

        pdf_path = paper.file_path
        if not os.path.exists(pdf_path):
            paper.status = "failed"
            paper.error_message = f"PDF 文件不存在: {pdf_path}"
            await db.commit()
            return

        # ---- Step 1: MinerU 云端解析 ----
        paper.parse_progress = {
            "stage": "mineru_extracting", "current": 0, "total": 0,
            "message": "MinerU 云端解析中（约1-3分钟）...",
        }
        await db.commit()

        result = await mineru_service.parse_pdf(
            pdf_path,
            model=config.get("model", "vlm"),
            language=config.get("language", "ch"),
            timeout=config.get("timeout", 300),
        )

        if result.error:
            paper.status = "failed"
            paper.error_message = f"MinerU 解析失败: {result.error}"
            await db.commit()
            return

        logger.info(
            f"[MinerU] 解析成功: task_id={result.task_id}, "
            f"markdown={len(result.markdown or '')}字符, "
            f"latex={len(result.latex or '')}字符, "
            f"html={len(result.html or '')}字符, "
            f"docx={'有' if result.docx else '无'}, "
            f"content_list={len(result.content_list or [])}项, "
            f"images={len(result.images)}张"
        )

        # ---- Step 2: 保存 MinerU 原始产物到磁盘 ----
        paper_dir = os.path.join("data", "papers", str(paper.id))
        os.makedirs(paper_dir, exist_ok=True)

        # 保存 Markdown
        if result.markdown:
            md_path = os.path.join(paper_dir, "output.md")
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(result.markdown)
            logger.info(f"[MinerU] Markdown 已保存: {md_path}")

        # 保存 LaTeX
        if result.latex:
            latex_path = os.path.join(paper_dir, "output.tex")
            with open(latex_path, "w", encoding="utf-8") as f:
                f.write(result.latex)
            logger.info(f"[MinerU] LaTeX 已保存: {latex_path}")

        # 保存 HTML
        if result.html:
            html_path = os.path.join(paper_dir, "output.html")
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(result.html)
            logger.info(f"[MinerU] HTML 已保存: {html_path}")

        # 保存 Word/docx
        if result.docx:
            docx_path = os.path.join(paper_dir, "output.docx")
            with open(docx_path, "wb") as f:
                f.write(result.docx)
            logger.info(f"[MinerU] Word 已保存: {docx_path}")

        # 保存 content_list
        if result.content_list:
            cl_path = os.path.join(paper_dir, "content_list.json")
            with open(cl_path, "w", encoding="utf-8") as f:
                json.dump(result.content_list, f, ensure_ascii=False, indent=2)
            logger.info(f"[MinerU] content_list 已保存: {cl_path}")

        # ---- Step 3: 保存图片到 paper_dir/images/（与文档统一目录 + 保留 MinerU 路径规则）----
        # 路径整合方案 V3：图片存放在 data/papers/{id}/images/ 子目录中
        #   - 与 MinerU 原生 content_list.json / output.md / output.tex 路径规则完全一致
        #   - 三个产物中的 "images/xxx.jpg" 相对路径解析后都能命中
        #   - 静态文件挂载 /data/papers 自动覆盖 images/ 子目录
        # 旧路径 data/images/{id}/ 由本阶段末尾的迁移代码统一搬运
        if result.images:
            images_dir = os.path.join(paper_dir, "images")
            os.makedirs(images_dir, exist_ok=True)
            saved_count = 0
            for img in result.images:
                img_data = img.get("data")
                if img_data:
                    img_name = img["name"]
                    # 关键：图片保存到 paper_dir/images/xxx，与 content_list 路径一致
                    img_path = os.path.join(images_dir, img_name)
                    with open(img_path, "wb") as f:
                        f.write(img_data)
                    saved_count += 1
            logger.info(
                f"[MinerU] 图片已保存: {saved_count}张 -> {images_dir}/"
            )

        # ---- 阶段一完成，状态设为 "parsed" 等待分题 ----
        paper.status = "parsed"
        paper.parse_stage = "parsed"
        paper.parse_progress = {
            "stage": "parsed", "current": 0, "total": 0,
            "message": "MinerU 云端解析完成，等待分题...",
        }
        await db.commit()

        # ---- 路径整合：迁移旧 data/images/{id}/ 下的图片到 paper_dir/images/ ----
        # V3 路径方案：旧 data/images/{id}/xxx.jpg → 新 data/papers/{id}/images/xxx.jpg
        # 兼容旧数据：解析成功后把旧目录里的图片搬到 paper_dir/images/ 下
        # 与 content_list.json / output.md / output.tex 路径规则完全一致
        try:
            legacy_img_dir = os.path.join("data", "images", str(paper.id))
            target_img_dir = os.path.join(paper_dir, "images")
            if os.path.isdir(legacy_img_dir) and os.path.abspath(legacy_img_dir) != os.path.abspath(target_img_dir):
                os.makedirs(target_img_dir, exist_ok=True)
                moved = 0
                for fname in os.listdir(legacy_img_dir):
                    if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                        continue
                    src = os.path.join(legacy_img_dir, fname)
                    dst = os.path.join(target_img_dir, fname)
                    if not os.path.exists(dst):
                        shutil.move(src, dst)
                        moved += 1
                    else:
                        # 目标已存在则跳过（避免覆盖）
                        pass
                # 清空旧目录（仅当有文件被搬走时）
                if moved:
                    try:
                        os.rmdir(legacy_img_dir)
                        logger.info(
                            f"[MinerU] 旧图片目录已迁移: {legacy_img_dir} -> {target_img_dir} ({moved}张)"
                        )
                    except OSError:
                        # 目录非空（target 存在残留）则不强删
                        logger.info(
                            f"[MinerU] 旧图片目录保留(非空): {legacy_img_dir}"
                        )
        except Exception as e:
            logger.warning(f"[MinerU] 图片路径迁移异常(非致命): {e}")

        logger.info(
            f"[MinerU] 阶段一完成（等待分题）: paper_id={paper_id}, "
            f"产物→{paper_dir}/"
        )

    # ============================================================
    # 阶段二：分题切分（读取已保存的 MinerU 产物，执行分题）
    # ============================================================

    async def split_paper(
        self, paper_id: str, db: AsyncSession
    ) -> list[dict]:
        """
        阶段二：content分题切分（唯一方案）

        功能：读取已保存的 MinerU 产物 → content分题 → 写入数据库 → 自动优化
        输入参数：paper_id / db
        返回值：分题结果列表（每题含 question_no / stem / latex_source 等）
        使用场景：分题API调用，前端分题页触发
        """
        paper = await db.get(Paper, paper_id)
        if not paper:
            raise ValueError("试卷不存在")

        # 读取已保存的解析产物
        paper_dir = os.path.join("data", "papers", str(paper_id))
        latex_path = os.path.join(paper_dir, "output.tex")
        cl_path = os.path.join(paper_dir, "content_list.json")

        latex_full = None
        if os.path.exists(latex_path):
            with open(latex_path, "r", encoding="utf-8") as f:
                latex_full = f.read()

        content_list = None
        if os.path.exists(cl_path):
            with open(cl_path, "r", encoding="utf-8") as f:
                content_list = json.load(f)

        if not latex_full and not content_list:
            paper.status = "failed"
            paper.error_message = "未找到已保存的 MinerU 解析产物，请先执行云端解析"
            await db.commit()
            raise ValueError("未找到已保存的解析产物")

        # 更新状态为分题中
        paper.status = "splitting"
        paper.parse_progress = {
            "stage": "splitting", "current": 0, "total": 0,
            "message": "正在拆分题目...",
        }
        await db.commit()

        # 删除旧的未入库题目（重新分题时清理）
        delete_q = select(Question).where(
            Question.paper_id == paper_id,
            Question.in_bank == False,
        )
        delete_result = await db.execute(delete_q)
        for q in delete_result.scalars().all():
            await db.delete(q)
        await db.commit()

        # ---- 执行分题 ----
        split_questions = await self._run_split(
            paper_id, db, content_list, latex_full
        )

        if not split_questions:
            paper.status = "failed"
            paper.error_message = "MinerU 解析结果中未提取到题目"
            await db.commit()
            raise ValueError("未提取到题目")

        # ---- 写入数据库 ----
        paper.parse_progress = {
            "stage": "saving", "current": 0, "total": len(split_questions),
            "message": "正在保存分题结果...",
        }
        await db.commit()

        # 构建图片名称到URL的映射（从 paper_dir/images/ 读取实际文件，路径统一）
        # V3：图片在 data/papers/{id}/images/ 下，URL 为 /data/papers/{id}/images/{fname}
        paper_dir_for_imgs = os.path.join("data", "papers", str(paper_id))
        img_name_to_url = {}
        images_dir_for_imgs = os.path.join(paper_dir_for_imgs, "images")
        if os.path.isdir(images_dir_for_imgs):
            for fname in os.listdir(images_dir_for_imgs):
                if fname.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                    img_name_to_url[fname] = f"/data/papers/{paper_id}/images/{fname}"

        # 从 output.tex 提取每题独立 LaTeX
        per_question_latex = extract_per_question_latex_from_tex(latex_full)

        # 所有图片URL列表
        all_img_urls = list(img_name_to_url.values())

        for q_data in split_questions:
            q_no = q_data.get("question_no", 999)
            q_latex = q_data.get("latex", "") or per_question_latex.get(q_no, "")

            # 构建题内图片URL列表
            q_images = q_data.get("images", [])
            question_img_urls = []
            for q_img in q_images:
                img_name = q_img.get("name", "")
                if img_name in img_name_to_url:
                    question_img_urls.append({
                        "path": img_name_to_url[img_name],
                        "type": "figure",
                        "description": q_img.get("description", ""),
                    })

            has_figure = len(question_img_urls) > 0

            question = Question(
                paper_id=paper.id,
                question_no=q_no,
                question_type=q_data.get("question_type", "general"),
                stem=q_data.get("stem", ""),
                latex_source=q_latex,
                options=q_data.get("options", []),
                answer=q_data.get("answer", ""),
                has_figure=has_figure,
                has_formula=True,
                has_table=q_data.get("has_table", False),
                images=question_img_urls,
                boundary={"page": q_data.get("page", 1)},
                question_status="pending",
            )
            db.add(question)

        # 如果所有题都没匹配到图片，把图片挂到第一题
        if all_img_urls and not any(
            len(q.get("images", [])) > 0 for q in split_questions
        ):
            first_q = await db.execute(
                select(Question)
                .where(Question.paper_id == paper_id)
                .order_by(Question.question_no)
                .limit(1)
            )
            first_q = first_q.scalar_one_or_none()
            if first_q:
                first_q.images = [
                    {"path": url, "type": "figure", "description": ""}
                    for url in all_img_urls
                ]
                first_q.has_figure = True
                logger.info(f"[分题] {len(all_img_urls)}张图片挂载到第1题")

        paper.page_count = max(q.get("page", 1) for q in split_questions)
        paper.status = "completed"
        await db.commit()

        # ---- 自动优化阶段 ----
        paper.parse_progress = {
            "stage": "refining", "current": 0, "total": 0,
            "message": "正在优化题干...",
        }
        await db.commit()
        await _auto_refine_stage(db, paper)

        paper.parse_progress = {
            "stage": "matching_knowledge", "current": 0, "total": 0,
            "message": "正在匹配知识点...",
        }
        await db.commit()
        await _auto_knowledge_stage(db, paper)

        paper.parse_stage = "completed"
        paper.parse_progress = {
            "stage": "completed", "current": 0, "total": 0,
            "message": "分题完成",
        }
        await db.commit()

        logger.info(
            f"[分题] 完成: paper_id={paper_id}, 共{len(split_questions)}题"
        )

        return split_questions

    async def _run_split(
        self, paper_id: str, db: AsyncSession,
        content_list: list | None, latex_full: str | None,
    ) -> list[dict]:
        """
        执行 content分题逻辑（多级回退，保证结果稳定）

        功能：按 content_list 结构分题，失败时自动回退到 LaTeX 锚点
        输入参数：paper_id / db / content_list / latex_full
        返回值：分题结果列表
        """
        split_questions = []

        # 阶段1：content分题（V5 位置信息增强 + 跨页图题匹配）
        if content_list:
            logger.info("[分题] 执行 content分题（V5 位置匹配+原始顺序）")
            split_questions = split_content_list_ordered(content_list, latex=latex_full)

        # 阶段2：回退到 LaTeX 锚点分题
        if not split_questions and latex_full:
            logger.info("[分题] 回退到 LaTeX 锚点+分值校验")
            split_questions = split_latex_by_question_anchors(latex_full)

        # 阶段3：回退到 content_list 基础分题（最稳定回退）
        if not split_questions and content_list:
            logger.info("[分题] 回退到 content_list 基础分题")
            split_questions = split_content_list(content_list, latex=latex_full)

        return split_questions


# 全局单例
parse_service = ParseService()