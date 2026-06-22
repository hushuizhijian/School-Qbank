/** 试卷 API */
import client from "./client"
import type { Paper, ProofreadingStats } from "@/types/paper"

/** 试卷列表 */
export const getPapers = async () => {
  const res = await client.get<Paper[]>("/api/papers")
  return res.data
}

/** 上传试卷 */
export const uploadPaper = async (formData: FormData) => {
  const res = await client.post<Paper>("/api/papers/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return res.data
}

/** 试卷详情 */
export const getPaper = async (id: string) => {
  const res = await client.get<Paper>(`/api/papers/${id}`)
  return res.data
}

/** 删除试卷 */
export const deletePaper = async (id: string) => {
  const res = await client.delete(`/api/papers/${id}`)
  return res.data
}

/** 试卷校对统计 */
export const getPaperStats = async (id: string) => {
  const res = await client.get<ProofreadingStats>(`/api/papers/${id}/stats`)
  return res.data
}

/** 一键入库所有正常题目 */
export const bankImportPaper = async (id: string) => {
  const res = await client.post(`/api/papers/${id}/bank-import`)
  return res.data
}

/** 解析进度轮询 */
export const getParseProgress = async (id: string) => {
  const res = await client.get(`/api/papers/${id}/parse-progress`)
  return res.data
}

/** 手动触发/重新触发解析 */
export const triggerParse = async (id: string) => {
  const res = await client.post(`/api/papers/${id}/parse`)
  return res.data
}

/** 按 content分题方案重新分题（唯一方案，V5 位置匹配+原始顺序） */
export const resplitPaper = async (id: string) => {
  const res = await client.post(`/api/papers/${id}/resplit`)
  return res.data
}

/** 阶段二：触发 content分题（唯一方案） */
export const splitPaper = async (id: string) => {
  const res = await client.post(`/api/papers/${id}/split`)
  return res.data
}

/** 试卷图片资源库条目 */
export interface PaperImageItem {
  path: string
  filename: string
  size: number
  matched: boolean
  matched_question_no: number | null
  matched_question_id: string | null
}

/** 试卷图片资源库响应 */
export interface PaperImagesResponse {
  images: PaperImageItem[]
  total: number
  matched_count: number
  orphan_count: number
  orphan: string[]
}

/** 获取试卷全部图片（含未匹配） */
export const getPaperImages = async (id: string) => {
  const res = await client.get<PaperImagesResponse>(`/api/papers/${id}/images`)
  return res.data
}

/** 表格-题目关联校验单条记录 */
export interface TableMismatchItem {
  type: "missing_in_db" | "extra_in_db" | "wrong_owner"
  table_img: string | null
  table_doc_idx: number
  expected_question_no: number | null
  actual_question_no: number | null
  page: number
  description: string
}

/** 表格-题目关联校验响应 */
export interface TableMatchingReport {
  ok: boolean
  total_questions: number
  total_tables: number
  mismatches: TableMismatchItem[]
  auto_fixed: boolean
  fixed_count: number
  message: string
}

/**
 * 验证试卷的表格-题目关联是否正确
 * @param id 试卷 ID
 * @param autoFix 是否自动修复（默认 false，仅报告）
 */
export const verifyTableMatching = async (
  id: string,
  autoFix = false,
) => {
  const res = await client.get<TableMatchingReport>(
    `/api/papers/${id}/verify-table-matching`,
    { params: { auto_fix: autoFix } },
  )
  return res.data
}
