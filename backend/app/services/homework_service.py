"""
作业管理服务

功能：作业创建/列表/详情/更新/删除/添加题目/重排序/设置分值
输入参数：db会话 / user_id / homework_id
返回值：Homework对象 / 列表元组
使用场景：作业组卷管理
"""
from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.homework import Homework
from app.models.homework_question import HomeworkQuestion
from app.models.question import Question
from app.models.paper import Paper


async def create_homework(
    db: AsyncSession,
    user_id: str,
    paper_id: str | None = None,
    title: str | None = None,
    subject: str | None = None,
    grade: str | None = None,
    page_config: dict | None = None,
) -> Homework:
    """
    创建作业草稿

    功能：根据是否提供 paper_id 创建空白作业或从试卷创建作业。
          paper_id 为空时创建完全空白的作业（组卷页直接组卷场景）；
          提供 paper_id 时从试卷复制学科/年级信息（兼容老逻辑）。
    输入参数：db / user_id / paper_id（可选） / title（可选） /
             subject（可选） / grade（可选） / page_config（可选）
    返回值：新创建的 Homework 对象
    使用场景：组卷入口创建草稿
    """
    # 初始化默认值
    init_title = title or ""
    init_subject = subject or ""
    init_grade = grade or ""

    # 提供 paper_id 时校验并继承学科/年级
    if paper_id:
        paper = await db.get(Paper, paper_id)
        if not paper or paper.user_id != user_id:
            raise HTTPException(status_code=404, detail="试卷不存在")
        # 试卷有学科/年级且未显式指定时继承
        if not init_subject:
            init_subject = paper.subject or ""
        if not init_grade:
            init_grade = paper.grade or ""

    hw = Homework(
        user_id=user_id,
        title=init_title,
        subject=init_subject,
        grade=init_grade,
        page_config=page_config or {},
        status="draft",
    )
    db.add(hw)
    await db.commit()
    await db.refresh(hw)
    return hw


async def list_homework(
    db: AsyncSession, user_id: str, page: int, page_size: int
) -> tuple[list[Homework], int]:
    """列出用户的作业列表"""
    count_q = select(func.count(Homework.id)).where(Homework.user_id == user_id)
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(Homework)
        .where(Homework.user_id == user_id)
        .order_by(Homework.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(q)
    return list(result.scalars()), total


async def get_homework(db: AsyncSession, homework_id: str, user_id: str) -> Homework:
    """获取作业详情"""
    q = select(Homework).where(Homework.id == homework_id, Homework.user_id == user_id)
    result = await db.execute(q)
    hw = result.scalar_one_or_none()
    if not hw:
        raise HTTPException(status_code=404, detail="作业不存在")
    return hw


async def update_homework(
    db: AsyncSession, homework_id: str, user_id: str, data: dict
) -> Homework:
    """更新作业属性"""
    hw = await get_homework(db, homework_id, user_id)
    for key in ("title", "subject", "grade", "total_score", "page_config"):
        if key in data and data[key] is not None:
            setattr(hw, key, data[key])
    await db.commit()
    await db.refresh(hw)
    return hw


async def delete_homework(db: AsyncSession, homework_id: str, user_id: str) -> None:
    """删除作业"""
    hw = await get_homework(db, homework_id, user_id)
    # 先删除所有 homework_questions
    for hq in hw.homework_questions:
        await db.delete(hq)
    await db.delete(hw)
    await db.commit()


async def batch_delete_homework(
    db: AsyncSession, homework_ids: list[str], user_id: str
) -> tuple[int, int]:
    """
    批量删除作业

    功能：一次删除多个作业（仅当前用户拥有的）
    输入参数：db / homework_ids / user_id
    返回值：(deleted_count, skipped_count) — 实际删除数 / 跳过数（不存在或非本人）
    使用场景：作业列表批量删除按钮
    """
    deleted = 0
    skipped = 0
    for hid in homework_ids:
        # 单条 get_homework 内部会校验所有权，不存在或非本人会抛 HTTPException
        try:
            hw = await get_homework(db, hid, user_id)
        except HTTPException:
            skipped += 1
            continue
        # 先删除所有 homework_questions
        for hq in hw.homework_questions:
            await db.delete(hq)
        await db.delete(hw)
        deleted += 1
    await db.commit()
    return deleted, skipped


async def add_question(
    db: AsyncSession, homework_id: str, user_id: str, question_id: str, score: int = 0
) -> HomeworkQuestion:
    """向作业添加题目"""
    await get_homework(db, homework_id, user_id)

    # 获取当前最大 sort_order
    max_order_result = await db.execute(
        select(func.max(HomeworkQuestion.sort_order)).where(
            HomeworkQuestion.homework_id == homework_id
        )
    )
    max_order = max_order_result.scalar() or -1

    hq = HomeworkQuestion(
        homework_id=homework_id,
        question_id=question_id,
        sort_order=max_order + 1,
        score=score,
    )
    db.add(hq)
    await db.commit()
    await db.refresh(hq)
    return hq


async def remove_question(
    db: AsyncSession, homework_id: str, hq_id: str, user_id: str
) -> None:
    """从作业移除题目"""
    await get_homework(db, homework_id, user_id)
    hq = await db.get(HomeworkQuestion, hq_id)
    if not hq or hq.homework_id != homework_id:
        raise HTTPException(status_code=404, detail="题目不在本作业中")
    await db.delete(hq)
    await _renumber(db, homework_id)
    await db.commit()


async def reorder_questions(
    db: AsyncSession, homework_id: str, user_id: str, question_ids: list[str]
) -> None:
    """重新排序作业题目"""
    await get_homework(db, homework_id, user_id)
    for i, hq_id in enumerate(question_ids):
        hq = await db.get(HomeworkQuestion, hq_id)
        if hq and hq.homework_id == homework_id:
            hq.sort_order = i
    await db.commit()


async def set_score(
    db: AsyncSession, homework_id: str, hq_id: str, user_id: str, score: int
) -> HomeworkQuestion:
    """设置题目分值"""
    await get_homework(db, homework_id, user_id)
    hq = await db.get(HomeworkQuestion, hq_id)
    if not hq or hq.homework_id != homework_id:
        raise HTTPException(status_code=404, detail="题目不在本作业中")
    hq.score = score
    await db.commit()
    await db.refresh(hq)
    return hq


async def _renumber(db: AsyncSession, homework_id: str) -> None:
    """内部：重新编号作业题目的 sort_order"""
    result = await db.execute(
        select(HomeworkQuestion)
        .where(HomeworkQuestion.homework_id == homework_id)
        .order_by(HomeworkQuestion.sort_order)
    )
    for i, hq in enumerate(result.scalars()):
        hq.sort_order = i
