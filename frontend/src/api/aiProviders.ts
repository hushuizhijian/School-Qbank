/**
 * AI 供应商/模型 API
 *
 * 功能：获取AI供应商和模型列表，优先从系统设置中已添加的供应商/实例/模型中加载
 * 使用场景：AiModelSelector 组件获取供应商和模型数据
 *
 * 数据来源：
 *   1. 主数据源：系统设置中已添加的供应商及其下的实例、模型（来自后端 /api/ai/providers）
 *   2. 备选：前端硬编码供应商配置（用于无后端数据时兜底）
 */
import client from "./client"

/** AI 供应商（系统设置） */
export interface AIProvider {
  id: string
  name: string
  provider_key: string
  models_count?: number
}

/** AI 模型（聚合展示用） */
export interface AIModel {
  // 唯一标识，格式：providerName|instanceName|modelName
  // 使用 "|" 作为分隔符，避免与模型名中可能包含的 ":" 冲突
  id: string
  // 供应商DB UUID
  provider_id: string
  // 供应商名称（与后端 TenantModelProvider.provider_name 一致）
  provider_name: string
  // 实例名称
  instance_name: string
  // 模型标识
  model_key: string
  // 显示名称
  name: string
  // 最大 token 数
  max_tokens: number
  // 供应商类型（如 chat / image2text）
  model_type?: string
  // 模型状态：active / inactive
  status: string
}

/** 解析结构化模型 ID */
function parseModelId(id: string): { providerName: string; instanceName: string; modelName: string } | null {
  if (!id) return null
  const parts = id.split("|")
  if (parts.length !== 3) return null
  return { providerName: parts[0], instanceName: parts[1], modelName: parts[2] }
}

/** 构造结构化模型 ID */
function buildModelId(providerName: string, instanceName: string, modelName: string): string {
  return `${providerName}|${instanceName}|${modelName}`
}

/* ========== 前端硬编码供应商配置（兜底数据源） ========== */

/** 硬编码供应商列表（仅在系统设置未添加任何模型时使用） */
const HARDCODED_PROVIDERS: AIProvider[] = [
  { id: "zhipu", name: "智谱", provider_key: "zhipu", models_count: 2 },
  { id: "deepseek", name: "DeepSeek", provider_key: "deepseek", models_count: 2 },
]

/** 硬编码模型列表（按供应商ID索引，仅用于兜底） */
const HARDCODED_MODELS: Record<string, AIModel[]> = {
  zhipu: [
    {
      id: buildModelId("智谱AI", "default", "glm-4-flash"),
      provider_id: "zhipu",
      provider_name: "智谱AI",
      instance_name: "default",
      model_key: "glm-4-flash",
      name: "glm-4-flash",
      max_tokens: 131072,
      model_type: "chat",
      status: "active",
    },
    {
      id: buildModelId("智谱AI", "default", "glm-4v-flash"),
      provider_id: "zhipu",
      provider_name: "智谱AI",
      instance_name: "default",
      model_key: "glm-4v-flash",
      name: "glm-4v-flash",
      max_tokens: 131072,
      model_type: "image2text",
      status: "active",
    },
  ],
  deepseek: [
    {
      id: buildModelId("DeepSeek", "default", "deepseek-chat"),
      provider_id: "deepseek",
      provider_name: "DeepSeek",
      instance_name: "default",
      model_key: "deepseek-chat",
      name: "deepseek-chat",
      max_tokens: 131072,
      model_type: "chat",
      status: "active",
    },
    {
      id: buildModelId("DeepSeek", "default", "deepseek-reasoner"),
      provider_id: "deepseek",
      provider_name: "DeepSeek",
      instance_name: "default",
      model_key: "deepseek-reasoner",
      name: "deepseek-reasoner",
      max_tokens: 131072,
      model_type: "chat",
      status: "active",
    },
  ],
}

/**
 * 默认选择：智谱 glm-4v-flash
 * 当用户系统设置中尚未添加任何模型时使用
 */
export const DEFAULT_AI_MODEL = {
  providerId: "智谱AI",
  modelId: buildModelId("智谱AI", "default", "glm-4v-flash"),
}

/* ========== 后端 API 调用 ========== */

/** 后端供应商响应（来自 /api/ai/providers） */
interface BackendProvider {
  id: string
  name: string
  tenant_id: string
  created_at: string | null
  instance_count: number
  instances: Array<{
    id: string
    instance_name: string
    api_key: string
    status: string
  }>
}

