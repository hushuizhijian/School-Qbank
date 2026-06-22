"""
AI 操作 API — V2新增

功能：AI匹配知识点/拆分小问/错别字校正/生成解析/题干标准化/难度标注/批量标准化
      以及 AI 供应商管理（ragflow 三层架构）
输入参数：AiOperationRequest / BatchStandardizeRequest
返回值：AiOperationResponse / 批量操作结果
使用场景：AI辅助题目处理 / AI供应商配置管理
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.schemas.ai import AiOperationRequest, AiOperationResponse, BatchStandardizeRequest
from app.services.ai_service import AIService

router = APIRouter(prefix="/api/ai", tags=["AI操作"])


# ============================================================
# AI 操作路由（原有功能，保持不变）
# ============================================================

@router.post("/match-knowledge", response_model=AiOperationResponse)
async def match_knowledge(request: AiOperationRequest, db: AsyncSession = Depends(get_db)):
    """AI 匹配知识点"""
    service = AIService(db, provider_key=request.provider_key, instance_name=request.instance_name, model_key=request.model_key, model_type="chat")
    return await service.match_knowledge(request.question_id)


@router.post("/split-subquestions", response_model=AiOperationResponse)
async def split_subquestions(request: AiOperationRequest, db: AsyncSession = Depends(get_db)):
    """AI 拆分小问"""
    service = AIService(db, provider_key=request.provider_key, instance_name=request.instance_name, model_key=request.model_key, model_type="chat")
    return await service.split_subquestions(request.question_id)


@router.post("/fix-typos", response_model=AiOperationResponse)
async def fix_typos(request: AiOperationRequest, db: AsyncSession = Depends(get_db)):
    """AI 错别字校正"""
    service = AIService(db, provider_key=request.provider_key, instance_name=request.instance_name, model_key=request.model_key, model_type="chat")
    return await service.fix_typos(request.question_id)


@router.post("/generate-analysis", response_model=AiOperationResponse)
async def generate_analysis(request: AiOperationRequest, db: AsyncSession = Depends(get_db)):
    """AI 生成标准解析"""
    service = AIService(db, provider_key=request.provider_key, instance_name=request.instance_name, model_key=request.model_key, model_type="chat")
    return await service.generate_analysis(request.question_id)


@router.post("/standardize-stem", response_model=AiOperationResponse)
async def standardize_stem(request: AiOperationRequest, db: AsyncSession = Depends(get_db)):
    """AI 题干标准化"""
    service = AIService(db, provider_key=request.provider_key, instance_name=request.instance_name, model_key=request.model_key, model_type="chat")
    return await service.standardize_stem(request.question_id)


@router.post("/auto-difficulty", response_model=AiOperationResponse)
async def auto_difficulty(request: AiOperationRequest, db: AsyncSession = Depends(get_db)):
    """AI 难度自动标注"""
    service = AIService(db, provider_key=request.provider_key, instance_name=request.instance_name, model_key=request.model_key, model_type="chat")
    return await service.auto_difficulty(request.question_id)


@router.post("/batch-standardize")
async def batch_standardize(request: BatchStandardizeRequest, db: AsyncSession = Depends(get_db)):
    """批量 AI 标准化"""
    service = AIService(
        db,
        provider_key=request.provider_key,
        instance_name=request.instance_name,
        model_key=request.model_key,
        model_type="chat",
    )
    return await service.batch_standardize(request)


# ============================================================
# AI 供应商管理路由（ragflow 三层架构）
# System Provider Registry → Tenant Provider → Provider Instances
# ============================================================

# 请求体模型
class AddProviderRequest(BaseModel):
    """添加供应商请求体"""
    provider_name: str


class CreateInstanceRequest(BaseModel):
    """创建实例请求体"""
    instance_name: str
    api_key: str
    base_url: str = ""


class DeleteInstancesRequest(BaseModel):
    """删除实例请求体"""
    instances: list[str]


class VerifyConnectionRequest(BaseModel):
    """验证连接请求体"""
    api_key: str
    base_url: str = ""  # MinerU 等特殊供应商不需要 base_url
    model: str = ""  # 可选：指定测试用的模型名称，为空时后端按供应商自动选择


# 默认租户ID（单租户模式）
DEFAULT_TENANT_ID = "default"


# ---- 供应商管理 ----

@router.get("/providers")
async def list_providers(
    available: bool = Query(False, description="true=列出系统所有可用供应商, false=列出已添加的供应商"),
    db: AsyncSession = Depends(get_db),
):
    """
    列出供应商

    - available=true：列出系统注册表中所有可用供应商
    - available=false（默认）：列出当前租户已添加的供应商
    """
    from app.services.provider_api_service import list_providers as svc_list_providers
    return await svc_list_providers(db, DEFAULT_TENANT_ID, available_only=available)


@router.put("/providers")
async def add_provider(
    request: AddProviderRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    添加供应商到租户

    将系统注册表中的供应商添加到当前租户名下
    """
    from app.services.provider_api_service import add_provider as svc_add_provider
    return await svc_add_provider(db, DEFAULT_TENANT_ID, request.provider_name)


