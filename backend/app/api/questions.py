"""
题目 API 路由 — V2增强版

功能：题目CRUD/批量操作/入库管理/知识点绑定/状态切换
输入参数：question_id / 批量ID列表 / 筛选参数
返回值：QuestionResponse / 批量操作结果
使用场景：题目管理全流程
"""
import os
import logging
from fastapi import APIRouter, Depends, Body, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update as sa_update, select, func
from datetime import datetime

from app.database import get_db
from app.utils.deps import get_current_user
from app.models.user import User
from app.models.question import Question
from app.models.paper import Paper
from app.models.knowledge_point import KnowledgePoint
from app.schemas.question import QuestionResponse, KnowledgePointBrief
from app.schemas.ai import AiSelectionRequest
from app.services import question_service
from app.services.ai_service import AIService
from llm import factory as llm_factory
from app.services.tikz_render_service import tikz_renderer

# 服务级 logger，用于记录图片回退命中情况
logger = logging.getLogger(__name__)


# ====== 工具函数：把题目中 knowledge_points 的 ID 列表补全为对象列表 ======

async def _collect_and_hydrate_knowledge_points(
    db: AsyncSession,
    items: list[dict],
) -> None:
    """
    把一批题目（dict 形式）中的 knowledge_points（ID 列表）补全为对象列表。

    功能：
      1) 收集所有题目中出现的知识点 ID
      2) 一次 SQL 查询出对应 KnowledgePoint 行
      3) 原地把每个题目的 knowledge_points 替换为 [{id, name, code, level}, ...]
      4) 同时把原始 ID 列表保留到 knowledge_point_ids 字段
    输入参数：db（异步会话）、items（题目 dict 列表，要求每个 dict 含 knowledge_points 字段）
    返回值：无（原地修改 items）
    使用场景：序列化前对题目响应做知识点富化，避免前端拿到 ID 列表后无法展示名称
    """
    if not items:
        return

    # 1) 收集 ID（兼容旧数据：knowledge_points 可能是 ID 列表或对象列表）
    kp_ids: set[str] = set()
    for it in items:
        kp_field = it.get("knowledge_points")
        if not kp_field:
            continue
        for kp in kp_field:
            if isinstance(kp, str) and kp:
                kp_ids.add(kp)
            elif isinstance(kp, dict) and kp.get("id"):
                kp_ids.add(kp["id"])

    if not kp_ids:
        # 即使没有 ID，也把 knowledge_point_ids 字段补成空 list
        for it in items:
            it["knowledge_point_ids"] = []
        return

    # 2) 一次查完
    result = await db.execute(select(KnowledgePoint).where(KnowledgePoint.id.in_(kp_ids)))
    kp_map: dict[str, KnowledgePointBrief] = {
        kp.id: KnowledgePointBrief(
            id=kp.id,
            name=kp.name,
            code=kp.code,
            level=kp.level or 0,
        )
        for kp in result.scalars().all()
    }

    # 3) 原地替换
    for it in items:
        raw = it.get("knowledge_points") or []
        ids: list[str] = []
        for kp in raw:
            if isinstance(kp, str) and kp:
                ids.append(kp)
            elif isinstance(kp, dict) and kp.get("id"):
                ids.append(kp["id"])
        it["knowledge_point_ids"] = ids
        it["knowledge_points"] = [kp_map[i] for i in ids if i in kp_map]

router = APIRouter(prefix="/api/questions", tags=["题目"])


# 题目配图可被浏览器直接访问的内容类型映射
_CONTENT_TYPE_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
}


