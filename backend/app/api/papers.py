"""
试卷 API 路由 — V2增强版

功能：试卷上传/列表/详情/删除/图片/解析进度/校对统计/一键入库
输入参数：UploadFile / paper_id / parse_config
返回值：PaperResponse / PaperListResponse / 统计数据
使用场景：试卷管理全流程
"""
from fastapi import APIRouter, Depends, UploadFile, File, Query, BackgroundTasks, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime
import os
import json
import asyncio
import logging

from app.database import get_db, async_session
from app.utils.deps import get_current_user
from app.models.user import User
from app.models.question import Question
from app.models.paper import Paper
from app.schemas.paper import PaperResponse, PaperListResponse, PaperUploadResponse
from app.services import paper_service
from app.services import stat_service
from app.services.parse_service import ParseService
from app.schemas.question import QuestionResponse, QuestionListResponse

router = APIRouter(prefix="/api/papers", tags=["试卷"])
logger = logging.getLogger(__name__)


@router.post("/upload", response_model=PaperUploadResponse)
async def upload(
    file: UploadFile = File(...),
    subject: str = Form(""),
    grade: str = Form(""),
    semester: str = Form(""),
    region: str = Form(""),
    paper_type: str = Form(""),
    academic_year: str = Form(""),
    parse_config: str = Form("{}"),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传试卷，支持 parse_config 参数配置解析引擎"""
    paper = await paper_service.upload_paper(
        db, str(current_user.id), file, subject, grade, semester,
        region=region, paper_type=paper_type, academic_year=academic_year,
    )

    # 解析配置：默认引擎为 mineru
    try:
        config = json.loads(parse_config) if parse_config else {}
    except json.JSONDecodeError:
        config = {}

    # 默认使用 MinerU 引擎
    if "engine" not in config:
        config["engine"] = "mineru"

    # 保存解析配置到 Paper 记录（供重新解析时使用）
    paper.parse_config = config
    await db.commit()

    async def parse_bg():
        """后台解析任务"""
        async with async_session() as bg_db:
            parse_svc = ParseService()
            await parse_svc.parse_paper(str(paper.id), bg_db, config)

    background_tasks.add_task(parse_bg)

    return PaperUploadResponse(
        id=str(paper.id),
        filename=paper.filename,
        status=paper.status,
        message="上传成功，正在后台解析...",
        subject=paper.subject,
        grade=paper.grade,
        semester=paper.semester,
    )


@router.get("", response_model=PaperListResponse)
async def list_papers(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取试卷列表"""
    papers, total = await paper_service.list_papers(db, str(current_user.id), page, page_size)
    return PaperListResponse(
        papers=[PaperResponse.model_validate(p) for p in papers],
        total=total,
    )


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取试卷详情"""
    paper = await paper_service.get_paper(db, paper_id, str(current_user.id))
    return PaperResponse.model_validate(paper)


@router.delete("/{paper_id}")
async def delete_paper(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除试卷"""
    await paper_service.delete_paper(db, paper_id, str(current_user.id))
    return {"message": "删除成功"}


@router.get("/{paper_id}/questions", response_model=QuestionListResponse)
async def list_questions(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取试卷下的题目列表"""
    await paper_service.get_paper(db, paper_id, str(current_user.id))
    q = select(Question).where(Question.paper_id == paper_id).order_by(Question.question_no)
    result = await db.execute(q)
    questions = result.scalars().all()
    return QuestionListResponse(
        questions=[QuestionResponse.model_validate(q) for q in questions],
        total=len(questions),
    )


@router.get("/{paper_id}/images")
async def list_images(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    获取试卷全部图片资源（含未匹配到题目的孤儿图片）

    功能：扫描 data/papers/{paper_id}/ 目录下的所有图片文件（路径已与文档统一），
         并与题目 images 字段匹配，标记每张图片的归属关系。
    返回值：
      - images: 图片列表，每项含 path/filename/size/matched_question_no/matched_question_id
      - matched: 已被题目引用的图片路径集合
      - orphan: 未被任何题目引用的图片路径列表
    使用场景：分题页图片资源库 + 智能替换
    """
    await paper_service.get_paper(db, paper_id, str(current_user.id))

    # 1. 扫描 paper_dir/images/ 下的全部图片（V3 路径方案 — 与 content_list 路径一致）
    # 主扫描路径：data/papers/{id}/images/（新方案）
    paper_dir = os.path.join("data", "papers", str(paper_id))
    images_dir = os.path.join(paper_dir, "images")
    disk_files: list[dict] = []
    if os.path.isdir(images_dir):
        for fname in sorted(os.listdir(images_dir)):
            if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                continue
            full_path = os.path.join(images_dir, fname)
            try:
                size_bytes = os.path.getsize(full_path)
            except OSError:
                size_bytes = 0
            disk_files.append({
                "path": f"/data/papers/{paper_id}/images/{fname}",
                "filename": fname,
                "size": size_bytes,
            })

    # 兜底：旧路径 data/images/{id}/ 也扫描一次（迁移未跑完的兼容）
    legacy_img_dir = os.path.join("data", "images", str(paper_id))
    if os.path.isdir(legacy_img_dir) and os.path.abspath(legacy_img_dir) != os.path.abspath(images_dir):
        existing_filenames = {item["filename"] for item in disk_files}
        for fname in sorted(os.listdir(legacy_img_dir)):
            if not fname.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                continue
            if fname in existing_filenames:
                continue
            full_path = os.path.join(legacy_img_dir, fname)
            try:
                size_bytes = os.path.getsize(full_path)
            except OSError:
                size_bytes = 0
            disk_files.append({
                "path": f"/data/images/{paper_id}/{fname}",
                "filename": fname,
                "size": size_bytes,
            })

    # 2. 查询题目，建立 image path → question 的反向索引
    q_result = await db.execute(
        select(Question).where(Question.paper_id == paper_id)
    )
    questions = q_result.scalars().all()

    # 归一化：把题目 images 中所有 path / url 提取为字符串
    def _norm(p) -> str:
        if isinstance(p, str):
            return p
        if isinstance(p, dict):
            return str(p.get("path") or p.get("url") or "")
        return ""

    matched_paths: dict[str, dict] = {}  # path -> {question_no, question_id}
    for q in questions:
        for img in (q.images or []):
            url = _norm(img)
            if not url:
                continue
            # 用 basename 做匹配（兼容带 /data/images/{id}/ 前缀和不带两种）
            base = os.path.basename(url)
            # 先尝试完整 path
            matched_paths[url] = {
                "question_no": q.question_no,
                "question_id": str(q.id),
            }
            # 也存一个 basename key，方便反查
            if base:
                matched_paths[base] = {
                    "question_no": q.question_no,
                    "question_id": str(q.id),
                }

    # 3. 整合：每张磁盘图片标注是否已匹配
    images: list[dict] = []
    orphan: list[str] = []
    for item in disk_files:
        path = item["path"]
        filename = item["filename"]
        # 通过完整 path 或 filename 查找匹配
        match = matched_paths.get(path) or matched_paths.get(filename)
        is_matched = match is not None
        if is_matched:
            matched_info = match
        else:
            matched_info = None
            orphan.append(path)
        images.append({
            "path": path,
            "filename": filename,
            "size": item["size"],
            "matched": is_matched,
            "matched_question_no": matched_info["question_no"] if matched_info else None,
            "matched_question_id": matched_info["question_id"] if matched_info else None,
        })

    return {
        "images": images,
        "total": len(images),
        "matched_count": len(images) - len(orphan),
        "orphan_count": len(orphan),
        "orphan": orphan,
    }


@router.post("/{paper_id}/ai-enhance")
async def ai_enhance(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """使用 LLM 增强题目识别"""
    await paper_service.get_paper(db, paper_id, str(current_user.id))
    from app.services.pdf_service import _auto_refine_stage
    paper = await paper_service.get_paper(db, paper_id, str(current_user.id))
    await _auto_refine_stage(db, paper)
    return {"message": "AI 增强完成"}


@router.get("/{paper_id}/stats")
async def get_stats(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取试卷校对统计数据 — 包含7类统计+按题型分组+质量检查"""
    return await stat_service.get_paper_stats(db, paper_id, str(current_user.id))


@router.post("/{paper_id}/bank-import")
async def bank_import(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """一键入库：将该试卷下所有未入库的正常题目批量入库"""
    await paper_service.get_paper(db, paper_id, str(current_user.id))

    # 查询该试卷下所有题目
    q = select(Question).where(Question.paper_id == paper_id)
    result = await db.execute(q)
    questions = result.scalars().all()

    total = len(questions)
    imported = 0
    skipped = 0

    now = datetime.now()
    for question in questions:
        if question.in_bank:
            # 已入库的跳过
            skipped += 1
        elif question.question_status == "error":
            # 错误状态题目跳过不入库
            skipped += 1
        else:
            # 正常题目入库
            question.in_bank = True
            question.bank_added_at = now
            question.question_status = "normal"
            imported += 1

    await db.commit()

    return {
        "imported": imported,
        "skipped": skipped,
        "total": total,
        "message": f"成功入库{imported}题，跳过{skipped}题（已入库或错误状态）" if skipped > 0 else f"成功入库{imported}题",
    }


@router.get("/{paper_id}/parse-progress")
async def get_parse_progress(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取试卷解析进度 — 前端轮询用"""
    paper = await paper_service.get_paper(db, paper_id, str(current_user.id))

    # 从 parse_progress JSON 字段提取进度信息
    progress_info = paper.parse_progress or {}

    # 计算已解析题目数
    q_count = select(func.count(Question.id)).where(Question.paper_id == paper_id)
    parsed_count = (await db.execute(q_count)).scalar() or 0

    # 映射后端状态到前端期望的状态
    status_map = {
        "uploaded": "parsing",     # 已上传正在等待解析
        "pending": "parsing",      # 等待中
        "parsing": "parsing",      # 解析中
        "processing": "parsing",   # 处理中
        "parsed": "completed",     # MinerU解析完成，等待分题（视为完成）
        "splitting": "parsing",    # 分题中
        "completed": "completed",  # 已完成
        "failed": "failed",        # 失败
    }
    frontend_status = status_map.get(paper.status, paper.status)

    # 计算进度百分比
    progress = 0
    if paper.status == "completed":
        progress = 100
    elif progress_info.get("total", 0) > 0:
        current = progress_info.get("current", 0)
        total = progress_info.get("total", 1)
        progress = int(current / total * 100)

    return {
        "status": frontend_status,
        "progress": progress,
        "stage": progress_info.get("message", paper.parse_stage or ""),
        "parsed_count": parsed_count,
        "total_count": progress_info.get("total", 0),
        "error_count": 0,
        "error_message": paper.error_message,
    }


@router.post("/{paper_id}/parse")
async def trigger_reparse(
    paper_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """手动触发/重新触发试卷解析"""
    paper = await paper_service.get_paper(db, paper_id, str(current_user.id))

    # 重置解析状态
    paper.status = "parsing"
    paper.parse_stage = "extracting"
    paper.error_message = None
    paper.parse_progress = {
        "stage": "extracting",
        "current": 0,
        "total": 0,
        "message": "正在准备重新解析...",
    }
    await db.commit()

    # 删除旧的解析题目
    q = select(Question).where(Question.paper_id == paper_id, Question.in_bank == False)
    result = await db.execute(q)
    for question in result.scalars().all():
        await db.delete(question)
    await db.commit()

    # 后台执行解析
    config = paper.parse_config or {"engine": "mineru"}

    async def parse_bg():
        """后台解析任务"""
        async with async_session() as bg_db:
            parse_svc = ParseService()
            await parse_svc.parse_paper(str(paper.id), bg_db, config)

    background_tasks.add_task(parse_bg)

    return {
        "success": True,
        "message": "已触发重新解析",
        "paper_id": str(paper.id),
    }


@router.get("/{paper_id}/sse")
async def parse_sse(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    SSE (Server-Sent Events) 端点：实时推送解析进度

    前端连接后，后端每 1.5 秒查询一次 parse_progress，
    当解析状态变为 completed / failed 时推送最终事件后关闭连接。
    """
    from fastapi.responses import StreamingResponse

    async def event_generator():
        last_stage = ""
        while True:
            try:
                paper = await db.get(Paper, paper_id)
                if not paper:
                    yield f"data: {json.dumps({'type': 'error', 'data': {'message': '试卷不存在'}}, ensure_ascii=False)}\n\n"
                    break

                progress = paper.parse_progress or {}
                status = paper.status
                stage = progress.get("stage", paper.parse_stage or "")
                message = progress.get("message", stage)
                current = progress.get("current", 0)
                total = progress.get("total", 0)

                # 只在 stage 变化时推送（避免重复）
                if stage != last_stage:
                    last_stage = stage
                    payload = json.dumps({
                        'type': 'progress',
                        'data': {
                            'stage': stage,
                            'message': message,
                            'current': current,
                            'total': total,
                            'status': status,
                        }
                    }, ensure_ascii=False)
                    yield f"data: {payload}\n\n"

                if status in ("completed", "failed"):
                    if status == "completed":
                        done_payload = json.dumps({'type': 'done', 'data': {'message': '解析完成'}}, ensure_ascii=False)
                        yield f"data: {done_payload}\n\n"
                    else:
                        err_payload = json.dumps({'type': 'error', 'data': {'message': paper.error_message or '解析失败'}}, ensure_ascii=False)
                        yield f"data: {err_payload}\n\n"
                    break

            except Exception:
                ex_payload = json.dumps({'type': 'error', 'data': {'message': '内部错误'}}, ensure_ascii=False)
                yield f"data: {ex_payload}\n\n"
                break

            await asyncio.sleep(1.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/{paper_id}/resplit")
async def resplit_paper(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    重新切分试卷题目（content分题唯一方案）

    功能：基于 content_list 结构 + bbox 位置信息精确分题 + 图题匹配
    流程：
      1. 读取已保存的 output.tex 和 content_list.json
      2. 删除旧的非入库题目
      3. 运行 content分题（V5 位置信息增强 + 跨页图题匹配）
      4. 失败时回退到 LaTeX 锚点分题
      5. 保存新题目到数据库
      6. 返回新题目列表
    """
    from fastapi import HTTPException

    # 捕获整体异常，避免给前端返回 500
    try:
        return await _do_resplit(paper_id, db)
    except HTTPException:
        # HTTPException 继续向上抛（保持 4xx 语义）
        raise
    except FileNotFoundError as e:
        logger.error(f"[分题] 文件未找到: {e}")
        raise HTTPException(status_code=404, detail=f"分题失败: 解析产物文件缺失 - {e}")
    except json.JSONDecodeError as e:
        logger.error(f"[分题] content_list.json 解析失败: {e}")
        raise HTTPException(status_code=400, detail=f"分题失败: content_list.json 格式错误 - {e}")
    except Exception as e:
        # 任何未知异常 → 友好提示 + 记录日志
        import traceback
        error_detail = f"{type(e).__name__}: {str(e) or '(空错误信息)'}"
        logger.error(f"[分题] 未捕获异常: {error_detail}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500,
            detail=f"分题失败: {error_detail}（请查看后端日志）",
        )


async def _do_resplit(
    paper_id: str,
    db: AsyncSession,
):
    """
    content分题实际处理逻辑（从 resplit_paper 抽离，便于异常捕获）

    功能：执行 content分题，多级回退保证结果稳定
    输入参数：paper_id / db
    使用场景：分题 API / 后台任务
    """
    from fastapi import HTTPException

    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="试卷不存在")

    # 读取已保存的 LaTeX 和 content_list
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
        raise HTTPException(status_code=400, detail="未找到已保存的解析结果，请先解析试卷")

    # 删除旧的未入库题目
    delete_q = select(Question).where(
        Question.paper_id == paper_id,
        Question.in_bank == False,
    )
    delete_result = await db.execute(delete_q)
    for q in delete_result.scalars().all():
        await db.delete(q)
    await db.commit()

    # 导入分题函数
    from app.services.mineru_splitter import (
        split_content_list_ordered,
        split_latex_by_question_anchors,
        split_content_list,
        extract_per_question_latex_from_tex,
    )

    split_questions = []

    # ===== content分题（唯一方案）多级回退 =====
    # 阶段1：content分题（V5 位置信息增强 + 跨页图题匹配）
    if content_list:
        try:
            logger.info("[分题] 执行 content分题（V5 位置匹配+原始顺序）")
            split_questions = split_content_list_ordered(content_list, latex=latex_full)
        except Exception as e:
            logger.warning(f"[分题] content分题异常: {e}")

    # 阶段2：回退到 LaTeX 锚点分题
    if not split_questions and latex_full:
        try:
            logger.info("[分题] 回退到 LaTeX 锚点+分值校验")
            split_questions = split_latex_by_question_anchors(latex_full)
        except Exception as e:
            logger.warning(f"[分题] LaTeX锚点分题异常: {e}")

    # 阶段3：回退到 content_list 基础分题（最稳定回退）
    if not split_questions and content_list:
        try:
            logger.info("[分题] 回退到 content_list 基础分题")
            split_questions = split_content_list(content_list, latex=latex_full)
        except Exception as e:
            logger.warning(f"[分题] content_list基础分题异常: {e}")

    if not split_questions:
        raise HTTPException(
            status_code=400,
            detail=(
                "分题失败，未能提取到题目。"
                f"（content_list={len(content_list) if content_list else 0}项, "
                f"latex={len(latex_full) if latex_full else 0}字符）"
            ),
        )

    # 构建图片名称到URL的映射（V3：图片在 paper_dir/images/ 下）
    paper_dir = os.path.join("data", "papers", str(paper_id))
    images_dir_resplit = os.path.join(paper_dir, "images")
    img_name_to_url = {}
    if os.path.isdir(images_dir_resplit):
        for fname in os.listdir(images_dir_resplit):
            if fname.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                img_name_to_url[fname] = f"/data/papers/{paper_id}/images/{fname}"

    # 保存题目到数据库
    from app.models.question import Question as QuestionModel

    per_question_latex = extract_per_question_latex_from_tex(latex_full)

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

        # 判断是否真的有图
        has_figure = len(question_img_urls) > 0 or q_data.get("has_figure", False)

        question = QuestionModel(
            paper_id=paper_id,
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

    await db.commit()

    # 返回新题目列表
    q = select(Question).where(Question.paper_id == paper_id).order_by(Question.question_no)
    result = await db.execute(q)
    questions = result.scalars().all()

    return {
        "success": True,
        "method": 2,  # 保留兼容：固定为 2 (content分题)
        "method_name": "content分题(V5位置匹配+原始顺序)",
        "question_count": len(questions),
        "questions": [QuestionResponse.model_validate(q).model_dump() for q in questions],
    }


@router.post("/{paper_id}/fix-latex-sources")
async def fix_latex_sources(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    修复已解析试卷的 latex_source 字段：将整卷 LaTeX 替换为每题独立 LaTeX

    用于对已有数据的迁移修复。读取之前保存的 content_list.json 重新分题，
    提取每题对应的 LaTeX 片段，更新每道题的 latex_source 字段。
    """
    paper = await db.get(Paper, paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="试卷不存在")

    # 读取已保存的 content_list
    cl_path = os.path.join("data", "papers", str(paper_id), "content_list.json")
    if not os.path.exists(cl_path):
        raise HTTPException(status_code=400, detail="content_list.json 不存在，无法修复")

    with open(cl_path, "r", encoding="utf-8") as f:
        content_list = json.load(f)

    # 读取已保存的 LaTeX
    latex_path = os.path.join("data", "papers", str(paper_id), "output.tex")
    latex_full = None
    if os.path.exists(latex_path):
        with open(latex_path, "r", encoding="utf-8") as f:
            latex_full = f.read()

    # 重新分题，获取每题 LaTeX
    from app.services.mineru_splitter import extract_per_question_latex_from_tex
    per_question_latex = extract_per_question_latex_from_tex(latex_full)

    if not per_question_latex:
        raise HTTPException(status_code=400, detail="未能从 output.tex 提取题目 LaTeX，无法修复")

    # 更新每道题的 latex_source 字段
    fixed_count = 0
    for q_no, q_latex in per_question_latex.items():
        if not q_latex:
            continue

        result = await db.execute(
            select(Question)
            .where(Question.paper_id == paper_id)
            .where(Question.question_no == q_no)
            .limit(1)
        )
        question = result.scalar_one_or_none()
        if question:
            question.latex_source = per_q_latex
            fixed_count += 1

    await db.commit()

    return {
        "message": f"已修复 {fixed_count} 道题的 latex_source",
        "total_questions": len(per_question_latex),
    }


@router.get("/{paper_id}/verify-table-matching")
async def verify_table_matching(
    paper_id: str,
    auto_fix: bool = Query(False, description="是否自动修复检测到的不匹配"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    验证试卷的表格-题目关联是否正确

    功能：基于 content_list.json 重新跑分题算法（V6 表格位置匹配），
         提取每道题应有的表格列表，与数据库中现有题目对比，报告不匹配项。
         如果 auto_fix=True，会自动应用修正（重新分题保存）。
    输入参数：
        paper_id: 试卷 ID
        auto_fix: 是否自动修复（默认仅报告，不修改）
    返回值：
        {
            "ok": 是否完全匹配,
            "total_questions": 题目总数,
            "total_tables": 检测到的表格总数,
            "mismatches": [ { type, table_img, expected_question_no, actual_question_no, page, description } ],
            "auto_fixed": 是否执行了自动修复,
            "fixed_count": 修复的题目数（仅 auto_fix=True 时有意义）,
            "message": 描述,
        }
    使用场景：分题后/编辑前发现"第35题显示第4题表格"类问题时调用
    """
    from fastapi import HTTPException
    from app.services.mineru_splitter import (
        verify_table_question_matching,
        split_content_list_ordered,
    )

    # 权限校验 + 试卷存在
    await paper_service.get_paper(db, paper_id, str(current_user.id))

    # 读取解析产物
    paper_dir = os.path.join("data", "papers", str(paper_id))
    cl_path = os.path.join(paper_dir, "content_list.json")
    latex_path = os.path.join(paper_dir, "output.tex")

    if not os.path.exists(cl_path):
        raise HTTPException(status_code=400, detail="content_list.json 不存在，无法验证")

    with open(cl_path, "r", encoding="utf-8") as f:
        content_list = json.load(f)

    latex_full = None
    if os.path.exists(latex_path):
        with open(latex_path, "r", encoding="utf-8") as f:
            latex_full = f.read()

    # 读取当前数据库中的题目
    q_result = await db.execute(
        select(Question).where(Question.paper_id == paper_id)
    )
    db_questions = q_result.scalars().all()
    existing_serialized = [
        {
            "id": str(q.id),
            "question_no": q.question_no,
            "images": q.images or [],
            "has_table": bool(q.has_table),
        }
        for q in db_questions
    ]

    # 跑验证
    report = verify_table_question_matching(
        content_list, latex_full, existing_questions=existing_serialized
    )

    # 自动修复
    fixed_count = 0
    if auto_fix and not report.get("ok", True) and existing_serialized:
        # 用最新的分题结果覆盖保存
        new_questions = split_content_list_ordered(content_list, latex_full)
        if new_questions:
            # 构造 question_no -> 新数据的索引
            new_by_no: dict[int, dict] = {q.get("question_no", 0): q for q in new_questions}
            # 对每道数据库题目，按 question_no 对齐更新
            for db_q in db_questions:
                new_data = new_by_no.get(db_q.question_no)
                if not new_data:
                    continue
                # 检查是否有差异：images 或 has_table
                old_imgs = db_q.images or []
                new_imgs_raw = new_data.get("images", [])
                # 转换 new_imgs 格式
                new_imgs_normalized = []
                img_name_to_url = {}
                images_dir = os.path.join(paper_dir, "images")
                if os.path.isdir(images_dir):
                    for fname in os.listdir(images_dir):
                        if fname.endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                            img_name_to_url[fname] = f"/data/papers/{paper_id}/images/{fname}"
                for im in new_imgs_raw:
                    name = im.get("name", "") if isinstance(im, dict) else ""
                    if name and name in img_name_to_url:
                        new_imgs_normalized.append({
                            "path": img_name_to_url[name],
                            "type": "figure",
                            "description": im.get("description", ""),
                        })
                # 仅在确实不同时更新
                if (
                    db_q.has_table != new_data.get("has_table", False)
                    or len(old_imgs) != len(new_imgs_normalized)
                ):
                    db_q.images = new_imgs_normalized
                    db_q.has_table = bool(new_data.get("has_table", False))
                    db_q.has_figure = bool(new_data.get("has_figure", False))
                    fixed_count += 1
            if fixed_count > 0:
                await db.commit()

    return {
        "ok": report.get("ok", True),
        "total_questions": report.get("total_questions", 0),
        "total_tables": report.get("total_tables", 0),
        "mismatches": report.get("mismatches", []),
        "auto_fixed": auto_fix and fixed_count > 0,
        "fixed_count": fixed_count,
        "message": (
            "校验通过，所有表格-题目关联均正确"
            if report.get("ok", True)
            else f"发现 {len(report.get('mismatches', []))} 处不匹配"
            + (f"，已自动修复 {fixed_count} 道题" if auto_fix and fixed_count > 0 else "")
        ),
    }


@router.post("/{paper_id}/split")
async def split_paper(
    paper_id: str,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    阶段二：对已完成 MinerU 解析的试卷执行分题切分

    前置条件：试卷状态为 "parsed"（MinerU 云端解析已完成）
    流程：
      1. 读取已保存的 output.tex 和 content_list.json
      2. 执行 content分题（V5 位置信息增强 + 跨页图题匹配）
      3. 写入数据库
      4. 自动优化（LLM优化题干 → 知识点匹配）
      5. 状态变为 "completed"

    分题方案：content分题（唯一方案）
    """
    from fastapi import HTTPException

    paper = await paper_service.get_paper(db, paper_id, str(current_user.id))

    # 检查状态：必须已完成 MinerU 解析
    if paper.status not in ("parsed", "completed", "failed"):
        raise HTTPException(
            status_code=400,
            detail=f"当前状态为 {paper.status}，请等待 MinerU 云端解析完成后再分题",
        )

    # 后台执行分题
    async def split_bg():
        """后台分题任务"""
        async with async_session() as bg_db:
            parse_svc = ParseService()
            try:
                await parse_svc.split_paper(str(paper_id), bg_db)
            except Exception as e:
                logger.error(f"[分题] 后台任务异常: {e}")

    background_tasks.add_task(split_bg)

    return {
        "success": True,
        "message": "已触发分题，请等待完成",
        "paper_id": str(paper_id),
    }


@router.get("/{paper_id}/preview")
async def preview_mineru_output(
    paper_id: str,
    file: str = Query(..., description="产物文件名（output.md / output.tex / output.html / content_list.json）"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    预览 MinerU 解析产物文件

    功能：读取 paper 目录下已保存的 MinerU 产物文件并返回内容
    输入参数：paper_id / file（文件名）
    返回值：文件原始内容（text/plain 或 application/json）
    使用场景：分题页预览 MinerU 解析产物
    """
    from fastapi import HTTPException
    from fastapi.responses import PlainTextResponse, Response

    await paper_service.get_paper(db, paper_id, str(current_user.id))

    # 安全检查：只允许读取指定文件
    allowed_files = {"output.md", "output.tex", "output.html", "content_list.json", "output.docx"}
    if file not in allowed_files:
        raise HTTPException(status_code=400, detail=f"不支持的文件: {file}")

    file_path = os.path.join("data", "papers", str(paper_id), file)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"产物文件不存在: {file}")

    # 根据文件类型返回
    if file.endswith(".json"):
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return Response(content=content, media_type="application/json")
    elif file.endswith(".docx"):
        return Response(
            content=open(file_path, "rb").read(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
    else:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return PlainTextResponse(content=content)