@router.delete("/providers/{provider_name}")
async def delete_provider(
    provider_name: str,
    db: AsyncSession = Depends(get_db),
):
    """
    删除租户的供应商

    同时删除该供应商下的所有实例
    """
    from app.services.provider_api_service import delete_provider as svc_delete_provider
    await svc_delete_provider(db, DEFAULT_TENANT_ID, provider_name)
    return {"message": "删除成功"}


@router.get("/providers/{provider_name}")
async def show_provider(provider_name: str):
    """
    查看供应商详情

    从系统注册表中获取供应商详细信息
    """
    from app.services.provider_api_service import show_provider as svc_show_provider
    return await svc_show_provider(provider_name)


@router.get("/providers/{provider_name}/models")
async def list_provider_models(provider_name: str):
    """
    列出供应商的模型列表

    从系统注册表中获取供应商的所有可用模型
    """
    from app.services.provider_api_service import list_provider_models as svc_list_models
    return await svc_list_models(provider_name)


# ---- 实例管理 ----

@router.post("/providers/{provider_name}/instances")
async def create_instance(
    provider_name: str,
    request: CreateInstanceRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    创建供应商实例

    为指定供应商创建一个配置实例（API Key + Base URL）
    """
    from app.services.provider_api_service import create_provider_instance as svc_create_instance
    return await svc_create_instance(
        db, DEFAULT_TENANT_ID, provider_name,
        request.instance_name, request.api_key, request.base_url
    )


@router.get("/providers/{provider_name}/instances")
async def list_instances(
    provider_name: str,
    db: AsyncSession = Depends(get_db),
):
    """
    列出供应商的所有实例
    """
    from app.services.provider_api_service import list_provider_instances as svc_list_instances
    return await svc_list_instances(db, DEFAULT_TENANT_ID, provider_name)


@router.delete("/providers/{provider_name}/instances")
async def delete_instances(
    provider_name: str,
    request: DeleteInstancesRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    删除供应商的指定实例

    按实例名称列表（instances: ["name1", "name2"]）删除
    """
    from app.services.provider_api_service import delete_provider_instances as svc_delete_instances
    await svc_delete_instances(db, DEFAULT_TENANT_ID, provider_name, request.instances)
    return {"message": "删除成功"}


# ---- 连接验证 ----

@router.post("/providers/{provider_name}/connection")
async def verify_connection(
    provider_name: str,
    request: VerifyConnectionRequest,
):
    """
    验证 API Key 是否有效

    发送 chat/completions 请求测试 API Key 可用性
    """
    from app.services.provider_api_service import verify_api_key as svc_verify
    return await svc_verify(provider_name, request.api_key, request.base_url, request.model)


# ---- 实例模型管理 ----

class AddInstanceModelRequest(BaseModel):
    """添加实例模型请求体"""
    model_name: str
    model_type: str = "chat"
    max_tokens: int = 0


class EditInstanceModelRequest(BaseModel):
    """编辑实例模型请求体"""
    model_name: str
    model_type: str | None = None
    max_tokens: int | None = None


class UpdateModelStatusRequest(BaseModel):
    """更新模型状态请求体"""
    status: str  # active / inactive


class DeleteModelRequest(BaseModel):
    """删除模型请求体"""
    model_names: list[str]


@router.get("/providers/{provider_name}/instances/{instance_name}")
async def show_instance_detail(
    provider_name: str,
    instance_name: str,
    db: AsyncSession = Depends(get_db),
):
    """查看实例详情（含模型列表）"""
    from app.services.provider_api_service import show_provider_instance as svc_show
    return await svc_show(db, DEFAULT_TENANT_ID, provider_name, instance_name)


@router.get("/providers/{provider_name}/instances/{instance_name}/models")
async def list_instance_models_api(
    provider_name: str,
    instance_name: str,
    db: AsyncSession = Depends(get_db),
):
    """列出实例下的所有模型"""
    from app.services.provider_api_service import list_instance_models as svc_list
    return await svc_list(db, DEFAULT_TENANT_ID, provider_name, instance_name)


@router.post("/providers/{provider_name}/instances/{instance_name}/models")
async def add_instance_model_api(
    provider_name: str,
    instance_name: str,
    request: AddInstanceModelRequest,
    db: AsyncSession = Depends(get_db),
):
    """为实例添加模型"""
    from app.services.provider_api_service import add_instance_model as svc_add
    return await svc_add(
        db, DEFAULT_TENANT_ID, provider_name, instance_name,
        request.model_name, request.model_type, request.max_tokens
    )


@router.put("/providers/{provider_name}/instances/{instance_name}/models")
async def edit_instance_model_api(
    provider_name: str,
    instance_name: str,
    request: EditInstanceModelRequest,
    db: AsyncSession = Depends(get_db),
):
    """编辑实例模型"""
    from app.services.provider_api_service import edit_instance_model as svc_edit
    return await svc_edit(
        db, DEFAULT_TENANT_ID, provider_name, instance_name,
        request.model_name, request.model_type, request.max_tokens
    )


@router.patch("/providers/{provider_name}/instances/{instance_name}/models/{model_name}/status")
async def update_model_status_api(
    provider_name: str,
    instance_name: str,
    model_name: str,
    request: UpdateModelStatusRequest,
    db: AsyncSession = Depends(get_db),
):
    """更新模型状态"""
    from app.services.provider_api_service import update_model_status as svc_update
    return await svc_update(
        db, DEFAULT_TENANT_ID, provider_name, instance_name,
        model_name, request.status
    )


@router.delete("/providers/{provider_name}/instances/{instance_name}/models")
async def delete_instance_model_api(
    provider_name: str,
    instance_name: str,
    request: DeleteModelRequest,
    db: AsyncSession = Depends(get_db),
):
    """删除实例模型（支持批量删除）"""
    from app.services.provider_api_service import delete_instance_model as svc_delete
    for model_name in request.model_names:
        await svc_delete(db, DEFAULT_TENANT_ID, provider_name, instance_name, model_name)
    return {"message": "删除成功"}


# ---- 所有模型汇总（用于 SystemSetting 下拉选择） ----

@router.get("/all-models")
async def list_all_models(
    db: AsyncSession = Depends(get_db),
):
    """
    列出所有已添加实例下的所有模型

    功能：汇总所有供应商、实例、模型，用于系统默认模型下拉选择
    返回值：包含 provider_name、instance_name、model_name、model_type 的列表
    """
    from app.services.provider_api_service import list_providers as svc_list_providers
    from app.services.provider_api_service import list_instance_models as svc_list_models

    providers = await svc_list_providers(db, DEFAULT_TENANT_ID, available_only=False)
    all_models = []
    for p in providers:
        for inst in p.get("instances", []):
            try:
                models = await svc_list_models(db, DEFAULT_TENANT_ID, p["name"], inst["instance_name"])
                for m in models:
                    all_models.append({
                        "provider_name": p["name"],
                        "instance_name": inst["instance_name"],
                        "model_name": m["model_name"],
                        "model_type": m["model_type"],
                        "status": m["status"],
                    })
            except Exception:
                pass
    return all_models


# ---- API Key 修改 ----

class UpdateApiKeyRequest(BaseModel):
    """更新 API Key 请求体"""
    api_key: str
    base_url: str = ""


@router.put("/providers/{provider_name}/instances/{instance_name}/apikey")
async def update_instance_apikey(
    provider_name: str,
    instance_name: str,
    request: UpdateApiKeyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    更新实例的 API Key / Base URL

    功能：修改已存在实例的 API Key（用于切换或更新密钥）
    输入参数：provider_name、instance_name、api_key、base_url
    返回值：更新后的实例信息
    使用场景：用户点击 "API-Key" 按钮重新输入密钥
    """
    from app.services.provider_api_service import update_instance_apikey as svc_update
    return await svc_update(
        db, DEFAULT_TENANT_ID, provider_name, instance_name,
        request.api_key, request.base_url
    )


# ---- 系统默认模型设置 ----

class DefaultModelItem(BaseModel):
    """默认模型项"""
    model_type: str
    model_provider: str = ""
    model_instance: str = ""
    model_name: str = ""


class DefaultModelUpdateRequest(BaseModel):
    """批量更新默认模型请求体"""
    items: list[DefaultModelItem] = []


@router.get("/default-model")
async def get_default_model(
    db: AsyncSession = Depends(get_db),
):
    """
    获取系统默认模型配置

    功能：返回 llm_id、embd_id、img2txt_id、asr_id、rerank_id、tts_id 等默认值
    返回值：{ "llm_id": "provider|instance|model", "embd_id": "", ... }
    """
    from app.services.system_setting_service import get_default_model_dictionary
    return await get_default_model_dictionary(db)


@router.put("/default-model")
async def set_default_model(
    request: DefaultModelUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    设置系统默认模型

    功能：批量更新默认模型
    """
    from app.services.system_setting_service import set_default_model_batch
    return await set_default_model_batch(db, [item.dict() for item in request.items])


# ---- 迁移接口：初始化已添加但无实例的供应商 ----

@router.post("/migrate-instances")
async def migrate_instances(
    db: AsyncSession = Depends(get_db),
):
    """
    迁移已添加的供应商，为缺少实例的供应商自动注入系统默认 key，
    并为所有实例自动同步模型

    功能：扫描 tenant_providers 表，对没有 instance 的供应商从 settings 中创建默认实例，
          对所有实例同步工厂配置中的模型
    使用场景：升级系统时初始化已添加但无实例的供应商
    """
    from app.services.provider_api_service import migrate_existing_providers
    return await migrate_existing_providers(db, DEFAULT_TENANT_ID)


# ---- 模型同步接口 ----

@router.post("/providers/{provider_name}/instances/{instance_name}/sync-models")
async def sync_instance_models(
    provider_name: str,
    instance_name: str,
    db: AsyncSession = Depends(get_db),
):
    """
    手动同步实例的模型列表

    功能：从 llm_factories.json 工厂配置中读取该供应商的模型，同步到实例的 InstanceModel 表
    使用场景：已有实例但没有模型时，手动触发同步
    """
    from app.services.provider_api_service import sync_models_for_instance as svc_sync
    return await svc_sync(db, DEFAULT_TENANT_ID, provider_name, instance_name)