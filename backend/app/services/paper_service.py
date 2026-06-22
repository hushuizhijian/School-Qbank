"""
试卷管理服务

功能：上传/列表/详情/删除试卷
输入参数：db会话 / user_id / UploadFile
返回值：Paper对象 / 列表元组
使用场景：试卷文件管理
"""
import os
import shutil
import uuid
from datetime import datetime, timezone

from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.config import settings
from app.models.paper import Paper
from app.models.question import Question


async def upload_paper(db: AsyncSession, user_id: str, file: UploadFile,
                       subject: str = "", grade: str = "", semester: str = "",
                       region: str = "", paper_type: str = "", academic_year: str = "") -> Paper:
    """上传试卷文件，创建 Paper 记录"""
    ext = os.path.splitext(file.filename or "upload.pdf")[1].lower()
    if ext != ".pdf":
        raise HTTPException(status_code=400, detail="仅支持 PDF 文件")

    content = await file.read()
    if len(content) > settings.max_file_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"文件大小超过 {settings.max_file_size_mb}MB 限制")

    file_id = str(uuid.uuid4())
    save_dir = os.path.join(settings.upload_dir, user_id)
    os.makedirs(save_dir, exist_ok=True)
    file_path = os.path.join(save_dir, f"{file_id}.pdf")
    with open(file_path, "wb") as f:
        f.write(content)

    paper = Paper(
        user_id=user_id,
        filename=file.filename or "upload.pdf",
        file_path=file_path,
        status="uploaded",
        subject=subject,
        grade=grade,
        semester=semester,
        region=region or None,
        paper_type=paper_type or None,
        academic_year=academic_year or None,
    )
    db.add(paper)
    await db.commit()
    await db.refresh(paper)
    return paper


async def list_papers(
    db: AsyncSession, user_id: str, page: int = 1, page_size: int = 20,
) -> tuple[list[Paper], int]:
    """获取用户的试卷列表（分页）"""
    query = select(Paper).where(Paper.user_id == user_id)
    if page > 0:
        query = query.order_by(Paper.created_at.desc()).offset(
            (page - 1) * page_size
        ).limit(page_size)
    result = await db.execute(query)
    papers = result.scalars().all()

    count_query = select(func.count()).select_from(Paper).where(Paper.user_id == user_id)
    total = (await db.execute(count_query)).scalar() or 0
    return list(papers), total


async def get_paper(db: AsyncSession, paper_id: str, user_id: str) -> Paper:
    """获取试卷详情并校验权限"""
    result = await db.execute(
        select(Paper).where(Paper.id == paper_id, Paper.user_id == user_id)
    )
    paper = result.scalar_one_or_none()
    if not paper:
        raise HTTPException(status_code=404, detail="试卷不存在")
    return paper


async def delete_paper(db: AsyncSession, paper_id: str, user_id: str) -> None:
    """删除试卷：已入库题目保留（paper_id置NULL），未入库题目删除"""
    paper = await get_paper(db, paper_id, user_id)

    # 1. 处理关联的 questions
    q = select(Question).where(Question.paper_id == paper_id)
    result = await db.execute(q)
    for question in result.scalars().all():
        if question.in_bank:
            # 已入库题目：脱离试卷，保留数据
            question.paper_id = None
        else:
            # 未入库题目：直接删除
            await db.delete(question)

    # 2. 删除 PDF 文件
    if os.path.exists(paper.file_path):
        os.remove(paper.file_path)

    # 3. 删除 paper_dir 目录（包含文档+图片，新路径整合后统一管理）
    paper_dir = os.path.join("data", "papers", paper_id)
    if os.path.isdir(paper_dir):
        shutil.rmtree(paper_dir)
    # 4. 兼容旧数据：删除旧 data/images/{id}/ 目录（如还存在）
    legacy_img_dir = os.path.join("data", "images", paper_id)
    if os.path.isdir(legacy_img_dir):
        shutil.rmtree(legacy_img_dir)

    # 5. 删除 paper 记录
    await db.delete(paper)
    await db.commit()
