"""
FastAPI 应用入口（V2增强版）

功能：创建FastAPI应用实例，注册路由、中间件、静态文件挂载
输入参数：无
返回值：app（FastAPI实例）
使用场景：应用启动入口，uvicorn 运行此模块
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import init_db

# 导入所有路由模块
from app.api.auth import router as auth_router  # 认证路由
from app.api.papers import router as papers_router  # 试卷路由
from app.api.questions import router as questions_router  # 题目路由
from app.api.homework import router as homework_router  # 作业路由
from app.api.knowledge import router as knowledge_router  # 知识点路由
from app.api.upload import router as upload_router  # 文件上传路由
from app.api.system import router as system_router  # 系统路由
from app.api.exports import router as exports_router  # 导出路由

# V2新增路由
from app.api.ai import router as ai_router  # AI辅助操作路由（含AI提供商管理）
from app.api.stats import router as stats_router  # 统计路由
from app.api.paper_templates import router as paper_templates_router  # 试卷范例路由（阶段5）


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理

    功能：应用启动时初始化数据库，关闭时清理资源
    输入参数：app（FastAPI实例）
    返回值：无（异步上下文管理器）
    使用场景：FastAPI lifespan 参数
    """
    await init_db()  # 初始化数据库（建表+迁移+预设数据）
    yield


# 创建 FastAPI 应用实例
app = FastAPI(
    title=settings.app_name,  # 应用标题
    version="0.2.0",  # 版本号
    lifespan=lifespan,  # 生命周期管理
)

# CORS 跨域中间件配置（从配置文件读取）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,  # 允许的前端来源
    allow_credentials=True,  # 允许携带凭证
    allow_methods=["*"],  # 允许所有HTTP方法
    allow_headers=["*"],  # 允许所有请求头
)

# 注册所有路由
app.include_router(auth_router)  # 认证
app.include_router(papers_router)  # 试卷
app.include_router(questions_router)  # 题目
app.include_router(homework_router)  # 作业
app.include_router(knowledge_router)  # 知识点
app.include_router(upload_router)  # 文件上传
app.include_router(system_router)  # 系统
app.include_router(exports_router)  # 导出
app.include_router(ai_router)  # AI辅助操作（V2新增）
app.include_router(stats_router)  # 统计（V2新增）
app.include_router(paper_templates_router)  # 试卷范例（阶段5）

# 静态文件：试卷产物（文档 + 图片统一目录 data/papers/{id}/）
os.makedirs("data/papers", exist_ok=True)  # 确保目录存在
app.mount("/data/papers", StaticFiles(directory="data/papers"), name="papers")

# 静态文件：历史图片目录（兼容旧数据 — 已迁移到 papers/{id}/）
os.makedirs("data/images", exist_ok=True)  # 确保目录存在
app.mount("/data/images", StaticFiles(directory="data/images"), name="images")

# 静态文件：上传文件（LOGO等）
os.makedirs("data/uploads", exist_ok=True)  # 确保目录存在
app.mount("/data/uploads", StaticFiles(directory="data/uploads"), name="uploads")

# 静态文件：导出文件
os.makedirs("data/exports", exist_ok=True)  # 确保目录存在
app.mount("/data/exports", StaticFiles(directory="data/exports"), name="exports")


@app.get("/api/health")
async def health_check():
    """
    健康检查接口

    功能：返回应用运行状态
    输入参数：无
    返回值：状态信息字典
    使用场景：前端/运维检测服务是否正常
    """
    return {"status": "ok", "app": settings.app_name}
