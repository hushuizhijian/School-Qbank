"""
数据统计 API — V2新增

功能：总览统计/趋势数据/分布数据
输入参数：无（基于当前用户数据）
返回值：统计数据字典
使用场景：仪表盘数据展示
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.stat_service import StatService

router = APIRouter(prefix="/api/stats", tags=["数据统计"])


@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    """总览统计数据"""
    service = StatService(db)
    return await service.get_overview()


@router.get("/trend")
async def get_trend(
    months: int = Query(6, ge=1, le=24, description="查询最近几个月"),
    db: AsyncSession = Depends(get_db),
):
    """趋势数据 — 支持months参数"""
    service = StatService(db)
    return await service.get_trend(months)


@router.get("/distribution")
async def get_distribution(db: AsyncSession = Depends(get_db)):
    """分布数据"""
    service = StatService(db)
    return await service.get_distribution()
