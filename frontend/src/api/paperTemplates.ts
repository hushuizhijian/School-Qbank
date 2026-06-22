/**
 * 试卷范例 API（阶段5：范例功能）
 *
 * 功能：与后端 /api/paper-templates 交互
 *       - 列表：拉取当前用户的全部范例
 *       - 创建：把当前作业的格式信息保存为命名范例
 *       - 删除：删除指定范例
 *       - 应用：把范例的格式信息一键导入到指定作业
 * 使用场景：作业组卷工作台"范例"功能
 */
import client from "./client"
import type { HomeworkPageConfig } from "@/types/homework"

/** 试卷范例 */
export interface PaperTemplate {
  id: string
  name: string
  description: string | null
  /** 试卷格式信息（纸张/页眉/Logo/水印/页脚/字号等） */
  page_config: HomeworkPageConfig | null
  created_at: string
  updated_at: string
}

/** 范例列表响应 */
export interface PaperTemplateListResp {
  templates: PaperTemplate[]
  total: number
}

/**
 * 拉取当前用户的全部范例
 *
 * 输入参数：无
 * 返回值：{ templates, total }
 * 使用场景：组卷工作台下方范例列表
 */
export const getPaperTemplates = async () => {
  const res = await client.get<PaperTemplateListResp>("/api/paper-templates")
  return res.data
}

/**
 * 把当前作业的格式信息保存为命名范例
 *
 * 输入参数：name - 范例名称；page_config - 当前作业的 page_config；description - 范例说明（可选）
 * 返回值：新创建的 PaperTemplate
 * 使用场景：组卷工作台"保存"左侧的"范例"按钮
 */
export const createPaperTemplate = async (data: {
  name: string
  description?: string
  page_config: HomeworkPageConfig
}) => {
  const res = await client.post<PaperTemplate>("/api/paper-templates", data)
  return res.data
}

/**
 * 删除指定范例
 *
 * 输入参数：templateId - 范例 ID
 * 返回值：{ message }
 * 使用场景：范例列表中的"删除"按钮
 */
export const deletePaperTemplate = async (templateId: string) => {
  const res = await client.delete(`/api/paper-templates/${templateId}`)
  return res.data
}

/**
 * 把范例的格式信息一键导入到指定作业
 *
 * 输入参数：templateId - 范例 ID；homeworkId - 目标作业 ID
 * 返回值：{ message, page_config }
 * 使用场景：范例列表中的"应用到当前作业"按钮
 */
export const applyPaperTemplate = async (templateId: string, homeworkId: string) => {
  const res = await client.post(`/api/paper-templates/${templateId}/apply/${homeworkId}`)
  return res.data
}
