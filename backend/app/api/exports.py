"""
PDF导出记录 API

功能：导出记录列表/创建/删除/下载
输入参数：homework_id / export_id
返回值：ExportResponse / ExportListResponse / PDF文件流
使用场景：PDF导出记录管理
"""
import os
from fastapi import APIRouter, Depends, Query, Body, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.utils.deps import get_current_user
from app.models.user import User
from app.models.export_record import ExportRecord
from app.schemas.export import ExportResponse, ExportListResponse
from app.services import pdf_export_record_service, homework_service

router = APIRouter(prefix="/api/exports", tags=["导出记录"])


@router.get("", response_model=ExportListResponse)
async def list_exports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取用户的PDF导出记录列表"""
    items, total = await pdf_export_record_service.list_exports(
        db, str(current_user.id), page, page_size
    )
    return ExportListResponse(
        items=[ExportResponse.model_validate(item) for item in items],
        total=total,
    )


@router.delete("/{export_id}")
async def delete_export(
    export_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除导出记录（同时删除磁盘上的 PDF 文件）"""
    rec = (await db.execute(
        select(ExportRecord).where(
            ExportRecord.id == export_id, ExportRecord.user_id == str(current_user.id)
        )
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="导出记录不存在")

    # 删除磁盘上的 PDF 文件（如果存在）
    if rec.file_path and os.path.exists(rec.file_path):
        try:
            os.remove(rec.file_path)
        except Exception as e:
            print(f"[delete_export] 删除文件失败: {e}")

    await db.delete(rec)
    await db.commit()
    return {"message": "已删除"}


@router.get("/{export_id}/download")
async def download_export(
    export_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """下载指定导出记录对应的 PDF 文件"""
    rec = (await db.execute(
        select(ExportRecord).where(
            ExportRecord.id == export_id, ExportRecord.user_id == str(current_user.id)
        )
    )).scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="导出记录不存在")

    if not rec.file_path or not os.path.exists(rec.file_path):
        raise HTTPException(status_code=404, detail="文件已失效，请重新导出")

    # 用标题做下载文件名
    safe_title = (rec.title or "试卷").replace("/", "_").replace("\\", "_")
    return FileResponse(
        rec.file_path,
        media_type="application/pdf",
        filename=f"{safe_title}_{export_id[:8]}.pdf",
    )


@router.post("", response_model=ExportResponse)
async def create_export(
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建PDF导出记录（前端导出PDF后调用）"""
    homework_id = data.get("homework_id")
    if not homework_id:
        raise HTTPException(status_code=400, detail="homework_id is required")

    # 获取作业信息
    hw = await homework_service.get_homework(db, homework_id, str(current_user.id))
    page_config = hw.page_config or {}
    page_size = page_config.get("page_size", "A4")

    record = await pdf_export_record_service.create_export(
        db, str(current_user.id), homework_id, hw.title, page_size
    )
    return ExportResponse.model_validate(record)
