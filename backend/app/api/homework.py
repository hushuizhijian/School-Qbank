"""
作业管理 API

功能：作业创建/列表/详情/更新/删除/批量删除/添加题目/导出PDF
输入参数：HomeworkCreateRequest / homework_id / BatchDeleteRequest
返回值：HomeworkResponse / PDF文件流
使用场景：作业组卷和导出
"""
import os

from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.deps import get_current_user
from app.models.user import User
from app.models.homework_question import HomeworkQuestion
from app.schemas.homework import (
    HomeworkResponse, HomeworkListResponse,
    HomeworkCreateRequest, HomeworkUpdateRequest,
    AddQuestionRequest, SetScoreRequest,
)
from app.services import homework_service
from app.services import pdf_export_record_service

router = APIRouter(prefix="/api/homework", tags=["作业"])


# 导出 PDF 的存盘目录
EXPORTS_DIR = os.path.join("data", "exports")


class BatchDeleteRequest(BaseModel):
    """批量删除请求体（阶段8）"""
    ids: list[str]


def _build_response(hw) -> HomeworkResponse:
    """构建带题目详情的作业响应"""
    questions = []
    for hq in hw.homework_questions:
        q = hq.question
        questions.append({
            "id": hq.id,
            "question_id": hq.question_id,
            "sort_order": hq.sort_order,
            "score": hq.score,
            "is_required": hq.is_required,
            "stem": q.stem if q else "",
            "question_type": q.question_type if q else "general",
            "question_no": q.question_no if q else 0,
            "options": q.options if q else [],
            "answer": q.answer if q else None,
        })
    return HomeworkResponse(
        id=hw.id,
        title=hw.title,
        subject=hw.subject,
        grade=hw.grade,
        total_score=sum(q["score"] for q in questions),
        status=hw.status,
        page_config=hw.page_config or {},
        created_at=hw.created_at,
        updated_at=hw.updated_at,
        questions=questions,
    )


@router.post("", response_model=HomeworkResponse)
async def create(
    req: HomeworkCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建作业（支持从试卷创建或直接创建空白作业）"""
    hw = await homework_service.create_homework(
        db,
        str(current_user.id),
        paper_id=req.paper_id,
        title=req.title,
        subject=req.subject,
        grade=req.grade,
        page_config=req.page_config,
    )
    hw = await homework_service.get_homework(db, hw.id, str(current_user.id))
    return _build_response(hw)


@router.get("", response_model=HomeworkListResponse)
async def list_homework(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),  # 阶段7：上限提到 200，匹配作业列表大页面需求
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取作业列表"""
    items, total = await homework_service.list_homework(db, str(current_user.id), page, page_size)
    return HomeworkListResponse(
        homework=[_build_response(h) for h in items],
        total=total,
    )


@router.get("/{homework_id}", response_model=HomeworkResponse)
async def get_homework(
    homework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取作业详情"""
    hw = await homework_service.get_homework(db, homework_id, str(current_user.id))
    return _build_response(hw)


@router.patch("/{homework_id}", response_model=HomeworkResponse)
async def update(
    homework_id: str,
    req: HomeworkUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新作业属性"""
    data = {k: v for k, v in req.model_dump().items() if v is not None}
    hw = await homework_service.update_homework(db, homework_id, str(current_user.id), data)
    return _build_response(hw)


@router.delete("/{homework_id}")
async def delete(
    homework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除作业"""
    await homework_service.delete_homework(db, homework_id, str(current_user.id))
    return {"message": "已删除"}


@router.post("/batch-delete")
async def batch_delete(
    req: "BatchDeleteRequest",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    批量删除作业（阶段8）

    输入参数：req.ids — 作业 id 列表
    返回值：{ deleted, skipped, message }
    使用场景：作业列表"批量删除"按钮
    """
    if not req.ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    if len(req.ids) > 200:
        # 防御性限制，避免一次删除过多
        raise HTTPException(status_code=400, detail="单次最多删除 200 个作业")
    deleted, skipped = await homework_service.batch_delete_homework(
        db, req.ids, str(current_user.id)
    )
    return {
        "deleted": deleted,
        "skipped": skipped,
        "message": f"已删除 {deleted} 个作业" + (f"，跳过 {skipped} 个" if skipped else ""),
    }


class BatchDeleteRequest(BaseModel):
    """批量删除请求体"""
    ids: list[str]


from pydantic import BaseModel  # noqa: E402  (必须在 schema 之后)


@router.post("/{homework_id}/questions")
async def add_question(
    homework_id: str,
    req: AddQuestionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """向作业添加题目"""
    await homework_service.add_question(
        db, homework_id, str(current_user.id), req.question_id, req.score
    )
    hw = await homework_service.get_homework(db, homework_id, str(current_user.id))
    return _build_response(hw)


@router.delete("/{homework_id}/questions/{hq_id}")
async def remove_question(
    homework_id: str,
    hq_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """从作业移除题目"""
    await homework_service.remove_question(db, homework_id, hq_id, str(current_user.id))
    hw = await homework_service.get_homework(db, homework_id, str(current_user.id))
    return _build_response(hw)


@router.put("/{homework_id}/reorder")
async def reorder(
    homework_id: str,
    question_ids: list[str],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """重新排序作业题目"""
    await homework_service.reorder_questions(db, homework_id, str(current_user.id), question_ids)
    return {"message": "已重新排序"}


@router.patch("/{homework_id}/questions/{hq_id}/score")
async def set_score(
    homework_id: str,
    hq_id: str,
    req: SetScoreRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """设置题目分值"""
    hq = await homework_service.set_score(db, homework_id, hq_id, str(current_user.id), req.score)
    return {"id": hq.id, "score": hq.score}


@router.get("/{homework_id}/export")
async def export_pdf(
    homework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """导出作业为 PDF（同时存盘，方便从导出记录列表重新下载）"""
    from app.services.pdf_export_service import export_homework_pdf
    try:
        buf = await export_homework_pdf(db, homework_id, str(current_user.id))
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="作业不存在")

    # 获取作业信息用于创建导出记录
    hw = await homework_service.get_homework(db, homework_id, str(current_user.id))
    page_config = hw.page_config or {}
    page_size = page_config.get("page_size", "A4")

    # 1) 先创建导出记录（拿到 export_id）
    record = await pdf_export_record_service.create_export(
        db, str(current_user.id), homework_id, hw.title, page_size
    )

    # 2) 把 PDF 存盘到 data/exports/{export_id}.pdf，并把 file_path 写回记录
    try:
        os.makedirs(EXPORTS_DIR, exist_ok=True)
        file_path = os.path.join(EXPORTS_DIR, f"{record.id}.pdf")
        with open(file_path, "wb") as f:
            f.write(buf.getvalue())
        record.file_path = file_path
        await db.commit()
    except Exception as e:
        # 存盘失败不影响主流程：依然能下载流
        print(f"[export_pdf] 存盘失败: {e}")

    # 3) 把 buf 指针复位后流式返回
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=homework_{homework_id[:8]}.pdf"},
    )
