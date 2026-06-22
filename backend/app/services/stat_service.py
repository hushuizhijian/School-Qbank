"""
数据统计服务 — V2增强版

功能：试卷校对统计/总览统计/趋势数据/分布数据
输入参数：db会话 / paper_id / user_id
返回值：统计数据字典
使用场景：仪表盘数据展示
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.paper import Paper
from app.models.question import Question


async def get_paper_stats(db: AsyncSession, paper_id: str, user_id: str) -> dict:
    """获取试卷的校对统计数据 — 包含7类统计+按题型分组+质量检查"""
    result = await db.execute(select(Paper).where(Paper.id == paper_id, Paper.user_id == user_id))
    paper = result.scalar_one_or_none()
    if not paper:
        return {}

    # 1. 总题目数
    total_q = select(func.count()).select_from(Question).where(Question.paper_id == paper_id)
    total = (await db.execute(total_q)).scalar() or 0

    # 2. 待校对数
    pending_q = select(func.count()).select_from(Question).where(
        Question.paper_id == paper_id, Question.question_status == "pending"
    )
    pending = (await db.execute(pending_q)).scalar() or 0

    # 3. 已正常数
    normal_q = select(func.count()).select_from(Question).where(
        Question.paper_id == paper_id, Question.question_status == "normal"
    )
    normal = (await db.execute(normal_q)).scalar() or 0

    # 4. 错误数
    error_q = select(func.count()).select_from(Question).where(
        Question.paper_id == paper_id, Question.question_status == "error"
    )
    error_count = (await db.execute(error_q)).scalar() or 0

    # 5. 知识点缺失数
    missing_kp_q = select(func.count()).select_from(Question).where(
        Question.paper_id == paper_id,
        Question.knowledge_points == [],
    )
    missing_kp = (await db.execute(missing_kp_q)).scalar() or 0

    # 6. 已入库数
    in_bank_q = select(func.count()).select_from(Question).where(
        Question.paper_id == paper_id, Question.in_bank == True
    )
    in_bank = (await db.execute(in_bank_q)).scalar() or 0

    # 7. 未入库数
    not_in_bank = total - in_bank

    # 按题型分组统计
    type_stats_q = select(
        Question.question_type,
        func.count(Question.id)
    ).where(Question.paper_id == paper_id).group_by(Question.question_type)
    type_result = await db.execute(type_stats_q)
    type_stats = {row[0]: row[1] for row in type_result.all()}

    # 质量检查：题干为空/答案缺失/题型未设置
    empty_stem_q = select(func.count()).select_from(Question).where(
        Question.paper_id == paper_id,
        (Question.stem == "") | (Question.stem == None),
    )
    empty_stem = (await db.execute(empty_stem_q)).scalar() or 0

    missing_answer_q = select(func.count()).select_from(Question).where(
        Question.paper_id == paper_id,
        (Question.answer == "") | (Question.answer == None),
    )
    missing_answer = (await db.execute(missing_answer_q)).scalar() or 0

    missing_type_q = select(func.count()).select_from(Question).where(
        Question.paper_id == paper_id,
        (Question.question_type == "") | (Question.question_type == None),
    )
    missing_type = (await db.execute(missing_type_q)).scalar() or 0

    return {
        "total": total,
        "pending": pending,
        "normal": normal,
        "error": error_count,
        "missing_knowledge": missing_kp,
        "in_bank": in_bank,
        "not_in_bank": not_in_bank,
        "type_stats": type_stats,
        "quality_check": {
            "empty_stem": empty_stem,
            "missing_answer": missing_answer,
            "missing_kp": missing_kp,
            "missing_type": missing_type,
        },
    }


class StatService:
    """统计服务类 — 用于 API 路由调用"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_overview(self) -> dict:
        """获取总览统计数据 — 匹配前端 StatsDashboardPage 期望的字段"""
        from datetime import datetime, timedelta
        from sqlalchemy import cast, Date

        # 题库中题目总数（只有已入库的才算题库中的题目）
        total_questions = (await self.db.execute(
            select(func.count(Question.id)).where(Question.in_bank == True)
        )).scalar() or 0

        # 已入库题目数（与 total_questions 一致，保留字段兼容前端）
        in_bank_count = total_questions

        # 本月新增入库题目数（只有入库的才算新增，以 bank_added_at 为准）
        now = datetime.now()
        month_start = datetime(now.year, now.month, 1)
        this_month_new = (await self.db.execute(
            select(func.count(Question.id)).where(
                Question.in_bank == True,
                Question.bank_added_at >= month_start
            )
        )).scalar() or 0

        # 异常题数（已入库且状态为error的题目）
        error_count = (await self.db.execute(
            select(func.count(Question.id)).where(
                Question.in_bank == True,
                Question.question_status == "error"
            )
        )).scalar() or 0

        # 入库率 = 已入库数 / 所有题目数（含未入库）
        all_questions_count = (await self.db.execute(
            select(func.count(Question.id))
        )).scalar() or 0
        bank_rate = in_bank_count / all_questions_count if all_questions_count > 0 else 0.0

        # 按年级分布（通过试卷关联获取年级）
        grade_q = select(
            Paper.grade,
            func.count(Question.id)
        ).join(
            Paper, Question.paper_id == Paper.id, isouter=True
        ).group_by(Paper.grade)
        grade_result = await self.db.execute(grade_q)
        by_grade = {row[0] or "未分类": row[1] for row in grade_result.all()}

        # 按题型分布
        type_q = select(
            Question.question_type,
            func.count(Question.id)
        ).group_by(Question.question_type)
        type_result = await self.db.execute(type_q)
        by_type = {row[0] or "未分类": row[1] for row in type_result.all()}

        return {
            "total_questions": total_questions,
            "in_bank_count": in_bank_count,
            "this_month_new": this_month_new,
            "error_count": error_count,
            "bank_rate": bank_rate,
            "by_grade": by_grade,
            "by_type": by_type,
        }

    async def get_trend(self, months: int = 6) -> dict:
        """获取趋势数据 — 按月统计新增数和累计数，匹配前端 TrendItem 格式"""
        from datetime import datetime, timedelta
        from sqlalchemy import cast, Date, extract, func as sa_func

        now = datetime.now()
        items = []

        # 计算最近 N 个月的月度数据
        for i in range(months - 1, -1, -1):
            # 计算月份范围
            target = now - timedelta(days=i * 30)
            year = target.year
            month = target.month
            month_start = datetime(year, month, 1)
            # 下个月1号（或当月最后一天之后）
            if month == 12:
                month_end = datetime(year + 1, 1, 1)
            else:
                month_end = datetime(year, month + 1, 1)

            # 该月新增数
            new_count = (await self.db.execute(
                select(func.count(Question.id)).where(
                    Question.created_at >= month_start,
                    Question.created_at < month_end,
                )
            )).scalar() or 0

            # 截至该月底的累计数
            total_count = (await self.db.execute(
                select(func.count(Question.id)).where(
                    Question.created_at < month_end,
                )
            )).scalar() or 0

            items.append({
                "month": f"{year}-{month:02d}",
                "new_count": new_count,
                "total_count": total_count,
            })

        return {"items": items}

    async def get_distribution(self) -> dict:
        """获取分布数据 — 按年级/题型/难度统计，返回列表格式匹配前端 DistItem"""
        # 按年级分布（通过试卷关联获取年级）
        grade_q = select(
            Paper.grade,
            func.count(Question.id)
        ).join(
            Paper, Question.paper_id == Paper.id, isouter=True
        ).group_by(Paper.grade)
        grade_result = await self.db.execute(grade_q)
        by_grade = [{"grade": row[0] or "未分类", "count": row[1]} for row in grade_result.all()]

        # 按题型分布
        type_q = select(
            Question.question_type,
            func.count(Question.id)
        ).group_by(Question.question_type)
        type_result = await self.db.execute(type_q)
        by_type = [{"type": row[0] or "未分类", "count": row[1]} for row in type_result.all()]

        # 按难度分布
        diff_q = select(
            Question.difficulty,
            func.count(Question.id)
        ).group_by(Question.difficulty)
        diff_result = await self.db.execute(diff_q)
        by_difficulty = [{"difficulty": row[0] or "未分类", "count": row[1]} for row in diff_result.all()]

        return {
            "by_grade": by_grade,
            "by_type": by_type,
            "by_difficulty": by_difficulty,
        }
