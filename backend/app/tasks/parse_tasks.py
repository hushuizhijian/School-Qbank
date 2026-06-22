"""
PDF 解析异步任务

功能：在后台异步执行试卷解析
输入参数：paper_id / db_url / config
返回值：无
使用场景：试卷上传后的后台解析
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.services.parse_service import ParseService


async def run_parse_task(paper_id: str, db_url: str, config: dict = None):
    """异步解析任务

    Args:
        paper_id: 试卷ID
        db_url: 数据库连接URL
        config: 解析配置（引擎类型/插件开关/页码范围）
    """
    engine = create_async_engine(db_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with async_session() as db:
            parse_svc = ParseService()
            await parse_svc.parse_paper(paper_id, db, config)
    except Exception as e:
        print(f"[ParseTask] 解析任务失败 paper_id={paper_id}: {e}")
    finally:
        await engine.dispose()
