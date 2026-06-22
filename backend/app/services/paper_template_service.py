"""
试卷范例服务（阶段5：范例功能）

功能：试卷范例的 CRUD + 应用到作业
输入参数：db 会话 / user_id / 范例数据
返回值：PaperTemplate 对象 / 列表元组
使用场景：作业组卷工作台的"保存为范例" / "应用范例"功能
"""
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.paper_template import PaperTemplate


async def list_templates(
    db: AsyncSession, user_id: str
) -> tuple[list[PaperTemplate], int]:
    """列出用户的全部范例

    功能：返回该用户创建的所有范例，按更新时间倒序
    输入参数：db / user_id
    返回值：(范例列表, 总数)
    使用场景：组卷工作台下方范例列表展示
    """
    count_q = select(func.count(PaperTemplate.id)).where(PaperTemplate.user_id == user_id)
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(PaperTemplate)
        .where(PaperTemplate.user_id == user_id)
        .order_by(PaperTemplate.updated_at.desc())
    )
    result = await db.execute(q)
    items = list(result.scalars().all())
    return items, total


async def get_template(db: AsyncSession, user_id: str, template_id: str) -> PaperTemplate:
    """获取单个范例（带用户隔离校验）"""
    tmpl = await db.get(PaperTemplate, template_id)
    if not tmpl or tmpl.user_id != user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="范例不存在")
    return tmpl


async def create_template(
    db: AsyncSession,
    user_id: str,
    name: str,
    page_config: dict,
    description: str | None = None,
) -> PaperTemplate:
    """创建范例

    功能：把当前作业的格式信息（page_config）保存为命名范例
    输入参数：db / user_id / name / page_config / description（可选）
    返回值：新创建的 PaperTemplate 对象
    使用场景：作业组卷工作台"保存"左侧的"范例"按钮
    """
    tmpl = PaperTemplate(
        user_id=user_id,
        name=name,
        description=description,
        # 防御性拷贝，避免外部修改影响存储对象
        page_config=dict(page_config or {}),
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return tmpl


async def delete_template(db: AsyncSession, user_id: str, template_id: str) -> None:
    """删除范例（带用户隔离校验）"""
    tmpl = await get_template(db, user_id, template_id)
    await db.delete(tmpl)
    await db.commit()
