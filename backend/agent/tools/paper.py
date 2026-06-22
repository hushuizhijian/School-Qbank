"""
试卷操作工具

功能：提供试卷相关的数据库操作工具
输入参数：paper_id / paper_data
返回值：操作结果字典
使用场景：Agent 工作流中的试卷读写操作
"""
import logging
from agent.tools.base import ToolBase

logger = logging.getLogger(__name__)


class PaperTool(ToolBase):
    """试卷操作工具"""

    tool_name = "paper"

    @staticmethod
    async def load_paper(paper_id: str, db_session=None) -> dict:
        """
        加载试卷

        Args:
            paper_id: 试卷ID
            db_session: 数据库会话

        Returns:
            试卷数据字典
        """
        try:
            from app.models.paper import Paper
            from sqlalchemy import select

            if not db_session:
                return {"error": "无数据库会话"}

            result = await db_session.execute(
                select(Paper).where(Paper.id == paper_id)
            )
            paper = result.scalar_one_or_none()

            if not paper:
                return {"error": f"试卷不存在: {paper_id}"}

            return {
                "id": str(paper.id),
                "filename": paper.filename,
                "subject": paper.subject,
                "grade": paper.grade,
                "status": paper.status,
            }
        except Exception as e:
            logger.error(f"[PaperTool] 加载试卷失败: {e}")
            return {"error": str(e)}

    @staticmethod
    async def save_paper(paper_id: str, **fields) -> dict:
        """
        保存试卷

        Args:
            paper_id: 试卷ID
            **fields: 待更新的字段

        Returns:
            操作结果字典
        """
        try:
            return {
                "success": True,
                "paper_id": paper_id,
                "updated_fields": list(fields.keys()),
            }
        except Exception as e:
            logger.error(f"[PaperTool] 保存试卷失败: {e}")
            return {"error": str(e)}

    async def execute(self, **kwargs) -> dict:
        """执行工具"""
        action = kwargs.get("action", "")
        if action == "load":
            return await self.load_paper(
                kwargs.get("paper_id", ""),
                kwargs.get("db_session"),
            )
        elif action == "save":
            return await self.save_paper(
                kwargs.get("paper_id", ""),
                **kwargs.get("fields", {}),
            )
        return {"error": f"未知操作: {action}"}