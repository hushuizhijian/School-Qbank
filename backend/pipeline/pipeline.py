"""
文档解析管道

功能：编排多个处理阶段，按顺序执行文档解析流程
输入参数：paper_id / db_session / config
返回值：解析结果
使用场景：试卷上传后的完整解析流程
"""
import logging
from pipeline.base import StageBase


class ParsePipeline:
    """文档解析管道 — 可编排的阶段式处理"""

    def __init__(self, stages: list[StageBase] = None):
        self.stages = stages or []  # 处理阶段列表
        self.context = {}  # 管道上下文
        self.error = ""  # 错误信息

    def add_stage(self, stage: StageBase):
        """添加处理阶段"""
        self.stages.append(stage)

    async def run(self, paper_id: str, db_session, config: dict = None) -> dict:
        """
        执行管道

        Args:
            paper_id: 试卷ID
            db_session: 数据库会话
            config: 管道配置（可覆盖各阶段默认配置）

        Returns:
            管道执行结果字典
        """
        # 初始化上下文
        self.context = {
            "paper_id": paper_id,
            "db_session": db_session,
            "config": config or {},
            "stages_completed": [],
        }

        for stage in self.stages:
            logging.info(f"[Pipeline] 开始阶段: {stage.stage_name}")
            try:
                self.context = await stage.process(self.context)  # 执行阶段
                self.context["stages_completed"].append(stage.stage_name)  # 记录完成
                logging.info(f"[Pipeline] 阶段完成: {stage.stage_name}")
            except Exception as e:
                self.error = f"[{stage.stage_name}] {str(e)}"
                logging.error(f"[Pipeline] 阶段失败: {self.error}")
                # 根据配置决定是否停止
                if self.context.get("config", {}).get("stop_on_error", True):
                    break

        return {
            "success": not bool(self.error),
            "error": self.error,
            "stages_completed": self.context["stages_completed"],
            "result": self.context.get("result", {}),
        }