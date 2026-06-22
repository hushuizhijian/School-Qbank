"""
试卷范例 API（阶段5：范例功能）

功能：试卷范例的增删查 + 一键应用到作业
输入参数：见各路由
返回值：PaperTemplateResponse / PaperTemplateListResponse
使用场景：作业组卷工作台"范例"功能
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.deps import get_current_user
from app.models.user import User
from app.models.homework import Homework
from app.schemas.paper_template import (
    PaperTemplateResponse,
    PaperTemplateListResponse,
    PaperTemplateCreateRequest,
)
from app.services import paper_template_service
from app.services import homework_service

router = APIRouter(prefix="/api/paper-templates", tags=["试卷范例"])


def _build_response(t) -> PaperTemplateResponse:
    """ORM -> 响应模型转换"""
    return PaperTemplateResponse(
        id=t.id,
        name=t.name,
        description=t.description,
        page_config=t.page_config or {},
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.get("", response_model=PaperTemplateListResponse)
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出当前用户的所有范例（按更新时间倒序）

    使用场景：组卷工作台下方范例列表展示
    """
    items, total = await paper_template_service.list_templates(db, str(current_user.id))
    return PaperTemplateListResponse(
        templates=[_build_response(t) for t in items],
        total=total,
    )


@router.post("", response_model=PaperTemplateResponse)
async def create_template(
    req: PaperTemplateCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """把当前作业的格式信息保存为命名范例

    使用场景：作业组卷工作台"保存"左侧的"范例"按钮
    说明：仅保存 page_config，不保存任何题目内容
    """
    tmpl = await paper_template_service.create_template(
        db,
        str(current_user.id),
        name=req.name,
        page_config=req.page_config,
        description=req.description,
    )
    return _build_response(tmpl)


@router.delete("/{template_id}")
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除指定范例（带用户隔离校验）

    使用场景：范例列表中的"删除"按钮
    """
    await paper_template_service.delete_template(db, str(current_user.id), template_id)
    return {"message": "已删除"}


@router.post("/{template_id}/apply/{homework_id}")
async def apply_template(
    template_id: str,
    homework_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """把范例的格式信息应用到指定作业（一键导入）

    功能：读取范例的 page_config，覆盖到指定作业的 page_config
    说明：只更新格式信息，**不影响**作业中的任何题目
    使用场景：范例列表中的"应用到当前作业"按钮
    """
    tmpl = await paper_template_service.get_template(db, str(current_user.id), template_id)
    # 校验目标作业归属
    hw = await homework_service.get_homework(db, homework_id, str(current_user.id))
    # 用范例的 page_config 覆盖作业的 page_config
    hw.page_config = dict(tmpl.page_config or {})
    await db.commit()
    return {"message": "已应用范例", "page_config": hw.page_config}
