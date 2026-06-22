"""
知识点工具

功能：提供知识点相关的数据库操作工具
输入参数：knowledge_id / knowledge_data
返回值：操作结果字典
使用场景：Agent 工作流中的知识点读写操作
"""
import logging
from agent.tools.base import ToolBase

logger = logging.getLogger(__name__)


class KnowledgeTool(ToolBase):
    """知识点操作工具"""

    tool_name = "knowledge"

    @staticmethod
    async def load_knowledge(knowledge_id: str, db_session=None) -> dict:
        """
        加载知识点

        Args:
            knowledge_id: 知识点ID
            db_session: 数据库会话

        Returns:
            知识点数据字典
        """
        try:
            from app.models.knowledge_point import KnowledgePoint
            from sqlalchemy import select

            if not db_session:
                return {"error": "无数据库会话"}

            result = await db_session.execute(
                select(KnowledgePoint).where(KnowledgePoint.id == knowledge_id)
            )
            kp = result.scalar_one_or_none()

            if not kp:
                return {"error": f"知识点不存在: {knowledge_id}"}

            return {
                "id": str(kp.id),
                "name": kp.name,
                "subject": kp.subject,
                "parent_id": str(kp.parent_id) if kp.parent_id else None,
            }
        except Exception as e:
            logger.error(f"[KnowledgeTool] 加载知识点失败: {e}")
            return {"error": str(e)}

    @staticmethod
    async def save_knowledge(**fields) -> dict:
        """
        保存知识点

        Args:
            **fields: 知识点字段

        Returns:
            操作结果字典
        """
        try:
            return {
                "success": True,
                "name": fields.get("name", ""),
                "subject": fields.get("subject", ""),
            }
        except Exception as e:
            logger.error(f"[KnowledgeTool] 保存知识点失败: {e}")
            return {"error": str(e)}

    async def execute(self, **kwargs) -> dict:
        """执行工具"""
        action = kwargs.get("action", "")
        if action == "load":
            return await self.load_knowledge(
                kwargs.get("knowledge_id", ""),
                kwargs.get("db_session"),
            )
        elif action == "save":
            return await self.save_knowledge(**kwargs.get("fields", {}))
        return {"error": f"未知操作: {action}"}