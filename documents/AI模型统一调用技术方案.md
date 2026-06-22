# AI 模型统一调用技术方案

## 一、问题概述

### 1.1 当前痛点

tools4 项目中 AI 模型相关能力分散在多个模块，目前存在以下关键问题：

1. **AI 模型来源单一化**：所有 AI 调用（不论是用户主动操作还是后台批量任务）都只能从「系统设置 → AI 模型」模块中获取，模型选择仅由系统维护的"默认模型"或工厂中第一个可用项决定。
2. **用户主动选择失效**：校对工作台顶部 `AiModelSelector` 提供了供应商/模型下拉选择，但仅 6 个 AI 弹窗（match_knowledge / split_subquestions / fix_typos / generate_analysis / standardize_stem / auto_difficulty）支持传 `aiSelection`，其它接口（`ai-explain` / `ai-refine` / `batch-auto-ai` / `batch-standardize` / PDF 解析三阶段 / 异步 AI 任务）忽略该选择，仍走 `get_first_available_provider`。
3. **视觉模型兜底链路陈旧**：`get_vision_provider` 仍只从旧的 `ai_providers` 表读取，没读取新表 `tenant_providers / provider_instances / instance_models`，导致按新流程配置好的视觉模型无法被自动使用。
4. **批量接口无法指定模型**：`BatchStandardizeRequest` / `batch_auto_ai` / `ai_tasks.run_ai_task` 都不携带供应商选择，批量 AI 操作时无法做到"用 X 模型批改这 N 道题"。
5. **系统默认模型与用户选择互斥**：前端在 AiModelSelector 选了 A，但后端只查询 `system_settings` 里的 B，导致选择与执行不一致。

### 1.2 改造目标

- 统一所有 AI 调用入口，**三级优先级**解析模型：
  1. **用户主动选择**（前端 `AiModelSelector` → `aiSelection`）—— 最高优先
  2. **系统默认模型**（`system_settings` 表 `llm_id / embd_id / img2txt_id / asr_id / rerank_id / tts_id`，按 `model_type` 选）
  3. **兜底链**（`_get_provider_by_key_legacy` → `get_first_available_provider` → `.env` `DEEPSEEK_API_KEY`）
- 全链路传 `provider_key / instance_name / model_key`，覆盖以下所有 AI 调用点：

| 模块 | 接口/位置 | 现状 | 改造后 |
|------|----------|------|--------|
| 单题 AI | `/api/ai/match-knowledge` 等 6 个 | 接受 `aiSelection` | 维持 |
| 单题 AI | `/api/questions/{id}/ai-explain` | 仅 `get_first_available_provider` | 接受 `aiSelection` + 默认模型 |
| 单题 AI | `/api/questions/{id}/ai-refine` | 仅 `get_first_available_provider` | 接受 `aiSelection` + 默认模型 |
| 批量 AI | `/api/ai/batch-standardize` | `BatchStandardizeRequest` 无选择 | 接受 `aiSelection` |
| 批量 AI | `/api/questions/batch-auto-ai` | `AIService(db)` | 接受 `aiSelection` |
| 异步任务 | `app.tasks.ai_tasks.run_ai_task` | 不支持选择 | 增加 `provider_*` 参数 |
| PDF 解析 | `_auto_vision_stage` | 旧表 `get_vision_provider` | 按 `image2text` 默认模型 |
| PDF 解析 | `_auto_refine_stage` | `get_first_available_provider` | 按 `chat` 默认模型 |
| PDF 解析 | `_auto_knowledge_stage` | `get_first_available_provider` | 按 `chat` 默认模型 |
| 知识树 | `/api/knowledge/find-or-create-smart` | 接受 `provider_*` | 维持 |

- 修复 `get_vision_provider` 旧链路，新增 `get_provider_by_model_type`，让"系统默认视觉模型"可正确解析。

### 1.3 核心价值

- **所见即所得**：用户在前端选的模型 = 后端真用的模型
- **多模型并存**：支持 6 个默认模型（LLM / Embedding / VLM / ASR / Rerank / TTS）+ 任意多实例多模型
- **职责清晰**：`/api/ai/...` 管供应商/实例/模型 CRUD，`system_settings` 管默认模型绑定，`AIService` / `llm.factory` 管解析与调用
- **完全向后兼容**：未传 `aiSelection` 时走系统默认模型 / 兜底链，老调用点不受影响

