"""
PDF 导出异步任务

功能：在后台异步执行PDF导出
输入参数：homework_id / db_url
返回值：无
使用场景：大型作业的后台PDF导出
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.services.pdf_export_service import export_homework_pdf


async def run_export_task(homework_id: str, db_url: str):
    """异步 PDF 导出任务

    Args:
        homework_id: 作业ID
        db_url: 数据库连接URL
    """
    engine = create_async_engine(db_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with async_session() as db:
            # 获取作业所属用户
            from sqlalchemy import select
            from app.models.homework import Homework
            result = await db.execute(
                select(Homework).where(Homework.id == homework_id)
            )
            hw = result.scalar_one_or_none()
            if not hw:
                print(f"[ExportTask] 作业不存在: {homework_id}")
                return

            buf = await export_homework_pdf(db, homework_id, str(hw.user_id))

            # 保存到文件
            import os
            export_dir = os.path.join("data", "exports")
            os.makedirs(export_dir, exist_ok=True)
            file_path = os.path.join(export_dir, f"homework_{homework_id[:8]}.pdf")
            with open(file_path, "wb") as f:
                f.write(buf.getvalue())

            # 更新导出记录的文件路径
            from app.models.export_record import ExportRecord
            from sqlalchemy import update as sa_update
            await db.execute(
                sa_update(ExportRecord)
                .where(ExportRecord.homework_id == homework_id)
                .values(file_path=file_path)
            )
            await db.commit()

            print(f"[ExportTask] 导出完成: {file_path}")

    except Exception as e:
        print(f"[ExportTask] 导出任务失败 homework_id={homework_id}: {e}")
    finally:
        await engine.dispose()