def _resolve_image_file(paper_id_hint: str | None, raw_path: str) -> str | None:
    """
    在 data/papers 目录中智能解析图片真实路径

    功能：根据题目的 paper_id 与图片原始路径，按优先级尝试多种存储位置，
          解决历史数据中 paper_id 缺失 / 路径层级不一致导致的 404 问题
    输入参数：
      paper_id_hint — 题目所属 paper_id（可能为 None）
      raw_path — 题目 images 字段中存储的原始路径（/data/papers/.../xxx.jpg）
    返回值：可访问的磁盘绝对路径；找不到则返回 None
    使用场景：题库页 / 校对工作台等需要稳定显示历史图片的位置
    """
    if not raw_path:
        return None

    # 仅处理 /data/papers 前缀的图片，跳过 uploads / 外链等
    if not raw_path.startswith("/data/papers/"):
        return None

    # 拆分原始路径：/data/papers/{paper_id}[/images]/{filename}
    parts = [p for p in raw_path.split("/") if p]
    # 期望形如 ['data', 'papers', '<paper_id>', '<maybe images>', '<filename>']
    if len(parts) < 4 or parts[0] != "data" or parts[1] != "papers":
        return None

    path_paper_id = parts[2]                                # 路径中携带的 paper_id
    has_images_subdir = len(parts) >= 5 and parts[3] == "images"
    filename = parts[-1]                                    # 图片文件名

    papers_root = os.path.abspath("data/papers")
    if not os.path.isdir(papers_root):
        return None

    # 候选 paper_id 列表：优先题目自身的 paper_id，其次是路径中记录的
    candidate_paper_ids: list[str] = []
    for pid in (paper_id_hint, path_paper_id):
        if pid and pid not in candidate_paper_ids:
            candidate_paper_ids.append(pid)

    # 候选存储位置：images/ 子目录优先（绝大多数情况），其次平铺
    subdir_variants = ["images", ""]

    # 1) 按已知 paper_id + 子目录组合精确查找
    for pid in candidate_paper_ids:
        for sub in subdir_variants:
            if not sub:
                candidate = os.path.join(papers_root, pid, filename)
            else:
                candidate = os.path.join(papers_root, pid, sub, filename)
            if os.path.isfile(candidate):
                logger.info("[question-image] 命中: paper_id=%s sub=%s file=%s", pid, sub, filename)
                return candidate

    # 2) 全局模糊搜索：按文件名在所有 paper 目录中查找（兜底）
    #    用于题目 paper_id 为空、路径中 paper_id 错误等历史脏数据场景
    for root, _dirs, files in os.walk(papers_root):
        if filename in files:
            return os.path.join(root, filename)

    logger.warning("[question-image] 未找到: paper_id_hint=%s raw=%s", paper_id_hint, raw_path)
    return None


