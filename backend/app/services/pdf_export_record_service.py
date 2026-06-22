"""
PDF导出记录服务

功能：导出记录列表/创建/删除
输入参数：db会话 / user_id / homework_id
返回值：ExportRecord对象 / 列表元组
使用场景：PDF导出记录管理
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.export_record import ExportRecord


async def list_exports(
    db: AsyncSession, user_id: str, page: int, page_size: int
) -> tuple[list[ExportRecord], int]:
    """列出用户的导出记录"""
    count_q = select(func.count(ExportRecord.id)).where(ExportRecord.user_id == user_id)
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(ExportRecord)
        .where(ExportRecord.user_id == user_id)
        .order_by(ExportRecord.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    return list(result.scalars()), total


async def create_export(
    db: AsyncSession,
    user_id: str,
    homework_id: str,
    title: str,
    page_size: str = "A4",
    file_path: str | None = None,
) -> ExportRecord:
    """创建导出记录"""
    record = ExportRecord(
        user_id=user_id,
        homework_id=homework_id,
        title=title,
        page_size=page_size,
        file_path=file_path,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def delete_export(db: AsyncSession, export_id: str, user_id: str) -> None:
    """删除导出记录"""
    q = select(ExportRecord).where(ExportRecord.id == export_id, ExportRecord.user_id == user_id)
    result = await db.execute(q)
    record = result.scalar_one_or_none()
    if not record:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="导出记录不存在")
    await db.delete(record)
    await db.commit()
