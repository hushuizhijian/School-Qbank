"""
迁移脚本：批量更新数据库中题目 images 字段的图片路径（V3 路径方案）

V3 路径转换：
  旧：/data/images/{paper_id}/xxx.jpg
  新：/data/papers/{paper_id}/images/xxx.jpg

功能：
  题目 images 字段中存储的图片 URL 还是旧路径，文件实际位置已迁移到
  data/papers/{paper_id}/images/ 目录。本脚本扫描 questions 表，对每道题
  按其 paper_id 转换路径。

使用场景：
  执行完 migrate_images_to_papers.py 后，立即运行本脚本以同步数据库路径

运行方式（在 backend 目录下）：
  python scripts/migrate_image_paths_in_db.py
"""
import os
import sys
import asyncio

# 把 backend/ 加入 sys.path
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import select
from app.database import async_session, init_db
from app.models.question import Question


def rewrite_image_path(image_value, old_prefix: str, new_prefix: str):
    """
    重写单张图片的 path 字段（返回新对象，不修改原值）

    输入参数：
      image_value: 字符串或字典
      old_prefix: 旧前缀，如 /data/images/{paper_id}/
      new_prefix: 新前缀，如 /data/papers/{paper_id}/images/
    返回值：
      改写后的 image_value（未匹配返回原值）
    """
    if isinstance(image_value, str):
        if image_value.startswith(old_prefix):
            return new_prefix + image_value[len(old_prefix):]
        return image_value
    if isinstance(image_value, dict):
        # 复制字典避免原地修改（保证新旧比较能识别差异）
        new_value = dict(image_value)
        changed = False
        for k in ("path", "url"):
            v = new_value.get(k)
            if isinstance(v, str) and v.startswith(old_prefix):
                new_value[k] = new_prefix + v[len(old_prefix):]
                changed = True
        return new_value if changed else image_value
    return image_value


async def migrate_all_questions():
    """扫描并更新所有题目的 images 字段路径"""
    await init_db()
    total = 0
    updated = 0

    async with async_session() as db:
        result = await db.execute(
            select(Question).where(Question.images.is_not(None))  # noqa: E711
        )
        questions = result.scalars().all()

        for q in questions:
            if not q.images:
                continue
            total += 1

            # 按题目自身的 paper_id 拼接前后缀
            paper_id = str(q.paper_id) if q.paper_id else ""
            if not paper_id:
                continue
            old_prefix = f"/data/images/{paper_id}/"
            new_prefix = f"/data/papers/{paper_id}/images/"

            new_images = [rewrite_image_path(img, old_prefix, new_prefix) for img in q.images]
            # 检查是否有变化
            if new_images != list(q.images):
                q.images = new_images
                updated += 1
                if updated <= 3:
                    print(f"  [示例] paper_id={paper_id}, question_no={q.question_no}")
                    print(f"         images[0] = {new_images[0]}")

        await db.commit()

    print("=" * 60)
    print(f"扫描题目: {total} 道, 更新路径: {updated} 道")
    print("V3 路径: /data/images/{id}/xxx → /data/papers/{id}/images/xxx")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(migrate_all_questions())
