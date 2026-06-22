"""
系统状态 API — LaTeX 环境检测等

功能：检测系统环境（LaTeX可用性等）
输入参数：无
返回值：环境状态信息
使用场景：前端检测系统功能可用性
"""
from fastapi import APIRouter

from app.services.tikz_render_service import tikz_renderer

router = APIRouter(prefix="/api/system", tags=["系统"])


@router.get("/latex-status")
async def latex_status():
    """检测 LaTeX (xelatex) 是否可用"""
    available = tikz_renderer.latex_available
    version = tikz_renderer.get_latex_version() if available else None
    return {"available": available, "version": version}