---

## 二、现状梳理

### 2.1 AI 模型配置三层架构（已存在）

```
┌────────────────────────────────────────────────────────────────────┐
│  Layer 1  系统供应商注册表 (llm_factories.json)                    │
│  ── 静态注册所有可用的供应商 + 模型清单（OpenAI / DeepSeek / …）    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ 用户在「系统设置 → AI模型」添加
┌──────────────────────────────▼─────────────────────────────────────┐
│  Layer 2  租户供应商 (tenant_providers)                            │
│  ── 标记"该租户已启用哪些供应商"                                    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ 为每个供应商创建实例
┌──────────────────────────────▼─────────────────────────────────────┐
│  Layer 3  供应商实例 + 实例模型 (provider_instances / instance_models) │
│  ── 每个实例有 api_key / base_url，绑定若干个具体模型                │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 系统默认模型（已存在）

[system_settings](file:///f:/tools4/backend/app/models/system_setting.py) 表以 `setting_key: setting_value` 形式存储，键为：

| setting_key | model_type | 用途 |
|------------|------------|------|
| `llm_id` | chat | 对话补全（题目分析、解析生成） |
| `embd_id` | embedding | 文本向量化 |
| `img2txt_id` | image2text | 视觉识别 |
| `asr_id` | speech2text | 语音转文字 |
| `rerank_id` | rerank | 重排序 |
| `tts_id` | tts | 文字转语音 |

`setting_value` 格式：`{provider_name}|{instance_name}|{model_name}`。

[system_setting_service.py](file:///f:/tools4/backend/app/services/system_setting_service.py) 提供了 `MODEL_TYPE_TO_KEY` 映射与 `get_default_model_dictionary / set_default_model / parse_model_value` 工具函数。

### 2.3 AI 模型选择组件（已存在）

[frontend/src/components/proofreading/AiModelSelector.tsx](file:///f:/tools4/frontend/src/components/proofreading/AiModelSelector.tsx) 是校对工作台顶部 AI 模型下拉组件：

- 数据源：`fetchAddedModels` → 拉取「系统设置 → 已添加的供应商/实例/模型」
- 状态：存到 `localStorage("ai_model_selector")`
- 值结构：`{ providerId, modelId }`，其中 `modelId = "{providerName}|{instanceName}|{modelName}"`
- 默认值：`DEFAULT_AI_MODEL = { providerId: "智谱AI", modelId: "智谱AI|default|glm-4v-flash" }`

调用方将选择转换成 `aiSelection`：

```ts
const parsed = parseModelId(aiModel.modelId)
const aiSelection = {
  provider_key: aiModel.providerId,
  instance_name: parsed?.instanceName || "default",
  model_key: parsed?.modelName || "",
}
```

### 2.4 AI 调用点全景

| 调用点 | 文件 | 现状 | 走链路 |
|--------|------|------|--------|
| `match_knowledge` | [backend/app/api/ai.py](file:///f:/tools4/backend/app/api/ai.py) | `AIService(provider_key, instance_name, model_key)` | 走 `AIService._get_provider` |
| `split_subquestions` | 同上 | 同上 | 同上 |
| `fix_typos` | 同上 | 同上 | 同上 |
| `generate_analysis` | 同上 | 同上 | 同上 |
| `standardize_stem` | 同上 | 同上 | 同上 |
| `auto_difficulty` | 同上 | 同上 | 同上 |
| `batch_standardize` | 同上 | `AIService(db)` 不传选择 | **回退** `get_first_available_provider` |
| `ai-explain` | [backend/app/api/questions.py](file:///f:/tools4/backend/app/api/questions.py) | `get_first_available_provider(db)` | **回退** `get_first_available_provider` |
| `ai-refine` | 同上 | 同上 | **回退** `get_first_available_provider` |
| `batch-auto-ai` | 同上 | `AIService(db)` | **回退** `get_first_available_provider` |
| `_auto_vision_stage` | [backend/app/services/pdf_service.py](file:///f:/tools4/backend/app/services/pdf_service.py) | `get_vision_provider(db)`（**仅看旧表**） | **回退到旧表** |
| `_auto_refine_stage` | 同上 | `get_first_available_provider(db)` | **回退** `get_first_available_provider` |
| `_auto_knowledge_stage` | 同上 | `get_first_available_provider(db)` | **回退** `get_first_available_provider` |
| `find_or_create_smart` | [backend/app/api/knowledge.py](file:///f:/tools4/backend/app/api/knowledge.py) | 接受 `provider_key/instance_name/model_key` | 走 `AIService._get_provider` |
| `run_ai_task` | [backend/app/tasks/ai_tasks.py](file:///f:/tools4/backend/app/tasks/ai_tasks.py) | `AIService(db)` | **回退** `get_first_available_provider` |

### 2.5 现有 _get_provider 解析逻辑

[backend/app/services/ai_service.py#L36-L48](file:///f:/tools4/backend/app/services/ai_service.py#L36-L48) 当前的解析链：

```python
async def _get_provider(self):
    # 优先级 1：前端传了 provider_key+model_key
    if self.provider_key and self.model_key:
        provider = await self._get_provider_by_key(self.provider_key, self.model_key, self.instance_name)
        if provider:
            return provider
    # 优先级 2（兜底）：取第一个可用
    provider = await llm_factory.get_first_available_provider(self.db)
    if not provider:
        raise HTTPException(503, "无可用AI服务商")
    return provider
