"""
知识点匹配阶段

功能：自动匹配题目与知识点，无匹配时自动创建分支
输入参数：context（含 questions, paper_id, db_session）
返回值：context（更新后的 questions 含知识点）
使用场景：管道最后阶段，自动匹配知识点
"""
import logging
from pipeline.base import StageBase

logger = logging.getLogger(__name__)


class KnowledgeStage(StageBase):
    """知识点匹配阶段"""

    stage_name = "knowledge"

    async def process(self, context: dict) -> dict:
        questions = context.get("questions", [])  # 题目列表
        paper_id = context.get("paper_id")  # 试卷ID
        db_session = context.get("db_session")  # 数据库会话

        if not questions:
            return context

        # 获取试卷信息
        from app.models.paper import Paper
        from sqlalchemy import select

        result = await db_session.execute(
            select(Paper).where(Paper.id == paper_id)
        )
        paper = result.scalar_one_or_none()
        subject = paper.subject if paper else "数学"  # 默认学科

        # 获取 LLM 适配器
        provider = await self._get_provider(context)
        if not provider:
            logger.warning("[Knowledge] 无可用 AI 服务商，跳过知识点匹配")
            return context

        # 获取知识点树
        kp_name_map = await self._get_knowledge_map(db_session, subject)

        # 逐题匹配知识点
        for q in questions:
            stem = q.get("stem", "")
            if not stem:
                continue

            try:
                # 调用 LLM 匹配知识点
                matched_names = await provider.match_knowledge_points(
                    stem, subject, list(kp_name_map.keys())
                )
                if not matched_names:
                    continue

                matched_ids = []
                for name in matched_names:
                    name = name.strip()
                    if not name:
                        continue
                    if name in kp_name_map:
                        matched_ids.append(kp_name_map[name])
                    else:
                        # 自动创建缺失的知识点
                        new_kp = await self._find_or_create_kp(
                            db_session, subject, name
                        )
                        if new_kp:
                            kp_name_map[name] = new_kp.id
                            matched_ids.append(new_kp.id)

                if matched_ids:
                    q["knowledge_point_ids"] = matched_ids  # 绑定知识点
                    logger.info(f"[Knowledge] 题目 {q.get('question_no')} 匹配到 {len(matched_ids)} 个知识点")

            except Exception as e:
                logger.error(f"[Knowledge] 题目 {q.get('question_no')} 知识点匹配失败: {e}")
                continue

        context["questions"] = questions  # 更新题目列表
        logger.info(f"[Knowledge] 匹配完成，共处理 {len(questions)} 道题")
        return context

    async def _get_provider(self, context: dict):
        """获取 LLM 适配器 — 三级优先级解析

        解析顺序：
          1) 系统默认 chat 模型（system_settings.llm_id）
          2) 兜底：get_first_available_provider / 环境变量
        输入参数：context（管道上下文，含 db_session）
        返回值：BaseLLMProvider 实例或 None
        """
        try:
            from llm.factory import get_provider_by_model_type, get_first_available_provider
            db_session = context.get("db_session")
            # 优先级 1：系统默认 chat 模型
            try:
                provider = await get_provider_by_model_type(db_session, "chat")
                if provider is not None:
                    return provider
            except Exception:
                pass
            # 优先级 2：兜底
            return await get_first_available_provider(db_session)
        except Exception as e:
            logger.error(f"[Knowledge] 获取 LLM 适配器失败: {e}")
            return None

    async def _get_knowledge_map(self, db_session, subject: str) -> dict[str, str]:
        """
        获取知识点名称 → ID 映射

        Args:
            db_session: 数据库会话
            subject: 学科

        Returns:
            名称 → ID 映射字典
        """
        try:
            from app.services.knowledge_service import get_tree
            kp_tree = await get_tree(db_session, subject)
            return self._flatten_tree(kp_tree)
        except Exception as e:
            logger.error(f"[Knowledge] 获取知识点树失败: {e}")
            return {}

    def _flatten_tree(self, tree: list[dict]) -> dict[str, str]:
        """
        将知识点树扁平化为 name → id 映射

        Args:
            tree: 知识点树

        Returns:
            名称 → ID 映射字典
        """
        result = {}
        for node in tree:
            name = node.get("name", "")
            node_id = node.get("id", "")
            if name and node_id:
                result[name] = node_id
            children = node.get("children", [])
            if children:
                result.update(self._flatten_tree(children))
        return result

    async def _find_or_create_kp(self, db_session, subject: str, name: str):
        """
        查找或创建知识点

        Args:
            db_session: 数据库会话
            subject: 学科
            name: 知识点名称

        Returns:
            知识点对象
        """
        try:
            from app.services.knowledge_service import find_or_create
            return await find_or_create(db_session, subject, name)
        except Exception as e:
            logger.error(f"[Knowledge] 创建知识点失败: {e}")
            return None