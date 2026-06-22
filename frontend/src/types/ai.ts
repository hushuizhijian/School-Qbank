/** AI 相关类型定义 */

/** AI 操作请求 */
export interface AiOperationRequest {
  question_id: string
  stem?: string
  options?: unknown[]
  answer?: string
}

/**
 * AI 操作响应 — 与后端 app.schemas.ai.AiOperationResponse 对齐
 *
 * 字段说明：
 *  - data: 主结果数据（按 action 不同键名不同）
 *  - result: 旧字段，保留兼容（实际指向同一份 data）
 *  - confidence: 置信度（0-1），部分操作可填充
 *  - needs_confirmation: 是否需要用户二次确认
 */
export interface AiOperationResponse {
  question_id: string
  action: string
  success: boolean
  data: Record<string, unknown>
  result: Record<string, unknown>
  message: string
  confidence: number
  needs_confirmation: boolean
}

/** AI 匹配知识点结果项 */
export interface AiMatchKnowledgeResult {
  kp_code: string
  kp_name: string
  confidence: number
  reason: string
}
