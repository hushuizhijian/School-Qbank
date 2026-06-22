"""
入库质量检查服务 — V2新增

功能：检查整卷题目质量，返回四类问题列表
输入参数：db会话 / paper_id
返回值：质量检查结果（空题干/缺失答案/缺失知识点/缺失题型）
使用场景：题目入库前的质量检查
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.paper import Paper
from app.models.question import Question


class QualityCheckService:
    """入库质量检查服务"""

    async def check_paper(self, paper_id: str, db: AsyncSession) -> dict:
        """检查整卷题目质量，返回四类问题列表

        Args:
            paper_id: 试卷ID
            db: 数据库会话

        Returns:
            四类问题的题目ID列表
        """
        # 查询该试卷下所有题目
        result = await db.execute(
            select(Question).where(Question.paper_id == paper_id)
        )
        questions = result.scalars().all()

        empty_stem = []       # 题干为空的题目ID
        missing_answer = []   # 答案缺失的题目ID
        missing_kp = []       # 知识点缺失的题目ID
        missing_type = []     # 题型未设置的题目ID

        for q in questions:
            qid = str(q.id)

            # 检查题干是否为空
            if not q.stem or q.stem.strip() == "":
                empty_stem.append(qid)

            # 检查答案是否缺失
            if not q.answer or (isinstance(q.answer, str) and q.answer.strip() == ""):
                missing_answer.append(qid)

            # 检查知识点是否缺失
            if not q.knowledge_points or len(q.knowledge_points) == 0:
                missing_kp.append(qid)

            # 检查题型是否未设置
            if not q.question_type or q.question_type in ("", "general"):
                missing_type.append(qid)

        total = len(questions)
        has_issues = len(empty_stem) + len(missing_answer) + len(missing_kp) + len(missing_type)

        return {
            "total": total,
            "has_issues": has_issues > 0,
            "empty_stem": empty_stem,
            "missing_answer": missing_answer,
            "missing_kp": missing_kp,
            "missing_type": missing_type,
            "summary": {
                "empty_stem_count": len(empty_stem),
                "missing_answer_count": len(missing_answer),
                "missing_kp_count": len(missing_kp),
                "missing_type_count": len(missing_type),
            },
        }
