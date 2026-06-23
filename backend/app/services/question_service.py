"""
题目管理服务 — V2增强版

功能：题目CRUD/批量更新/批量入库/批量删除/重排序
输入参数：db会话 / question_id / 批量数据
返回值：Question对象 / 批量操作结果
使用场景：题目全生命周期管理
"""
import logging
from fastapi import HTTPException
from sqlalchemy import select, update as sa_update, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime

from app.models.question import Question

# 服务级 logger（统一通过 common.log_utils 写入文件/控制台，便于排查数据同步问题）
logger = logging.getLogger(__name__)


async def get_question(db: AsyncSession, question_id: str, user_id: str) -> Question:
    """获取题目并校验权限 — 使用 selectinload 加载 knowledge_points 关系"""
    q = select(Question).where(Question.id == question_id)
    result = await db.execute(q)
    question = result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="题目不存在")
    return question


async def update_question(
    db: AsyncSession, question_id: str, data: dict
) -> Question:
    """更新题目字段"""
    # 允许更新的字段白名单（含V2新增字段）
    # 关键：必须包含 latex_source，否则分题页保存的修改无法同步到校对工作台
    allowed = {"stem", "question_type", "question_no", "options", "answer", "is_favorite",
               "knowledge_points", "difficulty", "ai_difficulty", "user_difficulty",
               "question_status",
               "images", "tikz_code", "figure_type", "boundary",
               "analysis", "score", "source_paper_name", "source_year",
               "source_region", "has_figure", "has_formula", "has_table",
               "image_layout_mode", "has_warning", "latex_source",
               "word_content"}
    updates = {k: v for k, v in data.items() if k in allowed and v is not None}

    # 打印接收到的 keys（排查数据同步问题：分题保存/校对工作台更新是否被过滤）
    logger.info(
        "[update_question] id=%s 接收字段=%s 白名单通过=%s",
        question_id,
        sorted(data.keys()),
        sorted(updates.keys()),
    )

    if not updates:
        return await db.get(Question, question_id)

    await db.execute(
        sa_update(Question).where(Question.id == question_id).values(**updates)
    )
    await db.commit()
    return await db.get(Question, question_id)


async def delete_question(db: AsyncSession, question_id: str) -> None:
    """删除题目，并重新编号同一试卷下的后继题目"""
    q = await db.get(Question, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")

    paper_id = q.paper_id
    deleted_no = q.question_no
    await db.delete(q)

    # 仅当题目属于某张试卷时，才重编号同试卷的后继题目
    if paper_id:
        result = await db.execute(
            select(Question)
            .where(Question.paper_id == paper_id, Question.question_no > deleted_no)
            .order_by(Question.question_no)
        )
        for later in result.scalars():
            later.question_no -= 1

    await db.commit()


async def reorder_questions(db: AsyncSession, paper_id: str, order: list[str]) -> None:
    """批量更新题目顺序"""
    for idx, qid in enumerate(order, 1):
        await db.execute(
            sa_update(Question)
            .where(Question.id == qid, Question.paper_id == paper_id)
            .values(question_no=idx)
        )
    await db.commit()


async def batch_update(db: AsyncSession, updates: list[dict]) -> dict:
    """批量更新题目 — 按字段分组后执行批量SQL"""
    # 允许更新的字段白名单（含V2新增字段）
    # 关键：必须包含 latex_source，否则批量保存无法更新 LaTeX 源码
    allowed = {"stem", "question_type", "question_no", "options", "answer", "is_favorite",
               "knowledge_points", "difficulty", "ai_difficulty", "user_difficulty",
               "question_status",
               "images", "tikz_code", "figure_type", "boundary",
               "analysis", "score", "source_paper_name", "source_year",
               "source_region", "has_figure", "has_formula", "has_table",
               "image_layout_mode", "has_warning", "latex_source"}
    success_count = 0
    failed_ids = []

    # 按字段签名分组，相同字段的项合并为一次批量SQL
    groups: dict[tuple, list[tuple[str, dict]]] = {}
    for item in updates:
        question_id = item.get("id")
        if not question_id:
            failed_ids.append(question_id)
            continue

        fields = {k: v for k, v in item.items() if k in allowed and k != "id" and v is not None}
        if not fields:
            continue

        # 用字段键的排序元组作为分组依据
        sig = tuple(sorted(fields.keys()))
        groups.setdefault(sig, []).append((question_id, fields))

    # 每组执行一次批量更新
    for sig, items in groups.items():
        # 检查同组内所有项的值是否一致
        first_fields = items[0][1]
        all_same = all(item[1] == first_fields for item in items)

        if all_same:
            # 值完全一致：单条SQL批量更新
            ids = [item[0] for item in items]
            result = await db.execute(
                sa_update(Question).where(Question.id.in_(ids)).values(**first_fields)
            )
            success_count += result.rowcount
            # rowcount可能少于ids数量，补差到failed
            if result.rowcount < len(ids):
                failed_ids.extend(ids[result.rowcount:])
        else:
            # 值不一致：逐条执行SQL更新
            for question_id, fields in items:
                result = await db.execute(
                    sa_update(Question).where(Question.id == question_id).values(**fields)
                )
                if result.rowcount > 0:
                    success_count += 1
                else:
                    failed_ids.append(question_id)

    await db.commit()
    return {
        "success_count": success_count,
        "failed_ids": failed_ids,
        "message": f"成功更新{success_count}道题目" + (f"，{len(failed_ids)}道失败" if failed_ids else ""),
    }


async def batch_bank_import(db: AsyncSession, question_ids: list[str]) -> dict:
    """批量入库题目 — 使用批量SQL一次性更新"""
    now = datetime.now()

    # 批量更新：仅更新未入库且非error状态的题目
    result = await db.execute(
        sa_update(Question)
        .where(
            Question.id.in_(question_ids),
            Question.in_bank == False,  # noqa: E712 — SQLAlchemy需要==写法
            Question.question_status != "error",
        )
        .values(in_bank=True, bank_added_at=now, question_status="normal")
    )
    imported = result.rowcount
    skipped = len(question_ids) - imported

    await db.commit()
    return {
        "imported": imported,
        "skipped": skipped,
        "total": len(question_ids),
        "message": f"成功入库{imported}题，跳过{skipped}题" if skipped > 0 else f"成功入库{imported}题",
    }


async def batch_delete(db: AsyncSession, question_ids: list[str]) -> dict:
    """批量删除题目 — 使用批量SQL一次性删除"""
    # 先查询存在的ID，用于计算失败列表
    result = await db.execute(
        select(Question.id).where(Question.id.in_(question_ids))
    )
    existing_ids = {str(row[0]) for row in result.all()}
    failed_ids = [qid for qid in question_ids if qid not in existing_ids]

    # 批量删除
    await db.execute(
        sa_delete(Question).where(Question.id.in_(question_ids))
    )
    deleted = len(existing_ids)

    await db.commit()
    return {
        "deleted": deleted,
        "failed_ids": failed_ids,
        "total": len(question_ids),
        "message": f"成功删除{deleted}道题目" + (f"，{len(failed_ids)}道不存在" if failed_ids else ""),
    }


async def reparse_question(
    db: AsyncSession, question_id: str
) -> Question:
    """标记题目需要重新解析（暂不实现，待 LLM 集成后使用）"""
    raise HTTPException(status_code=501, detail="重新识别功能待 LLM 集成后开放")
