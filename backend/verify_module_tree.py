"""验证模块化知识树结构"""
import asyncio
from app.database import async_session
from app.models.knowledge_point import KnowledgePoint
from sqlalchemy import select, func


async def main():
    async with async_session() as db:
        # 1. 学科总数
        cnt = await db.execute(select(func.count()).select_from(KnowledgePoint).where(KnowledgePoint.subject == "数学"))
        print("数学节点总数:", cnt.scalar())

        # 2. 顶层模块
        roots = await db.execute(
            select(KnowledgePoint).where(KnowledgePoint.subject == "数学", KnowledgePoint.parent_id.is_(None)).order_by(KnowledgePoint.sort_order)
        )
        root_nodes = roots.scalars().all()
        print(f"\n顶层模块（{len(root_nodes)} 个）:")
        for r in root_nodes:
            # 子主题
            children = await db.execute(select(KnowledgePoint).where(KnowledgePoint.parent_id == r.id).order_by(KnowledgePoint.sort_order))
            subs = children.scalars().all()
            # 知识点数（子主题的子节点）
            total_leaves = 0
            for s in subs:
                leaves = await db.execute(select(func.count()).select_from(KnowledgePoint).where(KnowledgePoint.parent_id == s.id))
                total_leaves += leaves.scalar() or 0
            print(f"  {r.name}: {len(subs)} 个子主题, {total_leaves} 个知识点")
            for s in subs:
                leaves = await db.execute(select(func.count()).select_from(KnowledgePoint).where(KnowledgePoint.parent_id == s.id))
                print(f"    - {s.name} ({leaves.scalar() or 0})")


asyncio.run(main())
