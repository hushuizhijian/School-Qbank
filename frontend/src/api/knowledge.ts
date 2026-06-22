/** 知识点 API */
import client from "./client"
import type { KnowledgeTreeResponse, KnowledgeSearchResult, KnowledgePoint } from "@/types/knowledge"

/** 获取完整知识树（扁平结构，前端自行组装嵌套） */
export const getKnowledgeTree = async () => {
  const res = await client.get<KnowledgeTreeResponse>("/api/knowledge/tree", {
    params: { flat: true },
  })
  return res.data
}

/** 搜索知识点 */
export const searchKnowledge = async (q: string) => {
  const res = await client.get<KnowledgeSearchResult[]>("/api/knowledge/search", { params: { q } })
  return res.data
}

/** 获取子知识点 */
export const getKnowledgeChildren = async (id: string) => {
  const res = await client.get(`/api/knowledge/${id}/children`)
  return res.data
}

/** 知识点统计 */
export interface KnowledgeStats {
  subject: string          // 学科
  current_count: number    // 当前已存在节点数
  preset_count: number     // 预设节点数
}

/** 获取某学科知识点统计（系统设置页用） */
export const getKnowledgeStats = async (subject: string) => {
  const res = await client.get<KnowledgeStats>("/api/knowledge/stats", { params: { subject } })
  return res.data
}

/** 初始化北师大版小学数学知识树结果 */
export interface InitializeBnupResult {
  created_count: number    // 新建节点数
  skipped: boolean         // 是否跳过
  existing_count: number   // 已有节点数
  subject: string
  message: string
}

/** 初始化北师大版小学数学知识树（force=true 时强制覆盖） */
export const initializeBnupKnowledge = async (force = false): Promise<InitializeBnupResult> => {
  const res = await client.post<InitializeBnupResult>("/api/knowledge/initialize-bnup", { force })
  return res.data
}

/* ========== 知识树可视化编辑相关 API ========== */

/** 新增子节点 */
export const createKnowledgeNode = async (params: {
  subject: string
  name: string
  parent_id?: string | null
  sort_order?: number
}) => {
  const res = await client.post("/api/knowledge/", params)
  return res.data
}

/** 重命名 / 更新节点 */
export const updateKnowledgeNode = async (
  kpId: string,
  params: { name?: string; sort_order?: number; description?: string | null }
) => {
  const res = await client.patch(`/api/knowledge/${kpId}`, params)
  return res.data
}

/** 删除节点（级联） */
export const deleteKnowledgeNode = async (kpId: string) => {
  const res = await client.delete(`/api/knowledge/${kpId}`)
  return res.data
}

/** 移动节点（改父） */
export const moveKnowledgeNode = async (kpId: string, newParentId: string | null) => {
  const res = await client.patch(`/api/knowledge/${kpId}/move`, { new_parent_id: newParentId })
  return res.data
}

/** 获取某节点的后代数量（用于删除前提示） */
export const getDescendantCount = async (kpId: string) => {
  const res = await client.get<{ kp_id: string; count: number }>(`/api/knowledge/${kpId}/descendant-count`)
  return res.data
}

/**
 * AI 智能查找或创建知识点
 *
 * 功能：用户搜索一个不在知识树中的知识点时，调用此接口让后端智能挂到最相似的父节点
 * 输入参数：
 *   name — 知识点名称
 *   subject — 学科（默认 数学）
 *   providerKey / instanceName / modelKey — 可选 AI 供应商选择
 * 返回值：{ id, name, parent_id, parent_name, is_new, fuzzy_matched? }
 * 使用场景：校对工作台 → 知识点输入框 → 用户输入一个知识树中没有的关键词
 */
export interface FindOrCreateSmartResult {
  id: string
  name: string
  parent_id: string | null
  parent_name: string | null
  is_new: boolean
  fuzzy_matched?: boolean
}

export const findOrCreateSmart = async (
  name: string,
  subject = "数学",
  selection?: { providerKey?: string; instanceName?: string; modelKey?: string },
): Promise<FindOrCreateSmartResult> => {
  const res = await client.post<FindOrCreateSmartResult>("/api/knowledge/find-or-create-smart", {
    name,
    subject,
    provider_key: selection?.providerKey || "",
    instance_name: selection?.instanceName || "",
    model_key: selection?.modelKey || "",
  })
  return res.data
}
