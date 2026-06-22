/** 题目 API */
import client from "./client"
import type { Question, BankQuestionListResponse, QuestionUpdateRequest } from "@/types/question"

/** 题库题目列表（分页/筛选） */
export const getQuestions = async (params: Record<string, unknown>) => {
  const res = await client.get<BankQuestionListResponse>("/api/questions", { params })
  return res.data
}

/** 题目详情 */
export const getQuestion = async (id: string) => {
  const res = await client.get<Question>(`/api/questions/${id}`)
  return res.data
}

/** 更新题目 — 后端路由为 PATCH */
export const updateQuestion = async (id: string, data: QuestionUpdateRequest) => {
  const res = await client.patch(`/api/questions/${id}`, data)
  return res.data
}

/** 修改题目状态 */
export const updateQuestionStatus = async (id: string, status: string) => {
  const res = await client.patch(`/api/questions/${id}/status`, null, { params: { status } })
  return res.data
}

/** 切换入库状态 — 后端要求 Body */
export const toggleBankStatus = async (id: string) => {
  const res = await client.patch(`/api/questions/${id}/bank`, {})
  return res.data
}

/** 删除题目 */
export const deleteQuestion = async (id: string) => {
  const res = await client.delete(`/api/questions/${id}`)
  return res.data
}

/** 按试卷查询题目 */
export const getQuestionsByPaper = async (paperId: string) => {
  const res = await client.get<Question[]>(`/api/questions/by-paper/${paperId}`)
  return res.data
}

/** 批量更新题目属性 — 后端期望 [{ id, ...fields }] 格式 */
export const batchUpdateQuestions = async (ids: string[], data: Record<string, unknown>) => {
  const updates = ids.map((id) => ({ id, ...data }))
  const res = await client.put("/api/questions/batch", updates)
  return res.data
}

/**
 * 批量入库 — 后端 Body 直接接受 ID 列表（不是对象）
 *
 * 输入参数：ids - 待入库的题目 ID 数组
 * 返回值：后端返回的批量入库结果
 * 使用场景：题库页"批量入库"按钮
 * 注意：后端使用 FastAPI @router.post + question_ids: list[str] = Body(...)
 *       因此请求体必须是纯 JSON 数组，不能包裹为对象
 */
export const batchBankImport = async (ids: string[]) => {
  const res = await client.post("/api/questions/batch/bank-import", ids)
  return res.data
}

/**
 * 批量删除 — 后端 Body 直接接受 ID 列表（不是对象）
 *
 * 输入参数：ids - 待删除的题目 ID 数组
 * 返回值：后端返回的批量删除结果（含 deleted/failed_ids/total）
 * 使用场景：题库页"批量删除"按钮
 * 修复点：之前发送 { ids } 对象导致 FastAPI 返回 422，错误冒泡引发页面崩溃
 *        现改为直接发送数组，与后端 question_ids: list[str] = Body(...) 匹配
 */
export const batchDeleteQuestions = async (ids: string[]) => {
  const res = await client.post("/api/questions/batch/delete", ids)
  return res.data
}

/** 设置题目知识点 */
export const setKnowledgePoints = async (questionId: string, knowledgePointIds: string[]) => {
  const res = await client.put(`/api/questions/${questionId}/knowledge-points`, { knowledge_point_ids: knowledgePointIds })
  return res.data
}

/**
 * 进入校对工作台时调用：批量补全 AI 难度 + AI 知识点
 *
 * 输入参数：
 *   paperId — 试卷 ID
 *   selection — AI 供应商/实例/模型选择（可选）
 *     provider_key — 供应商标识
 *     instance_name — 实例名称
 *     model_key — 模型标识
 * 返回值：后端返回的补全结果（含 filled / failed / details 等字段）
 * 使用场景：校对工作台进入时，前端调用一次让后端为缺 AI 标注的题目自动补全
 */
export const batchAutoAi = async (
  paperId: string,
  selection?: {
    provider_key?: string
    instance_name?: string
    model_key?: string
  }
) => {
  const res = await client.post("/api/questions/batch-auto-ai", {
    paper_id: paperId,
    provider_key: selection?.provider_key || "",
    instance_name: selection?.instance_name || "",
    model_key: selection?.model_key || "",
  })
  return res.data
}