```

**问题**：优先级 2 缺失了"系统默认模型"这一中间层。当前 `_get_provider_by_key` 只按 `provider_name` 匹配，**忽略了系统设置中的 `llm_id/embd_id/...` 默认绑定**，导致用户没主动选时直接走兜底。

---

## 三、改造方案

### 3.1 三级优先级解析链

```
┌──────────────────────────────────────────────────────────────────┐
│  ① 用户主动选择 (aiSelection.provider_key/instance_name/model_key) │
│     来源：ProofreadingWorkbench → AiModelSelector                  │
│     解析：tenant_providers → provider_instances → instance_models   │
└────────────────────────┬─────────────────────────────────────────┘
                         │ 未传或解析失败
┌────────────────────────▼─────────────────────────────────────────┐
│  ② 系统默认模型 (system_settings.llm_id/img2txt_id/... 按 model_type) │
│     来源：SystemSetting 页面 → "设置默认模型"                       │
│     解析：system_settings.llm_id → provider|instance|model         │
└────────────────────────┬─────────────────────────────────────────┘
                         │ 未配置默认
┌────────────────────────▼─────────────────────────────────────────┐
│  ③ 兜底链                                                            │
│     a. _get_provider_by_key_legacy（旧 ai_providers 表）             │
│     b. get_first_available_provider（按时间序取第一个 chat 实例）    │
│     c. settings.deepseek_api_key（.env 兜底）                       │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 关键函数

#### 3.2.1 `AIService._get_provider` 改造