@router.get("")
async def list_questions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    in_bank_only: bool = Query(False, description="仅显示已入库题目"),
    subject: str = Query(None),
    grade: str = Query(None),
    keyword: str = Query(None),
    question_type: str = Query(None),
    difficulty: str = Query(None),
    has_figure: bool = Query(None, description="是否有图片"),
    has_formula: bool = Query(None, description="是否有公式"),
    has_table: bool = Query(None, description="是否有表格"),
    knowledge_point_ids: str = Query(None, description="知识点ID列表，逗号分隔"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取题目列表（支持分页/筛选/搜索）"""
    # 基础查询
    base_q = select(Question)

    # 仅已入库
    if in_bank_only:
        base_q = base_q.where(Question.in_bank == True)

    # 关联试卷表获取学科/年级
    join_q = base_q.join(Paper, Question.paper_id == Paper.id, isouter=True)

    # 筛选条件
    if subject:
        join_q = join_q.where(Paper.subject == subject)
    if grade:
        join_q = join_q.where(Paper.grade == grade)
    if question_type:
        join_q = join_q.where(Question.question_type == question_type)
    if difficulty:
        join_q = join_q.where(Question.difficulty == difficulty)
    if keyword:
        join_q = join_q.where(Question.stem.contains(keyword))
    if has_figure is not None:
        join_q = join_q.where(Question.has_figure == has_figure)
    if has_formula is not None:
        join_q = join_q.where(Question.has_formula == has_formula)
    if has_table is not None:
        join_q = join_q.where(Question.has_table == has_table)
    if knowledge_point_ids:
        kp_ids = [kid.strip() for kid in knowledge_point_ids.split(",") if kid.strip()]
        if kp_ids:
            from app.models.question_knowledge import QuestionKnowledge
            join_q = join_q.join(QuestionKnowledge, Question.id == QuestionKnowledge.question_id)
            join_q = join_q.where(QuestionKnowledge.knowledge_point_id.in_(kp_ids))

    # 计算总数
    count_q = select(func.count()).select_from(join_q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # 分页
    offset = (page - 1) * page_size
    items_q = join_q.order_by(Question.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(items_q)
    items = result.scalars().all()

    return {
        "items": [QuestionResponse.model_validate(q) for q in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/by-paper/{paper_id}")
async def list_questions_by_paper(
    paper_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """按试卷查询题目列表 — 校对页使用此接口"""
    q = select(Question).where(Question.paper_id == paper_id).order_by(Question.question_no)
    result = await db.execute(q)
    questions = result.scalars().all()
    # 序列化为 dict 后对 knowledge_points 做补全，把 ID 列表替换为对象列表供前端展示
    items = [QuestionResponse.model_validate(q).model_dump() for q in questions]
    await _collect_and_hydrate_knowledge_points(db, items)
    return items


@router.get("/{question_id}", response_model=QuestionResponse)
async def get_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取题目详情"""
    q = await question_service.get_question(db, question_id, str(current_user.id))
    item = QuestionResponse.model_validate(q).model_dump()
    await _collect_and_hydrate_knowledge_points(db, [item])
    return item


@router.get("/{question_id}/image")
async def get_question_image(
    question_id: str,
    index: int = Query(0, ge=0, description="题目 images 数组下标"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    获取题目配图（智能解析路径，兼容历史脏数据）

    功能：根据题目 images 字段中的原始路径，结合题目的 paper_id 在
          data/papers 目录中查找真实文件并以 FileResponse 返回。
          解决数据库中 paper_id 缺失或路径层级错误导致的 404。
    输入参数：
      question_id — 题目 ID
      index — images 数组下标（默认 0，即第一张图）
    返回值：图片文件响应（按扩展名自动推断 Content-Type）
    使用场景：题库管理页 / 校对工作台等需要稳定显示历史图片的位置
    """
    q = await question_service.get_question(db, question_id, str(current_user.id))

    images = q.images or []
    if index >= len(images):
        raise HTTPException(status_code=404, detail="图片索引超出范围")

    entry = images[index]
    # 支持字符串路径或 {path/url} 字典
    raw_path = ""
    if isinstance(entry, str):
        raw_path = entry
    elif isinstance(entry, dict):
        raw_path = str(entry.get("path") or entry.get("url") or "")

    if not raw_path:
        raise HTTPException(status_code=404, detail="题目图片路径为空")

    resolved = _resolve_image_file(q.paper_id, raw_path)
    if not resolved:
        raise HTTPException(status_code=404, detail="题目图片文件不存在")

    # 推断 Content-Type（按扩展名）
    _, ext = os.path.splitext(resolved)
    media_type = _CONTENT_TYPE_BY_EXT.get(ext.lower(), "application/octet-stream")
    return FileResponse(resolved, media_type=media_type)


@router.patch("/{question_id}", response_model=QuestionResponse)
async def update_question(
    question_id: str,
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新题目字段"""
    q = await question_service.get_question(db, question_id, str(current_user.id))
    updated = await question_service.update_question(db, q.id, data)
    return QuestionResponse.model_validate(updated)


@router.delete("/{question_id}")
async def delete_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除题目"""
    await question_service.get_question(db, question_id, str(current_user.id))
    await question_service.delete_question(db, question_id)
    return {"message": "已删除"}


@router.put("/reorder")
async def reorder(
    paper_id: str = Body(...),
    question_ids: list[str] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量更新题目顺序"""
    await question_service.reorder_questions(db, paper_id, question_ids)
    return {"message": "顺序已更新"}


@router.patch("/status/batch")
async def batch_update_status(
    question_ids: list[str] = Body(...),
    status: str = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量更新题目状态"""
    if status not in ("pending", "normal", "error"):
        raise HTTPException(status_code=400, detail="无效的状态值")

    await db.execute(
        sa_update(Question)
        .where(Question.id.in_(question_ids))
        .values(question_status=status)
    )
    await db.commit()
    return {"message": f"已更新 {len(question_ids)} 道题目状态为 {status}"}


@router.put("/batch")
async def batch_update(
    updates: list[dict] = Body(..., description="批量更新数据列表，每项含 id 和待更新字段"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量更新题目 — 每项包含 question_id 和待更新字段"""
    result = await question_service.batch_update(db, updates)
    return result


@router.post("/batch/bank-import")
async def batch_bank_import(
    question_ids: list[str] = Body(..., description="待入库的题目ID列表"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量入库题目"""
    result = await question_service.batch_bank_import(db, question_ids)
    return result


@router.post("/batch/delete")
async def batch_delete(
    question_ids: list[str] = Body(..., description="待删除的题目ID列表"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量删除题目"""
    result = await question_service.batch_delete(db, question_ids)
    return result


@router.post("/{question_id}/ai-explain", response_model=QuestionResponse)
async def ai_explain(
    question_id: str,
    selection: AiSelectionRequest = Body(default_factory=AiSelectionRequest),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI生成题目解析

    功能：调用 LLM 为题目生成解析，保存到 analysis 字段
    输入参数：
      question_id — 题目 ID
      selection — AI 供应商选择（provider_key / instance_name / model_key），空时按三级优先级回退到系统默认
    返回值：更新后的 QuestionResponse
    使用场景：校对工作台/题库管理页点击"AI 解析"按钮
    """
    q = await question_service.get_question(db, question_id, str(current_user.id))

    # 使用 AIService 统一解析（用户选择 → 系统默认 → 兜底链）
    service = AIService(
        db,
        provider_key=selection.provider_key,
        instance_name=selection.instance_name,
        model_key=selection.model_key,
        model_type="chat",
    )
    analysis = await service.generate_analysis_text(q.stem, q.answer or "")
    if not analysis:
        raise HTTPException(status_code=500, detail="AI生成解析失败")

    updated = await question_service.update_question(db, q.id, {"analysis": analysis})
    return QuestionResponse.model_validate(updated)


@router.post("/{question_id}/ai-refine", response_model=QuestionResponse)
async def ai_refine(
    question_id: str,
    selection: AiSelectionRequest = Body(default_factory=AiSelectionRequest),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI优化题干

    功能：调用 LLM 优化题干文本，规范化格式/修正错别字/LaTeX
    输入参数：
      question_id — 题目 ID
      selection — AI 供应商选择（provider_key / instance_name / model_key），空时按三级优先级回退到系统默认
    返回值：更新后的 QuestionResponse
    使用场景：校对工作台/题库管理页点击"AI 优化"按钮
    """
    q = await question_service.get_question(db, question_id, str(current_user.id))

    # 使用 AIService 统一解析
    service = AIService(
        db,
        provider_key=selection.provider_key,
        instance_name=selection.instance_name,
        model_key=selection.model_key,
        model_type="chat",
    )
    refined = await service.refine_stem_text(q.stem)
    if not refined:
        raise HTTPException(status_code=500, detail="AI优化题干失败")

    updated = await question_service.update_question(db, q.id, {"stem": refined})
    return QuestionResponse.model_validate(updated)


@router.post("/{question_id}/render-tikz")
async def render_tikz(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """渲染题目的TikZ代码为PNG图片"""
    q = await question_service.get_question(db, question_id, str(current_user.id))
    if not q.tikz_code:
        raise HTTPException(status_code=400, detail="该题目没有TikZ代码")

    img_path = await tikz_renderer.render(
        q.tikz_code,
        str(q.paper_id),
        q.question_no
    )

    if not img_path:
        raise HTTPException(status_code=500, detail="TikZ渲染失败，请检查代码或确认LaTeX已安装")

    # 更新 images 字段：添加 tikz_rendered 类型图片
    existing_images = q.images or []
    # 移除旧的 tikz_rendered 图片
    filtered = [img for img in existing_images if img.get("type") != "tikz_rendered"]
    filtered.append({"path": img_path, "type": "tikz_rendered"})
    q.images = filtered
    q.figure_type = "tikz"
    await db.commit()

    return {"image_path": img_path, "figure_type": "tikz"}


@router.patch("/{question_id}/tikz")
async def update_tikz(
    question_id: str,
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新题目的TikZ代码和图表类型"""
    q = await question_service.get_question(db, question_id, str(current_user.id))
    if "tikz_code" in data:
        q.tikz_code = data["tikz_code"]
    if "figure_type" in data:
        q.figure_type = data["figure_type"]
    await db.commit()
    return {"tikz_code": q.tikz_code, "figure_type": q.figure_type}


@router.get("/bank/list")
async def list_bank_questions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    subject: str = Query(None),
    grade: str = Query(None),
    keyword: str = Query(None),
    question_type: str = Query(None),
    difficulty: str = Query(None),
    has_figure: bool = Query(None, description="是否有图片"),
    has_formula: bool = Query(None, description="是否有公式"),
    has_table: bool = Query(None, description="是否有表格"),
    knowledge_point_ids: str = Query(None, description="知识点ID列表，逗号分隔"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取题库中已入库的题目列表（支持分页/筛选/搜索）"""
    # 基础查询：已入库的题目
    base_q = select(Question).where(Question.in_bank == True)

    # 关联试卷表获取学科/年级
    join_q = base_q.join(Paper, Question.paper_id == Paper.id, isouter=True)

    # 筛选条件
    if subject:
        join_q = join_q.where(Paper.subject == subject)
    if grade:
        join_q = join_q.where(Paper.grade == grade)
    if question_type:
        join_q = join_q.where(Question.question_type == question_type)
    if difficulty:
        join_q = join_q.where(Question.difficulty == difficulty)
    if keyword:
        join_q = join_q.where(Question.stem.contains(keyword))

    # V2新增筛选：图片/公式/表格
    if has_figure is not None:
        if has_figure:
            join_q = join_q.where(Question.figure_type != "none")
        else:
            join_q = join_q.where(Question.figure_type == "none")

    if has_formula is not None:
        if has_formula:
            join_q = join_q.where(Question.stem.contains("$"))
        else:
            join_q = join_q.where(~Question.stem.contains("$"))

    if has_table is not None:
        if has_table:
            join_q = join_q.where(Question.stem.contains("|"))
        else:
            join_q = join_q.where(~Question.stem.contains("|"))

    # V2新增筛选：知识点ID
    if knowledge_point_ids:
        kp_ids = [kid.strip() for kid in knowledge_point_ids.split(",") if kid.strip()]
        if kp_ids:
            # JSON 数组包含查询
            for kp_id in kp_ids:
                join_q = join_q.where(Question.knowledge_points.contains(kp_id))

    # 总数
    count_q = select(func.count()).select_from(join_q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    # 分页
    result_q = join_q.order_by(Question.bank_added_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(result_q)
    questions = result.scalars().all()

    # 构建响应（包含来源试卷信息）
    items = []
    for q in questions:
        paper = await db.get(Paper, q.paper_id) if q.paper_id else None
        item = QuestionResponse.model_validate(q).model_dump()
        item["paper_filename"] = paper.filename if paper else "已删除的试卷"
        item["paper_subject"] = paper.subject if paper else ""
        item["paper_grade"] = paper.grade if paper else ""
        items.append(item)

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.patch("/{question_id}/bank")
async def toggle_bank_status(
    question_id: str,
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """切换题目入库状态"""
    q = await question_service.get_question(db, question_id, str(current_user.id))
    in_bank = data.get("in_bank", not q.in_bank)

    q.in_bank = in_bank
    if in_bank:
        q.bank_added_at = datetime.now()
        q.question_status = "normal"
    else:
        q.bank_added_at = None

    await db.commit()
    return {
        "id": q.id,
        "in_bank": q.in_bank,
        "bank_added_at": q.bank_added_at.isoformat() if q.bank_added_at else None,
        "question_status": q.question_status,
    }


@router.patch("/{question_id}/status")
async def update_status(
    question_id: str,
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """修改题目状态"""
    q = await question_service.get_question(db, question_id, str(current_user.id))
    new_status = data.get("question_status")
    if new_status not in ("pending", "normal", "error"):
        raise HTTPException(status_code=400, detail="无效的状态值，允许: pending/normal/error")

    q.question_status = new_status
    await db.commit()
    return {
        "id": q.id,
        "question_status": q.question_status,
    }


@router.put("/{question_id}/knowledge-points")
async def set_knowledge_points(
    question_id: str,
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """设置题目的知识点（全量替换）"""
    from app.services import knowledge_service
    kp_ids = data.get("knowledge_point_ids", [])
    result = await knowledge_service.bind_question(db, question_id, kp_ids)
    return result


@router.post("/batch-auto-ai")
async def batch_auto_ai(
    paper_id: str = Body(..., embed=True, description="试卷 ID"),
    selection: AiSelectionRequest = Body(default_factory=AiSelectionRequest),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """进入校对工作台时批量补全 AI 难度 + AI 知识点

    仅对未标注的题目执行（ai_difficulty IS NULL 或 knowledge_points 为空），
    已被用户编辑过的不会重打。返回每题的补全情况与失败原因。

    输入参数：
      paper_id — 试卷 ID
      selection — AI 供应商选择（provider_key / instance_name / model_key），
                  空时按三级优先级回退到系统默认（system_settings.llm_id）
    """
    # 使用 AIService 统一解析（用户选择 → 系统默认 → 兜底链）
    service = AIService(
        db,
        provider_key=selection.provider_key,
        instance_name=selection.instance_name,
        model_key=selection.model_key,
        model_type="chat",
    )
    return await service.batch_auto_ai(paper_id)
