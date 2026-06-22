/** 作业 API
 *
 * 功能：作业（组卷）的增删改查、添加/移除/重排题目、导出 PDF
 * 输入参数：见各函数
 * 返回值：Promise 包装的 Homework 或 HomeworkQuestionItem 等
 * 使用场景：组卷中心所有交互
 */
import client from "./client"
import type { Homework } from "@/types/homework"

/** 作业列表响应 */
export interface HomeworkListResp {
  homework: Homework[]
  total: number
}

/**
 * 作业列表（分页）
 *
 * 输入参数：params - { page, page_size }
 * 返回值：{ homework: Homework[], total: number }
 * 使用场景：作业列表页
 */
export const getHomeworks = async (params: { page?: number; page_size?: number } = {}) => {
  const res = await client.get<HomeworkListResp>("/api/homework", { params })
  return res.data
}

/** 创建作业 — 支持从 paper_id 创建或直接创建空白 */
export const createHomework = async (data: {
  paper_id?: string
  title?: string
  subject?: string
  grade?: string
  page_config?: Record<string, unknown>
}) => {
  const res = await client.post<Homework>("/api/homework", data)
  return res.data
}

/** 作业详情 */
export const getHomework = async (id: string) => {
  const res = await client.get<Homework>(`/api/homework/${id}`)
  return res.data
}

/** 更新作业 */
export const updateHomework = async (id: string, data: Record<string, unknown>) => {
  const res = await client.patch(`/api/homework/${id}`, data)
  return res.data
}

/** 删除作业 */
export const deleteHomework = async (id: string) => {
  const res = await client.delete(`/api/homework/${id}`)
  return res.data
}

/** 批量删除作业（阶段8） */
export const batchDeleteHomeworks = async (ids: string[]) => {
  const res = await client.post<{ deleted: number; skipped: number; message: string }>(
    "/api/homework/batch-delete",
    { ids }
  )
  return res.data
}

/** 向作业添加题目 */
export const addHomeworkQuestion = async (id: string, questionId: string, score = 0): Promise<Homework> => {
  const res = await client.post<Homework>(`/api/homework/${id}/questions`, {
    question_id: questionId,
    score,
  })
  return res.data
}

/** 从作业移除题目 */
export const removeHomeworkQuestion = async (id: string, hqId: string) => {
  const res = await client.delete(`/api/homework/${id}/questions/${hqId}`)
  return res.data
}

/** 更新作业题目顺序 */
export const updateHomeworkQuestions = async (id: string, questionIds: string[]) => {
  const res = await client.put(`/api/homework/${id}/reorder`, questionIds)
  return res.data
}

/** 设置单题分值 */
export const setHomeworkQuestionScore = async (id: string, hqId: string, score: number) => {
  const res = await client.patch(`/api/homework/${id}/questions/${hqId}/score`, { score })
  return res.data
}
