"""
应用配置模块

功能：从环境变量和 .env 文件加载应用配置
输入参数：.env 文件或环境变量
返回值：Settings 单例对象
使用场景：全局配置读取，所有模块通过 from app.config import settings 获取配置
"""
from typing import List
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """应用配置类，支持 .env 文件和环境变量"""

    # 基础配置
    app_name: str = "小学数学智能题库系统V2"  # 应用名称
    debug: bool = True  # 调试模式

    # 数据库配置
    database_url: str = "sqlite+aiosqlite:///./data/schoolwork.db"  # 数据库连接地址
    redis_url: str = "redis://localhost:6379/0"  # Redis连接地址

    # 安全配置
    secret_key: str = "dev-secret-key-change-in-production"  # JWT密钥
    jwt_algorithm: str = "HS256"  # JWT算法
    jwt_expire_minutes: int = 120  # JWT过期时间（分钟）

    # 文件上传配置
    upload_dir: str = "./data/uploads"  # 上传目录
    max_file_size_mb: int = 50  # 最大文件大小（MB）

    # DeepSeek API 配置（用于自动优化阶段）
    deepseek_api_key: str = "sk-placeholder"  # DeepSeek API密钥
    deepseek_base_url: str = "https://api.deepseek.com"  # DeepSeek API地址

    # ============================================================
    # MinerU 云端解析配置（替代原 VLM + OCR）
    # ============================================================
    mineru_token: str = ""  # MinerU API Token（优先级：环境变量 > config > token.txt）
    mineru_timeout: int = 300  # MinerU 解析超时（秒）
    mineru_default_model: str = "vlm"  # MinerU 解析模型

    # CORS 跨域配置
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:5174"]  # 允许的前端来源

    class Config:
        env_file = ".env"  # 环境变量文件路径
        env_file_encoding = "utf-8"  # 文件编码


# 全局配置单例
settings = Settings()