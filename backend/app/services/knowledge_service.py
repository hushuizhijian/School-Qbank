"""
知识点管理服务 — V2增强版

功能：知识点CRUD/知识树/搜索/绑定/移动/导入
输入参数：db会话 / subject / kp_id / 搜索关键词
返回值：知识点信息 / 知识树结构
使用场景：知识点体系管理
"""
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func

from app.models.knowledge_point import KnowledgePoint
from app.models.question import Question
from app.services.preset_knowledge import PRESET_BNUP_PRIMARY_MATH


async def list_by_subject(db: AsyncSession, subject: str) -> list[dict]:
    """获取某学科的知识点列表（扁平，兼容旧接口）"""
    q = select(KnowledgePoint).where(KnowledgePoint.subject == subject).order_by(KnowledgePoint.sort_order)
    result = await db.execute(q)
    items = result.scalars().all()
    return [
        {"id": kp.id, "parent_id": kp.parent_id, "subject": kp.subject, "name": kp.name, "sort_order": kp.sort_order}
        for kp in items
    ]


async def get_tree(db: AsyncSession, subject: str) -> list[dict]:
    """获取某学科的完整知识树（嵌套结构）"""
    q = select(KnowledgePoint).where(KnowledgePoint.subject == subject).order_by(KnowledgePoint.sort_order)
    result = await db.execute(q)
    items = result.scalars().all()

    # 构建扁平映射
    node_map: dict[str, dict] = {}
    for kp in items:
        node_map[kp.id] = {
            "id": kp.id,
            "parent_id": kp.parent_id,
            "name": kp.name,
            "code": kp.code,
            "subject": kp.subject,
            "grade": kp.grade,
            "semester": kp.semester,
            "level": kp.level,
            "sort_order": kp.sort_order,
            "question_count": kp.question_count,
            "children_count": 0,
            "children": [],
        }

    # 构建嵌套树
    roots: list[dict] = []
    for kp in items:
        node = node_map[kp.id]
        if kp.parent_id and kp.parent_id in node_map:
            node_map[kp.parent_id]["children"].append(node)
        else:
            roots.append(node)

    return roots


async def search(db: AsyncSession, keyword: str, subject: str | None = None) -> list[dict]:
    """模糊搜索知识点 — 按名称匹配，返回完整字段（含层级路径）"""
    # 1) 先查出命中的知识点
    q = select(KnowledgePoint).where(
        KnowledgePoint.name.contains(keyword)
    )
    if subject:
        q = q.where(KnowledgePoint.subject == subject)
    q = q.order_by(KnowledgePoint.sort_order).limit(50)
    result = await db.execute(q)
    items: list[KnowledgePoint] = list(result.scalars().all())
    if not items:
        return []

    # 2) 收集所有需要查的祖先 ID（最多 5 层），然后一次性加载
    id_to_node: dict[str, KnowledgePoint] = {kp.id: kp for kp in items}
    pending_parents: set[str] = set()
    for kp in items:
        cur = kp.parent_id
        for _ in range(5):
            if not cur or cur in id_to_node:
                break
            pending_parents.add(cur)
            # 一次只加入直接父节点，下一轮再扩展
            break
    # 循环加载直到稳定
    while pending_parents:
        p_q = select(KnowledgePoint).where(KnowledgePoint.id.in_(pending_parents))
        p_result = await db.execute(p_q)
        parents = list(p_result.scalars().all())
        pending_parents.clear()
        for p in parents:
            if p.id in id_to_node:
                continue
            id_to_node[p.id] = p
            if p.parent_id and p.parent_id not in id_to_node:
                pending_parents.add(p.parent_id)

    # 3) 构造响应（只输出命中的前 50 条）
    results: list[dict] = []
    for kp in items[:50]:
        path_names: list[str] = []
        cur = kp.parent_id
        for _ in range(10):
            if not cur:
                break
            parent = id_to_node.get(cur)
            if not parent:
                break
            path_names.insert(0, parent.name)
            cur = parent.parent_id
        results.append({
            "id": kp.id,
            "parent_id": kp.parent_id,
            "subject": kp.subject,
            "name": kp.name,
            "code": kp.code,
            "level": kp.level,
            "sort_order": kp.sort_order,
            "path": path_names,
        })
    return results


