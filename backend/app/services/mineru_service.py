"""
MinerU 云端解析服务 — 基于官方 SDK (mineru-open-sdk)

功能：PDF上传至MinerU云端 → 精准解析(v4) → 下载ZIP → 
      解析出 markdown / latex / content_list / images
输入参数：PDF文件路径 / Token
返回值：MinerUParseResult (结构化解析产物)
使用场景：parse_service 中唯一解析引擎
"""
import os
import base64
import asyncio
import logging

from dataclasses import dataclass, field
from mineru import MinerU
from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class MinerUParseResult:
    """MinerU 云端解析返回的结构化结果"""
    task_id: str
    markdown: str | None = None
    latex: str | None = None
    html: str | None = None          # HTML格式（新增）
    docx: bytes | None = None        # Word格式（新增）
    content_list: list[dict] | None = None
    images: list[dict] = field(default_factory=list)
    error: str | None = None


class MinerUService:
    """MinerU 云端解析服务 — 唯一引擎"""

    def __init__(self):
        self._token: str | None = None

    def load_token(self) -> str:
        """按优先级读取 Token：环境变量 > config > token.txt"""
        token = os.environ.get("MINERU_TOKEN", "")
        if token:
            return token
        token = settings.mineru_token
        if token:
            return token
        # 尝试从 token.txt 读取
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))  # backend/
        token_paths = [
            os.path.join(base_dir, "token.txt"),
            os.path.join(base_dir, "..", "token.txt"),
            os.path.join(base_dir, "..", "tools5", "token.txt"),
            os.path.join(base_dir, "..", "MinerU-Ecosystem-main", "token.txt"),
        ]
        for tp in token_paths:
            tp = os.path.abspath(tp)
            if os.path.exists(tp):
                with open(tp, "r") as f:
                    token = f.read().strip()
                if token:
                    return token
        return ""

    @property
    def available(self) -> bool:
        return bool(self.load_token())

    def get_token(self) -> str:
        token = self._token or self.load_token()
        if not token:
            raise RuntimeError("MinerU Token 未配置，请在环境变量 MINERU_TOKEN、config.py 或 token.txt 中配置")
        return token

    async def parse_pdf(self, pdf_path: str, **kwargs) -> MinerUParseResult:
        """
        主入口：上传 PDF → MinerU 云端精准解析 → 下载结果

        Args:
            pdf_path: 本地 PDF 文件路径
            **kwargs: model, formula, table, language, extra_formats, timeout

        Returns:
            MinerUParseResult 结构化结果
        """
        token = self.get_token()
        logger.info(f"[MinerU] 开始云端解析: {os.path.basename(pdf_path)}")

        client = MinerU(token=token)

        # 默认获取全部五种格式产物
        default_formats = ["latex", "html", "docx"]
        extra_formats = kwargs.get("extra_formats", default_formats)

        try:
            result = await asyncio.to_thread(
                client.extract,
                pdf_path,
                model=kwargs.get("model", "vlm"),
                formula=True,
                table=True,
                language=kwargs.get("language", "ch"),
                extra_formats=extra_formats,
                timeout=kwargs.get("timeout", 300),
            )
        except Exception as e:
            logger.error(f"[MinerU] 云端解析异常: {e}")
            return MinerUParseResult(task_id="", error=str(e))

        logger.info(f"[MinerU] 解析完成: task_id={result.task_id}, state={result.state}")

        if result.state != "done":
            err_msg = result.error or f"解析失败 (state={result.state}, err_code={result.err_code})"
            return MinerUParseResult(task_id=result.task_id, error=err_msg)

        # 提取图片数据
        images = []
        if result.images:
            for img in result.images:
                images.append({
                    "name": img.name,
                    "data_base64": base64.b64encode(img.data).decode(),
                    "path": img.path,
                    "data": img.data,
                })

        return MinerUParseResult(
            task_id=result.task_id,
            markdown=result.markdown,
            latex=result.latex,
            html=result.html,               # HTML格式
            docx=result.docx,               # Word格式（bytes）
            content_list=result.content_list,
            images=images,
        )


# 全局单例
mineru_service = MinerUService()