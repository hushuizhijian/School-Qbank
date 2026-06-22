/** AI 操作 API */
import client from "./client"
import type { AiOperationResponse } from "@/types/ai"

/** AI 操作请求额外参数 — 供应商/实例/模型选择 */
export interface AiProviderSelection {
  provider_key?: string   // 供应商标识（如 智谱AI / DeepSeek）
  instance_name?: string  // 实例名称（默认 default），用于多实例场景
  model_key?: string      // 模型标识（如 glm-4v-flash）
}

/** AI 匹配知识点 */
export const aiMatchKnowledge = async (questionId: string, selection?: AiProviderSelection) => {
  const res = await client.post<AiOperationResponse>("/api/ai/match-knowledge", {
    question_id: questionId,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}

/** AI 拆分小问 */
export const aiSplitSubquestions = async (questionId: string, selection?: AiProviderSelection) => {
  const res = await client.post<AiOperationResponse>("/api/ai/split-subquestions", {
    question_id: questionId,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}

/** AI 错别字校正 */
export const aiFixTypos = async (questionId: string, selection?: AiProviderSelection) => {
  const res = await client.post<AiOperationResponse>("/api/ai/fix-typos", {
    question_id: questionId,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}

/** AI 生成标准解析 */
export const aiGenerateAnalysis = async (questionId: string, selection?: AiProviderSelection) => {
  const res = await client.post<AiOperationResponse>("/api/ai/generate-analysis", {
    question_id: questionId,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}

/** AI 题干标准化 */
export const aiStandardizeStem = async (questionId: string, selection?: AiProviderSelection) => {
  const res = await client.post<AiOperationResponse>("/api/ai/standardize-stem", {
    question_id: questionId,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}

/** AI 难度自动标注 */
export const aiAutoDifficulty = async (questionId: string, selection?: AiProviderSelection) => {
  const res = await client.post<AiOperationResponse>("/api/ai/auto-difficulty", {
    question_id: questionId,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}

/** 批量 AI 标准化 */
export const aiBatchStandardize = async (
  questionIds: string[],
  actions: string[],
  selection?: AiProviderSelection
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

/** AI 生成题目解析 — 校对工作台"AI 解析"按钮
 *
 * 输入参数：questionId — 题目 ID；selection — AI 供应商/实例/模型选择（可选）
 * 返回值：更新后的 Question 对象
 * 使用场景：校对工作台调用后端 /api/questions/{id}/ai-explain
 */
export const aiExplain = async (questionId: string, selection?: AiProviderSelection) => {
  const res = await client.post(`/api/questions/${questionId}/ai-explain`, {
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}

/** AI 优化题干 — 校对工作台"AI 优化"按钮
 *
 * 输入参数：questionId — 题目 ID；selection — AI 供应商/实例/模型选择（可选）
 * 返回值：更新后的 Question 对象
 * 使用场景：校对工作台调用后端 /api/questions/{id}/ai-refine
 */
export const aiRefine = async (questionId: string, selection?: AiProviderSelection) => {
  const res = await client.post(`/api/questions/${questionId}/ai-refine`, {
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}
