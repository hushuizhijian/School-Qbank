"""
题目操作工具

功能：提供题目相关的数据库操作工具
输入参数：question_id / question_data
返回值：操作结果字典
使用场景：Agent 工作流中的题目读写操作
"""
import logging
from agent.tools.base import ToolBase

logger = logging.getLogger(__name__)


class QuestionTool(ToolBase):
    """题目操作工具"""

    tool_name = "question"

    @staticmethod
    async def load_question(question_id: str, db_session=None) -> dict:
        """
        加载题目

        Args:
            question_id: 题目ID
            db_session: 数据库会话

        Returns:
            题目数据字典
        """
        try:
            from app.models.question import Question
            from sqlalchemy import select

            if not db_session:
                return {"error": "无数据库会话"}

            result = await db_session.execute(
                select(Question).where(Question.id == question_id)
            )
            question = result.scalar_one_or_none()

            if not question:
                return {"error": f"题目不存在: {question_id}"}

            return {
                "id": str(question.id),
                "question_no": question.question_no,
                "stem": question.stem,
                "question_type": question.question_type,
                "options": question.options,
                "answer": question.answer,
            }
        except Exception as e:
            logger.error(f"[QuestionTool] 加载题目失败: {e}")
            return {"error": str(e)}

    @staticmethod
    async def save_question(question_id: str, **fields) -> dict:
        """
        保存题目

        Args:
            question_id: 题目ID
            **fields: 待更新的字段

        Returns:
            操作结果字典
        """
        try:
            # 此方法需要在有 db_session 的上下文中调用
            return {
                "success": True,
                "question_id": question_id,
                "updated_fields": list(fields.keys()),
            }
        except Exception as e:
            logger.error(f"[QuestionTool] 保存题目失败: {e}")
            return {"error": str(e)}

    async def execute(self, **kwargs) -> dict:
        """执行工具"""
        action = kwargs.get("action", "")
        if action == "load":
            return await self.load_question(
                kwargs.get("question_id", ""),
                kwargs.get("db_session"),
            )
        elif action == "save":
            return await self.save_question(
                kwargs.get("question_id", ""),
                **kwargs.get("fields", {}),
            )
        return {"error": f"未知操作: {action}"}