async def create(db: AsyncSession, subject: str, name: str, sort_order: int = 0, parent_id: str | None = None) -> dict:
    """新增知识点（支持指定父节点）"""
    # 校验父节点存在且同属一个学科
    if parent_id:
        parent = await db.get(KnowledgePoint, parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="父节点不存在")
        if parent.subject != subject:
            raise HTTPException(status_code=400, detail="父节点与子节点必须属于同一学科")

    # 生成 code：按学科首字母+序号，避免与现有编码冲突
    code = await _generate_unique_code(db, subject)
    kp = KnowledgePoint(subject=subject, name=name, code=code, sort_order=sort_order, parent_id=parent_id)
    db.add(kp)
    await db.commit()
    await db.refresh(kp)
    return {
        "id": kp.id, "parent_id": kp.parent_id, "subject": kp.subject,
        "name": kp.name, "sort_order": kp.sort_order,
    }


async def update(
    db: AsyncSession,
    kp_id: str,
    name: str | None = None,
    sort_order: int | None = None,
    description: str | None = None,
) -> dict:
    """更新知识点（重命名 / 调整排序 / 修改描述）

    功能：修改指定知识点的 name、sort_order、description，未传字段保持原值
    输入参数：kp_id 节点ID、name 新名称（可选）、sort_order 新排序（可选）、description 新描述（可选）
    返回值：更新后的节点信息
    使用场景：系统设置 → 知识树管理 → 重命名/编辑节点
    """
    kp = await db.get(KnowledgePoint, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")

    # 仅更新传入的字段
    if name is not None:
        kp.name = name.strip()
    if sort_order is not None:
        kp.sort_order = sort_order
    if description is not None:
        kp.description = description

    await db.commit()
    await db.refresh(kp)
    return {
        "id": kp.id,
        "parent_id": kp.parent_id,
        "subject": kp.subject,
        "name": kp.name,
        "sort_order": kp.sort_order,
        "description": kp.description,
    }


async def _generate_unique_code(db: AsyncSession, subject: str) -> str:
    """生成学科内唯一的 code（使用 UUID 片段避免冲突）

    功能：在新增节点时生成一个在当前学科内唯一的 code
    输入参数：db 会话、subject 学科
    返回值：唯一 code 字符串
    使用场景：create 内部调用
    """
    import uuid as _uuid
    return f"kp-{_uuid.uuid4().hex[:8]}"


async def get_descendant_count(db: AsyncSession, kp_id: str) -> int:
    """获取某节点的后代节点数量（不含自身）

    功能：递归统计指定节点的所有子节点、孙节点...数量
    输入参数：kp_id 节点ID
    返回值：后代节点数
    使用场景：删除节点时提示用户
    """
    descendants = await _get_descendant_ids(db, kp_id)
    return len(descendants)


async def delete(db: AsyncSession, kp_id: str) -> None:
    """删除知识点（级联删除子节点）"""
    kp = await db.get(KnowledgePoint, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")
    # ON DELETE CASCADE 会自动删除子节点
    await db.delete(kp)
    await db.commit()


async def move_node(db: AsyncSession, kp_id: str, new_parent_id: str | None) -> dict:
    """移动知识点到新的父节点下"""
    kp = await db.get(KnowledgePoint, kp_id)
    if not kp:
        raise HTTPException(status_code=404, detail="知识点不存在")

    # 防止循环引用：新父节点不能是自身或自身的后代
    if new_parent_id:
        if new_parent_id == kp_id:
            raise HTTPException(status_code=400, detail="不能将节点移动到自身下")
        # 检查 new_parent_id 是否是 kp 的后代
        descendant_ids = await _get_descendant_ids(db, kp_id)
        if new_parent_id in descendant_ids:
            raise HTTPException(status_code=400, detail="不能将节点移动到自身后代下")

        new_parent = await db.get(KnowledgePoint, new_parent_id)
        if not new_parent:
            raise HTTPException(status_code=404, detail="目标父节点不存在")
        if new_parent.subject != kp.subject:
            raise HTTPException(status_code=400, detail="目标父节点与当前节点必须属于同一学科")

    kp.parent_id = new_parent_id
    await db.commit()
    await db.refresh(kp)
    return {
        "id": kp.id, "parent_id": kp.parent_id, "subject": kp.subject,
        "name": kp.name, "sort_order": kp.sort_order,
    }


async def get_leaf_ids(db: AsyncSession, kp_id: str) -> list[str]:
    """递归获取某节点下所有叶子知识点ID"""
    all_ids = await _get_descendant_ids(db, kp_id)
    all_ids.add(kp_id)

    # 找出叶子节点（没有子节点的）
    q = select(KnowledgePoint).where(KnowledgePoint.id.in_(all_ids))
    result = await db.execute(q)
    items = result.scalars().all()

    parent_ids = {kp.parent_id for kp in items if kp.parent_id}
    leaf_ids = [kp.id for kp in items if kp.id not in parent_ids]
    return leaf_ids


async def import_tree(db: AsyncSession, subject: str, tree_data: list[dict], parent_id: str | None = None) -> dict:
    """批量导入知识树结构"""
    created_count = 0

    async def _import_nodes(nodes: list[dict], pid: str | None, level_prefix: str = ""):
        """递归导入节点"""
        nonlocal created_count
        for i, node in enumerate(nodes):
            name = node.get("name", "").strip()
            if not name:
                continue
            # 生成编码：层级前缀+序号，如 M-01-02-03
            code = f"{level_prefix}{i+1:02d}" if level_prefix else f"M-{i+1:02d}"
            kp = KnowledgePoint(subject=subject, name=name, code=code, sort_order=i, parent_id=pid)
            db.add(kp)
            await db.flush()  # 获取 kp.id
            created_count += 1

            children = node.get("children", [])
            if children:
                await _import_nodes(children, kp.id, f"{code}-")

    await _import_nodes(tree_data, parent_id)
    await db.commit()

    return {"subject": subject, "created_count": created_count}


async def initialize_bnup_primary_math(db: AsyncSession, force: bool = False) -> dict:
    """初始化数学知识树（模块化版）

    功能：检查是否已存在数学学科知识点，若不存在（或 force=True）则从 PRESET_MODULE_BASED_MATH 导入
    输入参数：db 会话、force 是否强制覆盖（覆盖会先清空数学学科已有节点及关联）
    返回值：{"created_count": int, "skipped": bool, "existing_count": int, "subject": str, "removed_bindings": int}
    使用场景：系统设置 → 知识树管理 → 一键初始化
    """
    from app.models.question_knowledge import QuestionKnowledge
    from sqlalchemy import delete

    subject = "数学"

    # 查询当前学科下是否已有知识点
    count_q = select(func.count()).select_from(KnowledgePoint).where(KnowledgePoint.subject == subject)
    result = await db.execute(count_q)
    existing_count = result.scalar() or 0

    if existing_count > 0 and not force:
        return {
            "created_count": 0,
            "skipped": True,
            "existing_count": existing_count,
            "subject": subject,
            "message": f"「{subject}」学科下已存在 {existing_count} 个知识点，未重复导入。如需重新导入请使用强制模式",
        }

    # 强制模式下：先清空该学科下所有知识点（级联删除 question_knowledge 关联）
    removed_bindings = 0
    if force and existing_count > 0:
        all_ids = await _get_all_descendant_ids(db, None, subject)
        if all_ids:
            # 先统计被清空的题目-知识点关联数（提示用户需重新匹配）
            bind_q = select(func.count()).select_from(QuestionKnowledge).where(
                QuestionKnowledge.knowledge_point_id.in_(all_ids)
            )
            bind_result = await db.execute(bind_q)
            removed_bindings = bind_result.scalar() or 0

            # 删除知识点（question_knowledge 通过外键 CASCADE 自动删除）
            await db.execute(
                delete(KnowledgePoint).where(KnowledgePoint.id.in_(all_ids))
            )
            await db.commit()

    # 从模块化预设数据导入
    preset_tree = PRESET_BNUP_PRIMARY_MATH.get(subject, [])
    if not preset_tree:
        return {
            "created_count": 0,
            "skipped": False,
            "existing_count": 0,
            "subject": subject,
            "message": f"未找到 {subject} 学科的预设数据",
        }

    import_result = await import_tree(db, subject, preset_tree)
    message = f"已成功导入 {import_result['created_count']} 个知识点（模块化数学知识树）"
    if removed_bindings > 0:
        message += f"；同时清空了 {removed_bindings} 个题目-知识点关联（需重新匹配）"
    return {
        "created_count": import_result["created_count"],
        "skipped": False,
        "existing_count": 0,
        "subject": subject,
        "removed_bindings": removed_bindings,
        "message": message,
    }


async def _get_all_descendant_ids(db: AsyncSession, parent_id: str | None, subject: str) -> list[str]:
    """获取学科下所有知识点 ID"""
    q = select(KnowledgePoint.id).where(KnowledgePoint.subject == subject)
    result = await db.execute(q)
    return [row[0] for row in result.all()]


async def count_by_subject(db: AsyncSession, subject: str) -> int:
    """统计某学科下知识点数量"""
    q = select(func.count()).select_from(KnowledgePoint).where(KnowledgePoint.subject == subject)
    result = await db.execute(q)
    return result.scalar() or 0


async def bind_question(db: AsyncSession, question_id: str, knowledge_point_ids: list[str]) -> dict:
    """为题目绑定知识点（全量替换）"""
    q = await db.get(Question, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="题目不存在")
    q.knowledge_points = knowledge_point_ids
    await db.commit()
    return {"question_id": question_id, "knowledge_points": knowledge_point_ids}


async def find_or_create(db: AsyncSession, subject: str, name: str, parent_id: str | None = None) -> KnowledgePoint:
    """查找或创建知识点（自动匹配阶段使用）

    先按学科+名称查找，找不到则创建为根级节点。
    """
    # 先查找是否已存在
    q = select(KnowledgePoint).where(
        KnowledgePoint.subject == subject,
        KnowledgePoint.name == name,
    )
    result = await db.execute(q)
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    # 不存在则创建
    kp = KnowledgePoint(subject=subject, name=name, sort_order=0, parent_id=parent_id)
    db.add(kp)
    await db.commit()
    await db.refresh(kp)
    return kp


async def find_or_create_smart(
    db: AsyncSession,
    subject: str,
    name: str,
    provider=None,
) -> dict:
    """AI 智能查找或创建知识点（用户搜索不存在时使用）

    流程：
    1) 先按学科+名称精确查找
    2) 再按名称模糊查找
    3) 都没有时，调用 LLM 在已有知识点树中找到最合适的父节点
    4) 在该父节点下创建新知识点（兜底：根级）

    输入参数：
      db — 数据库会话
      subject — 学科
      name — 知识点名称
      provider — 可选 LLM 适配器；为 None 时直接挂根
    返回值：{"id", "name", "parent_id", "parent_name", "is_new"}
    使用场景：校对工作台用户搜索一个不在知识树中的知识点
    """
    # 1) 精确查找
    q = select(KnowledgePoint).where(
        KnowledgePoint.subject == subject,
        KnowledgePoint.name == name,
    )
    result = await db.execute(q)
    existing = result.scalar_one_or_none()
    if existing:
        return {
            "id": existing.id,
            "name": existing.name,
            "parent_id": existing.parent_id,
            "parent_name": None,
            "is_new": False,
        }

    # 2) 模糊查找（含子串的视为同一概念）
    #    双向匹配：①用户输入是数据库 name 的子串（input ⊂ db_name）
    #            ②数据库 name 是用户输入的子串（db_name ⊂ input）
    #    第①种用 SQL 模糊查询实现；第②种在 Python 端按子串筛选
    fuzzy_q = select(KnowledgePoint).where(
        KnowledgePoint.subject == subject,
        KnowledgePoint.name.contains(name),
    ).limit(50)
    fuzzy_result = await db.execute(fuzzy_q)
    fuzzy_list = fuzzy_result.scalars().all()
    # Python 端再补一个方向：db_name 是 name 的子串
    if not fuzzy_list:
        all_q = select(KnowledgePoint).where(
            KnowledgePoint.subject == subject,
        )
        all_result = await db.execute(all_q)
        for n in all_result.scalars().all():
            if n.name and name and n.name in name and n.name != name:
                fuzzy_list.append(n)
                if len(fuzzy_list) >= 5:
                    break
    if fuzzy_list:
        # 取第一个模糊匹配当作"已存在"，避免重复
        first = fuzzy_list[0]
        return {
            "id": first.id,
            "name": first.name,
            "parent_id": first.parent_id,
            "parent_name": None,
            "is_new": False,
            "fuzzy_matched": True,
        }

    # 3) 都没有 — 调 LLM 找最相似父节点
    parent_id = None
    parent_name = None
    if provider is not None:
        try:
            # 取该学科下所有非空节点的 (id, name, level) 作为候选
            tree_q = select(KnowledgePoint).where(KnowledgePoint.subject == subject)
            tree_result = await db.execute(tree_q)
            all_nodes = tree_result.scalars().all()
            if all_nodes:
                # 构造层级路径辅助 LLM 决策
                id_to_node = {n.id: n for n in all_nodes}
                candidates = []
                for n in all_nodes:
                    ancestors = []
                    cur = n.parent_id
                    while cur and cur in id_to_node:
                        ancestors.insert(0, id_to_node[cur].name)
                        cur = id_to_node[cur].parent_id
                    if ancestors:
                        path = " / ".join(ancestors) + " / " + n.name
                    else:
                        path = n.name
                    candidates.append(f"{n.id}||{path}||{n.level}")
                candidates_text = "\n".join(candidates[:300])

                prompt = f"""你是知识点体系专家，请判断以下新知识点应该挂到现有知识树中的哪个父节点下最合适。

新知识点名称：{name}
学科：{subject}

现有知识点列表（id||路径||层级；层级 1=学科 2=年级 3=学期 4=单元 5=知识点）：
{candidates_text}

要求：
1. 从列表中选择一个最合适的父节点 id，使新知识点语义上属于该父节点
2. 只返回父节点 id 这一个字符串，不要其他内容
3. 如果没有合适父节点，返回 ROOT

最合适的父节点 id："""
                try:
                    raw = await provider.chat("你是知识点体系专家。", prompt, temperature=0, max_tokens=50)
                    raw = raw.strip()
                    if raw and raw != "ROOT" and raw in id_to_node:
                        parent_id = raw
                        parent_name = id_to_node[raw].name
                except Exception as e:
                    print(f"[knowledge] LLM 选择父节点失败: {e}")
                    parent_id = None
        except Exception as e:
            print(f"[knowledge] 加载候选节点失败: {e}")
            parent_id = None

    # 4) 创建新知识点
    import uuid as _uuid
    code = f"kp-{_uuid.uuid4().hex[:8]}"
    kp = KnowledgePoint(
        subject=subject,
        name=name,
        code=code,
        sort_order=0,
        parent_id=parent_id,
    )
    db.add(kp)
    await db.commit()
    await db.refresh(kp)
    return {
        "id": kp.id,
        "name": kp.name,
        "parent_id": kp.parent_id,
        "parent_name": parent_name,
        "is_new": True,
    }


async def _get_descendant_ids(db: AsyncSession, kp_id: str) -> set[str]:
    """获取某节点的所有后代ID（不含自身）"""
    ids: set[str] = set()
    current_level = [kp_id]

    while current_level:
        q = select(KnowledgePoint.id).where(KnowledgePoint.parent_id.in_(current_level))
        result = await db.execute(q)
        next_level = [row[0] for row in result.all()]
        ids.update(next_level)
        current_level = next_level

    return ids
