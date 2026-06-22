"""
知识点 API 路由 — V2增强版

功能：知识树/创建/删除/绑定/移动/搜索/导入
输入参数：subject / kp_id / 搜索关键词
返回值：知识树结构 / 知识点信息
使用场景：知识点体系管理
"""
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.utils.deps import get_current_user
from app.models.user import User
from app.services import knowledge_service

router = APIRouter(prefix="/api/knowledge", tags=["知识点"])


@router.get("/tree")
async def list_knowledge_tree(
    subject: str = Query("数学", description="学科名称"),
    flat: bool = Query(False, description="返回扁平列表（兼容旧接口）"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取学科知识树

    功能：根据 flat 参数返回嵌套树或扁平列表，统一包装为 {"tree": [...]} 响应
    输入参数：subject 学科名称、flat 是否返回扁平列表
    返回值：{"tree": [...]} 嵌套树节点或扁平节点列表
    使用场景：系统设置 → 知识树管理；题库管理 → 知识点筛选
    """
    if flat:
        items = await knowledge_service.list_by_subject(db, subject)
        return {"tree": items}
    tree = await knowledge_service.get_tree(db, subject)
    return {"tree": tree}


@router.get("/search")
async def search_knowledge(
    q: str = Query(..., description="搜索关键词"),
    subject: str = Query("数学", description="限定学科"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """搜索知识点 — 模糊匹配名称"""
    return await knowledge_service.search(db, q, subject)


@router.post("/find-or-create-smart")
async def find_or_create_smart(
    name: str = Body(..., embed=True, description="知识点名称"),
    subject: str = Body("数学", embed=True, description="学科"),
    provider_key: str = Body("", embed=True),
    instance_name: str = Body("", embed=True),
    model_key: str = Body("", embed=True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """智能查找或创建知识点（用户搜索不到时使用）

    流程：
    1) 精确 / 模糊命中已有知识点 → 直接返回
    2) 都没有 → 调 LLM 在已有知识树中找最相似父节点
    3) 在该父节点下创建新知识点
    4) 返回新知识点信息和它所属的父节点

    使用场景：校对工作台 → 用户在搜索框输入一个不在知识树中的知识点

    模型解析三级优先级：
      1) 前端传入了 provider_key + model_key → 使用用户选择
      2) 未传或解析失败 → 走 AIService 走系统默认 chat 模型
      3) 仍不可用 → 不调用 LLM，直接挂根
    """
    provider = None
    # 优先级 1：用户主动选择
    if provider_key and model_key:
        try:
            from app.services.ai_service import AIService
            service = AIService(
                db,
                provider_key=provider_key,
                instance_name=instance_name,
                model_key=model_key,
                model_type="chat",
            )
            provider = await service._get_provider_by_key(provider_key, model_key, instance_name)
        except Exception as e:
            print(f"[knowledge] 用户选择 AI 供应商加载失败: {e}")
            provider = None

    # 优先级 2：系统默认 chat 模型（user_choice 失败时兜底）
    if provider is None:
        try:
            from app.services.ai_service import AIService
            service = AIService(db, model_type="chat")
            provider = await service._get_provider_by_default("chat")
        except Exception as e:
            print(f"[knowledge] 系统默认 chat 模型解析失败: {e}")
            provider = None

    result = await knowledge_service.find_or_create_smart(db, subject, name, provider=provider)
    return result


@router.post("/")
async def create_knowledge(
    subject: str = Body(...),
    name: str = Body(...),
    sort_order: int = Body(0),
    parent_id: str | None = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建知识点（支持指定父节点）"""
    return await knowledge_service.create(db, subject, name, sort_order, parent_id)


@router.delete("/{kp_id}")
async def delete_knowledge(
    kp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除知识点（级联删除子节点）"""
    await knowledge_service.delete(db, kp_id)
    return {"message": "已删除"}


@router.patch("/{kp_id}")
async def update_knowledge(
    kp_id: str,
    name: str | None = Body(None, description="新名称（可选）"),
    sort_order: int | None = Body(None, description="新排序序号（可选）"),
    description: str | None = Body(None, description="新描述（可选）"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新知识点（重命名 / 调整排序 / 修改描述）

    功能：仅修改传入的字段，未传字段保持原值
    输入参数：kp_id 节点ID；name / sort_order / description 均为可选
    返回值：更新后的节点信息
    使用场景：系统设置 → 知识树管理 → 重命名/编辑节点
    """
    return await knowledge_service.update(
        db, kp_id,
        name=name,
        sort_order=sort_order,
        description=description,
    )


@router.get("/{kp_id}/descendant-count")
async def get_descendant_count(
    kp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取某节点的后代数量（不含自身）

    功能：用于删除节点前提示用户将级联删除多少个子节点
    输入参数：kp_id 节点ID
    返回值：{"kp_id": str, "count": int}
    使用场景：系统设置 → 知识树管理 → 删除节点确认
    """
    count = await knowledge_service.get_descendant_count(db, kp_id)
    return {"kp_id": kp_id, "count": count}


@router.patch("/bind/{question_id}")
async def bind_knowledge(
    question_id: str,
    knowledge_point_ids: list[str] = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """为题目绑定知识点"""
    return await knowledge_service.bind_question(db, question_id, knowledge_point_ids)


@router.patch("/{kp_id}/move")
async def move_knowledge(
    kp_id: str,
    new_parent_id: str | None = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """移动知识点到新的父节点下"""
    return await knowledge_service.move_node(db, kp_id, new_parent_id)


@router.get("/{kp_id}/leaves")
async def get_leaf_knowledge(
    kp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取某节点下所有叶子知识点ID"""
    return await knowledge_service.get_leaf_ids(db, kp_id)


@router.post("/import")
async def import_knowledge_tree(
    subject: str = Body(...),
    tree_data: list[dict] = Body(...),
    parent_id: str | None = Body(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量导入知识树JSON"""
    return await knowledge_service.import_tree(db, subject, tree_data, parent_id)


@router.post("/initialize-bnup")
async def initialize_bnup_knowledge(
    force: bool = Body(False, description="是否强制覆盖已有数据"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """初始化北师大版小学数学知识树

    功能：系统设置页一键导入北师大版小学数学完整知识树
    输入参数：force 是否强制覆盖
    返回值：初始化结果
    使用场景：系统设置 → 知识树管理 → 初始化北师大版小学数学
    """
    return await knowledge_service.initialize_bnup_primary_math(db, force=force)


@router.get("/stats")
async def get_knowledge_stats(
    subject: str = Query("数学", description="学科名称"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取知识点统计信息

    功能：返回指定学科下知识点总数与预设数据规模对比
    输入参数：学科名称
    返回值：{"subject": str, "current_count": int, "preset_count": int}
    使用场景：系统设置页展示知识树规模
    """
    from app.services.preset_knowledge import PRESET_BNUP_PRIMARY_MATH
    current_count = await knowledge_service.count_by_subject(db, subject)
    # 计算预设数据节点数
    preset_tree = PRESET_BNUP_PRIMARY_MATH.get(subject, [])

    def _count_nodes(nodes: list[dict]) -> int:
        cnt = len(nodes)
        for n in nodes:
            cnt += _count_nodes(n.get("children", []))
        return cnt

    preset_count = _count_nodes(preset_tree)
    return {
        "subject": subject,
        "current_count": current_count,
        "preset_count": preset_count,
    }