/** 后端实例模型响应（来自 /api/ai/providers/{p}/instances/{i}/models） */
interface BackendInstanceModel {
  id: string
  model_name: string
  model_type: string
  max_tokens: number
  status: string
}

/**
 * 获取用户已添加的供应商及其实例列表
 * 来自系统设置页"已添加的模型"接口
 */
export const getAddedProviders = async (): Promise<BackendProvider[]> => {
  const res = await client.get<BackendProvider[]>("/api/ai/providers")
  return res.data || []
}

/**
 * 获取指定供应商实例下的所有模型
 * 来自系统设置页"展示更多模型"接口
 */
export const getInstanceModels = async (
  providerName: string,
  instanceName: string
): Promise<BackendInstanceModel[]> => {
  const res = await client.get<BackendInstanceModel[]>(
    `/api/ai/providers/${encodeURIComponent(providerName)}/instances/${encodeURIComponent(instanceName)}/models`
  )
  return res.data || []
}

/**
 * 从系统设置中获取已添加的所有模型
 *
 * 功能：汇总所有供应商、实例下的 active 状态模型，转换为统一的 AIModel 格式
 * 返回值：AIModel 数组（含 provider_name / instance_name / model_key 等）
 * 使用场景：AiModelSelector 加载用户实际配置的模型列表
 */
export const fetchAddedModels = async (): Promise<AIModel[]> => {
  try {
    const providers = await getAddedProviders()
    const allModels: AIModel[] = []
    for (const p of providers) {
      // 跳过未启用实例
      const activeInstances = p.instances.filter((inst) => inst.status === "active")
      for (const inst of activeInstances) {
        try {
          const models = await getInstanceModels(p.name, inst.instance_name)
          for (const m of models) {
            // 仅添加 active 状态模型
            if (m.status !== "active") continue
            allModels.push({
              id: buildModelId(p.name, inst.instance_name, m.model_name),
              provider_id: p.id,
              provider_name: p.name,
              instance_name: inst.instance_name,
              model_key: m.model_name,
              name: m.model_name,
              max_tokens: m.max_tokens || 0,
              model_type: m.model_type,
              status: m.status,
            })
          }
        } catch {
          // 单个实例加载失败不影响其他实例
        }
      }
    }
    return allModels
  } catch {
    return []
  }
}

/**
 * 从 AIModel 数组中按 provider_name 分组
 *
 * 功能：将模型列表按供应商分组，便于 AiModelSelector 渲染两级联动下拉
 * 输入参数：models — AIModel 数组
 * 返回值：[{ provider: AIProvider, models: AIModel[] }] 数组
 * 使用场景：AiModelSelector 渲染供应商/模型两级下拉
 */
export const groupModelsByProvider = (models: AIModel[]): Array<{ provider: AIProvider; models: AIModel[] }> => {
  const map = new Map<string, { provider: AIProvider; models: AIModel[] }>()
  for (const m of models) {
    if (!map.has(m.provider_name)) {
      map.set(m.provider_name, {
        provider: {
          id: m.provider_id || m.provider_name,
          name: m.provider_name,
          provider_key: m.provider_name,
          models_count: 0,
        },
        models: [],
      })
    }
    const entry = map.get(m.provider_name)!
    entry.models.push(m)
    entry.provider.models_count = entry.models.length
  }
  return Array.from(map.values())
}

/**
 * 解析结构化模型 ID 为字段对象
 * 输入参数：id — 结构化模型 ID
 * 返回值：{ providerName, instanceName, modelName } | null
 * 使用场景：从 AiModelSelector 的 value 中提取后端所需字段
 */
export { parseModelId, buildModelId }

/* ========== 兼容旧接口（从硬编码数据加载） ========== */

/**
 * 获取所有 AI 供应商列表
 * 返回硬编码数据，用于组件初始化兜底
 */
export const getAIProviders = async (): Promise<AIProvider[]> => {
  return HARDCODED_PROVIDERS
}

/**
 * 获取指定供应商的模型列表
 * 返回硬编码数据，用于组件初始化兜底
 */
export const getProviderModels = async (providerId: string): Promise<AIModel[]> => {
  return HARDCODED_MODELS[providerId] || []
}
