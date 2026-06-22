/**
 * 导出 API
 *
 * 功能：与后端 /api/exports 交互
 *       - 列表：拉取当前用户全部导出记录
 *       - 下载：按 export_id 下载对应 PDF
 *       - 删除：按 export_id 删除记录
 *       - 旧版：exportPdf / exportProofreading / getExportStatus 保留
 * 使用场景：PDF 导出记录管理
 */
import client from "./client"

/** 导出记录 */
export interface ExportRecord {
  id: string
  user_id: string
  homework_id: string
  title: string
  page_size: string
  file_path: string | null
  created_at: string
}

/** 导出记录列表响应 */
export interface ExportListResponse {
  items: ExportRecord[]
  total: number
}

/** 导出 PDF（作业/试卷） */
export const exportPdf = async (homeworkId?: string, paperId?: string) => {
  const res = await client.post("/api/exports/pdf", { homework_id: homeworkId, paper_id: paperId })
  return res.data
}

/** 导出校对稿（按试卷ID生成校对稿PDF） */
export const exportProofreading = async (paperId: string) => {
  const res = await client.post("/api/exports/proofreading", { paper_id: paperId })
  return res.data
}

/** 导出记录列表 */
export const getExports = async (): Promise<ExportListResponse> => {
  const res = await client.get<ExportListResponse>("/api/exports")
  return res.data
}

/** 下载导出文件（返回Blob） */
export const downloadExport = async (id: string): Promise<Blob> => {
  const res = await client.get<Blob>(`/api/exports/${id}/download`, { responseType: "blob" })
  return res.data
}

/** 删除单条导出记录 */
export const deleteExport = async (id: string): Promise<{ message: string }> => {
  const res = await client.delete<{ message: string }>(`/api/exports/${id}`)
  return res.data
}

/** 查询导出状态 */
export const getExportStatus = async (id: string) => {
  const res = await client.get(`/api/exports/${id}/status`)
  return res.data
}