[backend/app/services/ai_service.py](file:///f:/tools4/backend/app/services/ai_service.py) 在构造时增加 `model_type` 字段（默认 `chat`），`_get_provider` 增加系统默认模型中间层：

```python
class AIService:
    def __init__(
        self,
        db: AsyncSession,
        provider_key: str = "",
        instance_name: str = "",
        model_key: str = "",
        model_type: str = "chat",   # 新增：chat / embedding / image2text / ...
    ):
        ...
        self.model_type = model_type

    async def _get_provider(self):
        # 优先级 1：用户主动选择
        if self.provider_key and self.model_key:
            provider = await self._get_provider_by_key(
                self.provider_key, self.model_key, self.instance_name
            )
            if provider:
                return provider
        # 优先级 2：系统默认模型（按 model_type 取）
        provider = await self._get_provider_by_default(self.model_type)
        if provider:
            return provider
        # 优先级 3：兜底
        provider = await llm_factory.get_first_available_provider(self.db)
        if not provider:
            raise HTTPException(503, "无可用AI服务商，请在系统设置中配置")
        return provider
```

新增 `_get_provider_by_default(model_type)`：

```python
async def _get_provider_by_default(self, model_type: str):
    """按 model_type 读取 system_settings 中的默认模型"""
    from app.services.system_setting_service import MODEL_TYPE_TO_KEY, parse_model_value
    setting_key = MODEL_TYPE_TO_KEY.get(model_type)
    if not setting_key:
        return None
    setting = await self.db.execute(
        select(SystemSetting).where(SystemSetting.setting_key == setting_key)
    )
    row = setting.scalar_one_or_none()
    if not row or not row.setting_value:
        return None
    parsed = parse_model_value(row.setting_value)
    if not parsed:
        return None
    return await self._get_provider_by_key(
        parsed["model_provider"], parsed["model_name"], parsed["model_instance"]
    )
```

#### 3.2.2 `llm.factory.get_provider_by_model_type`

[backend/llm/factory.py](file:///f:/tools4/backend/llm/factory.py) 新增公共 API，给 PDF 解析等"无 aiSelection 上下文"的地方使用：

```python
async def get_provider_by_model_type(
    db: AsyncSession, model_type: str
) -> BaseLLMProvider | None:
    """根据 model_type 解析系统默认模型

    功能：从 system_settings 读取对应 model_type 的默认配置，
          构造 AIProvider 实例
    输入参数：db、model_type（chat / embedding / image2text / speech2text / rerank / tts）
    返回值：BaseLLMProvider 实例，无配置时返回 None
    使用场景：PDF 解析等无前端选择上下文的场景
    """
    from app.services.system_setting_service import MODEL_TYPE_TO_KEY, parse_model_value
    from app.models.system_setting import SystemSetting
    from sqlalchemy import select

    setting_key = MODEL_TYPE_TO_KEY.get(model_type)
    if not setting_key:
        return None
    row = (await db.execute(
        select(SystemSetting).where(SystemSetting.setting_key == setting_key)
    )).scalar_one_or_none()
    if not row or not row.setting_value:
        return None
    parsed = parse_model_value(row.setting_value)
    if not parsed:
        return None
    return await _get_provider_from_selection(
        db, parsed["model_provider"], parsed["model_instance"], parsed["model_name"]
    )
```

同步修复 `get_vision_provider`：

```python
async def get_vision_provider(db=None) -> OpenAIVisionProvider | None:
    """获取第一个可用的视觉模型服务商"""
    # 优先级 1：系统默认 image2text 模型
    if db:
        provider = await get_provider_by_model_type(db, "image2text")
        if provider:
            return provider  # 兼容 OpenAIVisionProvider

    # 优先级 2：旧 ai_providers 表
    if db:
        ... # 旧代码保留

    return None
```

#### 3.2.3 `parse_default_model_value` 复用

[backend/app/services/system_setting_service.py](file:///f:/tools4/backend/app/services/system_setting_service.py) 已有 `parse_model_value` 工具函数，直接复用：

```python
def parse_model_value(value: str) -> dict | None:
    """解析 "provider|instance|model" → dict"""
    if not value: return None
    parts = value.split("|")
    if len(parts) < 3: return None
    return {
        "model_provider": parts[0],
        "model_instance": parts[1],
        "model_name": parts[2],
    }
```

### 3.3 接口改造清单

#### 3.3.1 单题 AI 6 弹窗（[backend/app/api/ai.py](file:///f:/tools4/backend/app/api/ai.py)）

维持现状，已通过 `AIService(provider_key, instance_name, model_key)` 接收 aiSelection。
唯一改动：在 `AIService(...)` 调用中新增 `model_type="chat"` 参数。

#### 3.3.2 `ai-explain` / `ai-refine`（[backend/app/api/questions.py](file:///f:/tools4/backend/app/api/questions.py)）

将这两个端点改造为接受 `AiProviderSelection`：

```python
class AiExplainRequest(BaseModel):
    provider_key: str = ""
    instance_name: str = ""
    model_key: str = ""

@router.post("/{question_id}/ai-explain")
async def ai_explain(
    question_id: str,
    request: AiExplainRequest = Body(default_factory=AiExplainRequest),
    db: AsyncSession = Depends(get_db),
):
    service = AIService(
        db,
        provider_key=request.provider_key,
        instance_name=request.instance_name,
        model_key=request.model_key,
        model_type="chat",
    )
    provider = await service._get_provider()
    ...
```

`ai-refine` 同理。

#### 3.3.3 `batch-standardize`（[backend/app/api/ai.py](file:///f:/tools4/backend/app/api/ai.py)）

[backend/app/schemas/ai.py](file:///f:/tools4/backend/app/schemas/ai.py) 的 `BatchStandardizeRequest` 增加 3 个字段：

```python
class BatchStandardizeRequest(BaseModel):
    question_ids: list[str]
    action: str
    provider_key: str = ""
    instance_name: str = ""
    model_key: str = ""
```

`ai.py` 路由层把它们传到 `AIService`：

```python
@router.post("/batch-standardize")
async def batch_standardize(request: BatchStandardizeRequest, db: AsyncSession = Depends(get_db)):
    service = AIService(
        db,
        provider_key=request.provider_key,
        instance_name=request.instance_name,
        model_key=request.model_key,
        model_type="chat",
    )
    return await service.batch_standardize(request)
```

#### 3.3.4 `batch-auto-ai`（[backend/app/api/questions.py](file:///f:/tools4/backend/app/api/questions.py)）

```python
class BatchAutoAiRequest(BaseModel):
    paper_id: str
    provider_key: str = ""
    instance_name: str = ""
    model_key: str = ""

@router.post("/batch-auto-ai")
async def batch_auto_ai(
    request: BatchAutoAiRequest = Body(...),
    db: AsyncSession = Depends(get_db),
):
    service = AIService(
        db,
        provider_key=request.provider_key,
        instance_name=request.instance_name,
        model_key=request.model_key,
        model_type="chat",
    )
    return await service.batch_auto_ai(request.paper_id)
```

#### 3.3.5 `find-or-create-smart`（[backend/app/api/knowledge.py](file:///f:/tools4/backend/app/api/knowledge.py)）

维持现状，仅把 `AIService(...)` 调用增加 `model_type="chat"`。

#### 3.3.6 异步 AI 任务（[backend/app/tasks/ai_tasks.py](file:///f:/tools4/backend/app/tasks/ai_tasks.py)）

```python
async def run_ai_task(
    question_id: str,
    action: str,
    db_url: str,
    provider_key: str = "",
    instance_name: str = "",
    model_key: str = "",
):
    ...
    service = AIService(
        db,
        provider_key=provider_key,
        instance_name=instance_name,
        model_key=model_key,
        model_type="chat",
    )
    ...
```

### 3.4 PDF 解析三阶段改造

[backend/app/services/pdf_service.py](file:///f:/tools4/backend/app/services/pdf_service.py) 的三个 AI 阶段无 aiSelection 上下文，统一从系统默认模型取：

| 阶段 | 函数 | model_type |
|------|------|-----------|
| 视觉识别 | `_auto_vision_stage` | `image2text` |
| 题干优化 | `_auto_refine_stage` | `chat` |
| 知识点匹配 | `_auto_knowledge_stage` | `chat` |

改造点：

```python
async def _auto_vision_stage(db: AsyncSession, paper: Paper) -> None:
    from llm.factory import get_provider_by_model_type
    vision_provider = await get_provider_by_model_type(db, "image2text")
    if not vision_provider:
        # 兜底：旧表 + 环境变量
        vision_provider = await get_vision_provider(db)
    if not vision_provider:
        print("[PDF] 无可用视觉模型，跳过")
        return
    ...

async def _auto_refine_stage(db: AsyncSession, paper: Paper) -> None:
    from llm.factory import get_provider_by_model_type
    provider = await get_provider_by_model_type(db, "chat")
    if not provider:
        provider = await get_first_available_provider(db)
    if not provider:
        print("[PDF] 无可用AI服务商，跳过题干优化")
        return
    ...

async def _auto_knowledge_stage(db: AsyncSession, paper: Paper) -> None:
    # 同 _auto_refine_stage
    ...
```

### 3.5 前端调用方改造

#### 3.5.1 统一 `aiSelection` 透传

[frontend/src/api/ai.ts](file:///f:/tools4/frontend/src/api/ai.ts) 新增 2 个函数：

```ts
export const aiExplain = async (
  questionId: string,
  selection?: AiProviderSelection
) => {
  const res = await client.post<QuestionResponse>(
    `/api/questions/${questionId}/ai-explain`,
    {
      provider_key: selection?.provider_key || "",
      instance_name: selection?.instance_name || "",
      model_key: selection?.model_key || "",
    }
  )
  return res.data
}

export const aiRefine = async (
  questionId: string,
  selection?: AiProviderSelection
) => {
  // 同 aiExplain
}
```

`aiBatchStandardize` 调整：

```ts
export const aiBatchStandardize = async (
  questionIds: string[],
  actions: string[],
  selection?: AiProviderSelection,
) => {
  const res = await client.post("/api/ai/batch-standardize", {
    question_ids: questionIds,
    actions,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}
```

#### 3.5.2 `questions.ts` 新增 `batchAutoAi` 选择参数

[frontend/src/api/questions.ts](file:///f:/tools4/frontend/src/api/questions.ts) `batchAutoAi` 接受 aiSelection：

```ts
export const batchAutoAi = async (
  paperId: string,
  selection?: AiProviderSelection,
) => {
  const res = await client.post("/api/questions/batch-auto-ai", {
    paper_id: paperId,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}
```

#### 3.5.3 `ProofreadingWorkbench` 透传

[frontend/src/pages/ProofreadingWorkbench.tsx](file:///f:/tools4/frontend/src/pages/ProofreadingWorkbench.tsx)：

```ts
// 1. 进入工作台时 batchAutoAi 传 aiSelection
batchAutoAi(paperId, aiSelection)

// 2. 批量 AI 弹窗传 aiSelection
<AiBatchStandardize
  ...
  aiSelection={aiSelection}    // 新增
/>

// 3. 旧 ai-explain/ai-refine 兼容（本次不在工作台内调用，但 api 已支持）
```

#### 3.5.4 6 个 AI 弹窗传 model_type

[backend/app/api/ai.py](file:///f:/tools4/backend/app/api/ai.py) 中 6 个端点创建 `AIService` 时统一加 `model_type="chat"`：

```python
service = AIService(
    db,
    provider_key=request.provider_key,
    instance_name=request.instance_name,
    model_key=request.model_key,
    model_type="chat",
)
```

---

## 四、数据流

### 4.1 单题 AI（以"AI 匹配知识点"为例）

```
┌────────────────────────────────────────────────────────────────┐
│  ProofreadingWorkbench                                          │
│  ── 顶部 AiModelSelector 选择: {智谱AI|default|glm-4v-flash}    │
│  ── 通过 useState 存到 aiModel                                  │
│  ── 解析为 aiSelection: { provider_key, instance_name, model_key }│
└────────────────────────┬───────────────────────────────────────┘
                         │ aiSelection
┌────────────────────────▼───────────────────────────────────────┐
│  AiMatchKnowledge 弹窗                                          │
│  ── 调用 aiMatchKnowledge(questionId, aiSelection)              │
└────────────────────────┬───────────────────────────────────────┘
                         │ POST /api/ai/match-knowledge
                         │ body: { question_id, provider_key, instance_name, model_key }
┌────────────────────────▼───────────────────────────────────────┐
│  AIService._get_provider                                        │
│  ── 优先级 1: provider_key+model_key 非空                       │
│      → 查 tenant_providers/instance_models                      │
│      → 构造 OpenAIProvider / DeepSeekProvider / ZhipuProvider   │
│  ── 优先级 2: 查 system_settings.llm_id（chat 默认）           │
│  ── 优先级 3: 兜底 get_first_available_provider / DEEPSEEK_API_KEY│
└────────────────────────┬───────────────────────────────────────┘
                         │ BaseLLMProvider
┌────────────────────────▼───────────────────────────────────────┐
│  provider.match_knowledge_points(stem, subject, kp_names)       │
│  ── 返回知识点名称列表                                           │
└────────────────────────┬───────────────────────────────────────┘
                         │ AiOperationResponse
┌────────────────────────▼───────────────────────────────────────┐
│  AiMatchKnowledge 弹窗渲染结果                                   │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 PDF 解析（题干优化阶段）

```
上传PDF
  │
  ▼
parse_tasks.parse_paper
  │
  ▼
_auto_refine_stage(db, paper)
  │
  ▼
get_provider_by_model_type(db, "chat")
  │  查 system_settings.llm_id
  │  解析 "智谱AI|default|glm-4-flash"
  │  构造 ZhipuProvider(...)
  │
  ▼
provider.refine_questions([{...}])
  │
  ▼
更新 question.stem / question_type / options / answer
```

### 4.3 批量 AI 标准化

```
题库中心/校对工作台
  │
  ▼
选中 N 道题 → 点"批量 AI 标准化"
  │
  ▼
AiBatchStandardize 弹窗
  ── 勾选操作: [standardize_stem, match_knowledge, auto_difficulty]
  ── 从 ProofreadingWorkbench 透传 aiSelection
  │
  ▼
逐题调用 aiBatchStandardize([qid], actions, aiSelection)
  │
  ▼
POST /api/ai/batch-standardize
  body: { question_ids, action, provider_key, instance_name, model_key }
  │
  ▼
AIService(provider_key, instance_name, model_key, model_type="chat")
  │
  ▼
service.batch_standardize(request)  # 内部循环调用单题接口
```

---

## 五、关键文件改动清单

### 5.1 后端

| 文件 | 改动 |
|------|------|
| [backend/app/services/ai_service.py](file:///f:/tools4/backend/app/services/ai_service.py) | `AIService.__init__` 增加 `model_type`；`_get_provider` 增加"系统默认模型"中间层；新增 `_get_provider_by_default` |
| [backend/app/services/system_setting_service.py](file:///f:/tools4/backend/app/services/system_setting_service.py) | 暴露 `MODEL_TYPE_TO_KEY / KEY_TO_MODEL_TYPE / parse_model_value` 给 ai_service 复用（已是模块级，无需改动） |
| [backend/llm/factory.py](file:///f:/tools4/backend/llm/factory.py) | 新增 `get_provider_by_model_type(db, model_type)`；修复 `get_vision_provider` 优先走新表+系统默认 `image2text` |
| [backend/app/schemas/ai.py](file:///f:/tools4/backend/app/schemas/ai.py) | `BatchStandardizeRequest` 增加 3 个选择字段 |
| [backend/app/api/ai.py](file:///f:/tools4/backend/app/api/ai.py) | 6 个单题端点 + `batch_standardize` 创建 `AIService` 时透传 `model_type` / `provider_*` |
| [backend/app/api/questions.py](file:///f:/tools4/backend/app/api/questions.py) | `ai_explain` / `ai_refine` 改造为接受 `AiExplainRequest`；`batch_auto_ai` 接受 `BatchAutoAiRequest` |
| [backend/app/api/knowledge.py](file:///f:/tools4/backend/app/api/knowledge.py) | `find_or_create_smart` 的 `AIService(...)` 增加 `model_type="chat"` |
| [backend/app/tasks/ai_tasks.py](file:///f:/tools4/backend/app/tasks/ai_tasks.py) | `run_ai_task` 增加 `provider_key / instance_name / model_key` 参数 |
| [backend/app/services/pdf_service.py](file:///f:/tools4/backend/app/services/pdf_service.py) | 三阶段改用 `get_provider_by_model_type(db, "...")` 优先 + 旧链路兜底 |

### 5.2 前端

| 文件 | 改动 |
|------|------|
| [frontend/src/api/ai.ts](file:///f:/tools4/frontend/src/api/ai.ts) | `aiBatchStandardize` 接受 aiSelection |
| [frontend/src/api/questions.ts](file:///f:/tools4/frontend/src/api/questions.ts) | `batchAutoAi` 接受 aiSelection |
| [frontend/src/components/ai/AiBatchStandardize.tsx](file:///f:/tools4/frontend/src/components/ai/AiBatchStandardize.tsx) | Props 增加 `aiSelection`，调用时透传 |
| [frontend/src/pages/ProofreadingWorkbench.tsx](file:///f:/tools4/frontend/src/pages/ProofreadingWorkbench.tsx) | `batchAutoAi(paperId, aiSelection)`；`<AiBatchStandardize aiSelection={aiSelection} />` |

---

## 六、数据库表关系

```
┌────────────────────────────────────────────────────────────────┐
│                        system_settings                          │
│  setting_key        setting_value                                │
│  llm_id        "智谱AI|default|glm-4-flash"                       │
│  embd_id       "智谱AI|default|embedding-3"                      │
│  img2txt_id    "智谱AI|default|glm-4v-flash"                     │
│  asr_id        ""                                                │
│  rerank_id     ""                                                │
│  tts_id        ""                                                │
└────────────────────────┬───────────────────────────────────────┘
                         │ provider|instance|model
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  tenant_providers (租户供应商)                                   │
│  id: 123   provider_name: 智谱AI   tenant_id: default              │
└────────────────────────┬───────────────────────────────────────┘
                         │ provider_id
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  provider_instances (实例)                                       │
│  id: abc   provider_id: 123   instance_name: default             │
│  api_key: sk-xxxx   extra: {"base_url": "https://open.big..."}   │
└────────────────────────┬───────────────────────────────────────┘
                         │ instance_id
                         ▼
┌────────────────────────────────────────────────────────────────┐
│  instance_models (实例模型)                                      │
│  instance_id: abc   model_name: glm-4-flash   model_type: chat   │
│  instance_id: abc   model_name: glm-4v-flash  model_type: image2text│
└────────────────────────────────────────────────────────────────┘
```

---

## 七、向后兼容

| 旧调用方 | 现状 | 改造后 |
|----------|------|--------|
| `AiOperationRequest`（6 个单题端点） | provider_* 可空 | 不变，空时走系统默认 → 兜底 |
| `BatchStandardizeRequest` | 无 provider_* | 新增字段可空，向后兼容 |
| `POST /api/questions/{id}/ai-explain` | 无 body | 增加 body 字段，向后兼容 |
| `POST /api/questions/batch-auto-ai` | Body `paper_id` | 改为 Pydantic Request，向后兼容 |
| `get_vision_provider(db)` | 仅旧表 | 优先系统默认 → 旧表 → 环境变量，行为更安全 |
| `tasks/ai_tasks.run_ai_task` | 无 provider_* | 新增参数默认空，向后兼容 |

所有改动采用"新增参数默认空"策略，老调用方不传任何字段时，仍按"系统默认 → 兜底"链解析，**不会破坏现有功能**。

---

## 八、测试用例

### 8.1 用户主动选择优先

| 场景 | 期望 |
|------|------|
| 校对工作台选"DeepSeek" → 点 AI 匹配知识点 | 实际调用 DeepSeek-provider 调 deepseek-chat |
| 校对工作台选"智谱AI" → 批量 AI 标准化 10 道题 | 实际调用 智谱AI-provider 调 glm-4-flash |
| 校对工作台选"A" → `batch_auto_ai` 入场补全 | 实际用 A 模型补全所有缺标注的题 |

### 8.2 系统默认模型兜底

| 场景 | 期望 |
|------|------|
| 系统设置 → 默认 LLM = "智谱AI\|default\|glm-4-flash"，AiModelSelector 未选 | AI 弹窗使用 glm-4-flash |
| 系统设置 → 默认 LLM 未配置，AiModelSelector 未选 | 走兜底：旧 ai_providers 表 → get_first_available_provider → env DEEPSEEK_API_KEY |

### 8.3 PDF 解析三阶段

| 场景 | 期望 |
|------|------|
| 系统设置 → 默认 LLM = "智谱AI\|default\|glm-4-flash" | PDF 题干优化 / 知识点匹配都用 glm-4-flash |
| 系统设置 → 默认 VLM = "智谱AI\|default\|glm-4v-flash" | PDF 视觉识别用 glm-4v-flash |
| 系统设置 → 默认 LLM 未配置 | PDF 三阶段走 `get_first_available_provider` |

### 8.4 向后兼容

| 场景 | 期望 |
|------|------|
| 老代码调用 `ai-explain` 不传 body | 服务端用默认值（无 provider_*），走系统默认 → 兜底 |
| 老代码调用 `batch-standardize` 不传 provider_* | 同上 |

---

## 九、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `get_provider_by_model_type` 解析错误 | PDF 解析失败 | 失败时降级到 `get_first_available_provider` |
| 用户误删了默认模型绑定 | 某些 AI 弹窗不可用 | 兜底链覆盖 3 层 |
| 旧 ai_providers 表和新 tenant_providers 表数据不一致 | `get_vision_provider` 行为变化 | 优先级明确，新表优先；旧表兜底保留 |
| 异步任务新增参数不兼容 celery 重试 | 旧任务失败 | 默认参数兼容老调用 |
| `ai-explain` body 改造导致老客户端报错 | 客户端崩溃 | body 字段均为可选，body 缺失时 Pydantic 自动用默认 |

---

## 十、未来扩展

1. **模型选择持久化到用户配置**：当前 `AiModelSelector` 存到 `localStorage`，后续可持久化到用户表（`users.ai_model_id`）实现多端同步。
2. **按题型选模型**：例如"选择题"用便宜模型，"解答题"用更强模型，扩展 `model_type` 为 `chat.choice / chat.solution`。
3. **多模型并行投票**：同一 AI 任务用 2 个模型生成结果，取置信度高的，提升质量。
4. **模型用量统计**：从 `instance_models` 表增加 `usage_count` 字段，记录每个模型被调用次数。
5. **模型 A/B 测试**：前端随机分发到不同模型，统计用户采纳率，自动选择最优模型。
