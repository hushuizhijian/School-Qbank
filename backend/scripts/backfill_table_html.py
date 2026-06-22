"""
迁移脚本：补全历史题目的 stem 中缺失的表格 HTML

功能：
  对于已经分题入库的题目，若 has_table=True 但 stem 中不包含 <table> 标签，
  则从 data/papers/{paper_id}/content_list.json 中查找对应的 table_body 追加到 stem。

使用场景：
  在升级 mineru_splitter.py 后，对历史数据做一次性回填
  让表格能正常显示

运行方式：
  python scripts/backfill_table_html.py
"""
import os
import sys
import json
import asyncio
import re

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select
from app.database import async_session, init_db
from app.models.question import Question
from app.models.paper import Paper


def collect_tables_by_page(content_list: list) -> dict:
    """
    收集 content_list 中所有表格的 (page, table_body) 映射

    输入参数：
      content_list: MinerU 返回的 content_list 数组
    返回值：
      {(page, top): table_body} 的字典
    """
    tables = []
    for item in content_list:
        if not isinstance(item, dict):
            continue
        if item.get("type") != "table":
            continue
        page = item.get("page_idx", 0)
        bbox = item.get("bbox", [0, 0, 0, 0])
        top = bbox[1] if len(bbox) > 1 else 0
        body = (item.get("table_body") or "").strip()
        if body:
            tables.append((page, top, body))
    tables.sort(key=lambda t: (t[0], t[1]))
    return tables


def page_text_for(content_list: list, page_idx: int) -> str:
    """获取指定页的纯文本（用于在 stem 中定位 page）"""
    parts = []
    for item in content_list:
        if not isinstance(item, dict):
            continue
        if item.get("page_idx") != page_idx:
            continue
        if item.get("type") in ("text", "equation", "inline_equation"):
            parts.append((item.get("text") or "").strip())
    return "\n".join(parts)


async def backfill_one_paper(paper_id: str, db) -> dict:
    """对单个试卷的所有题目做表格回填"""
    # 读取 content_list
    cl_path = os.path.join("data", "papers", str(paper_id), "content_list.json")
    if not os.path.exists(cl_path):
        return {"paper_id": paper_id, "updated": 0, "skipped": "no content_list"}

    with open(cl_path, "r", encoding="utf-8") as f:
        content_list = json.load(f)

    tables = collect_tables_by_page(content_list)
    if not tables:
        return {"paper_id": paper_id, "updated": 0, "skipped": "no tables"}

    # 获取该试卷的所有题目
    result = await db.execute(
        select(Question).where(Question.paper_id == paper_id).order_by(Question.question_no)
    )
    questions = result.scalars().all()
    if not questions:
        return {"paper_id": paper_id, "updated": 0, "skipped": "no questions"}

    updated = 0
    for q in questions:
        if not q.has_table:
            continue
        # 检查 stem 是否已含表格
        if q.stem and "<table" in q.stem.lower():
            continue
        # V3 修复：对 stem 不含 <table 的题目，追加"该题所在页之前最近"的表格
        # 避免多题重复追加同一张表（之前的版本会全部追加）
        q_page = (q.boundary or {}).get("page", 1) if q.boundary else 1
        # 在 q_page 之前（含）的所有表格
        available = [(p, b) for (p, _t, b) in tables if p + 1 <= q_page]
        if not available:
            continue
        # 追加尚未在 stem 中出现过的全部 table_body（可能多张表属于同一题）
        for _page, body in available:
            if "<table" in (q.stem or ""):
                break
            if body in (q.stem or ""):
                continue
            q.stem = (q.stem or "") + "\n" + body
            updated += 1

    await db.commit()
    return {"paper_id": paper_id, "updated": updated}


async def main():
    print("=" * 60)
    print("表格 HTML 回填：扫描所有 has_table 题，补全 stem")
    print("=" * 60)

    await init_db()
    async with async_session() as db:
        result = await db.execute(select(Paper))
        papers = result.scalars().all()
        total_updated = 0
        for p in papers:
            stats = await backfill_one_paper(str(p.id), db)
            msg = f"试卷 {stats['paper_id'][:8]}: "
            if "skipped" in stats:
                msg += f"跳过（{stats['skipped']}）"
            else:
                msg += f"补全 {stats['updated']} 道题"
                total_updated += stats["updated"]
            print(msg)
        print()
        print(f"总计回填 {total_updated} 道题的表格 HTML")


if __name__ == "__main__":
    asyncio.run(main())
