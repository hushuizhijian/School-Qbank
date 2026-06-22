"""
AI 处理异步任务

功能：在后台异步执行AI操作（匹配知识点/标准化等）
输入参数：question_id / action / db_url / provider_key / instance_name / model_key / model_type
返回值：无
使用场景：批量AI操作的后台执行

模型解析三级优先级（与 AIService 一致）：
  1) 用户主动选择（provider_key/instance_name/model_key 非空）
  2) 系统默认模型（system_settings.llm_id/embd_id/...）
  3) 兜底：get_first_available_provider / 环境变量
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.schemas.ai import AiOperationRequest, BatchStandardizeRequest
from app.services.ai_service import AIService


async def run_ai_task(
    question_id: str,
    action: str,
    db_url: str,
    provider_key: str = "",
    instance_name: str = "",
    model_key: str = "",
    model_type: str = "chat",
):
    """异步 AI 处理任务

    输入参数：
      question_id — 题目 ID
      action — AI 操作类型（match_knowledge/fix_typos/generate_analysis/standardize_stem/auto_difficulty）
      db_url — 数据库连接 URL
      provider_key — 供应商标识（前端主动选择，最高优先级）
      instance_name — 实例名称（多实例时区分）
      model_key — 模型标识
      model_type — 模型类型（chat/embedding/image2text/...），空时按 chat 走系统默认 llm_id
    """
    engine = create_async_engine(db_url)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with async_session() as db:
            # 构造 AIService 统一走三级优先级解析
            service = AIService(
                db,
                provider_key=provider_key,
                instance_name=instance_name,
                model_key=model_key,
                model_type=model_type,
            )

            if action == "match_knowledge":
                await service.match_knowledge(question_id)
            elif action == "fix_typos":
                await service.fix_typos(question_id)
            elif action == "generate_analysis":
                await service.generate_analysis(question_id)
            elif action == "standardize_stem":
                await service.standardize_stem(question_id)
            elif action == "auto_difficulty":
                await service.auto_difficulty(question_id)
            elif action == "ai_explain":
                # 兼容历史调用：仅生成解析文本（不做存储）
                q = await service._get_question(question_id)
                await service.generate_analysis_text(q.stem, q.answer or "")
            elif action == "ai_refine":
                # 兼容历史调用：仅优化题干文本（不做存储）
                q = await service._get_question(question_id)
                await service.refine_stem_text(q.stem)
            else:
                print(f"[AITask] 不支持的AI操作: {action}")
    except Exception as e:
        print(f"[AITask] AI任务失败 question_id={question_id} action={action}: {e}")
    finally:
        await engine.dispose()
