/** 知识点类型定义 */

/** 知识点 */
export interface KnowledgePoint {
  id: string
  name: string
  code: string
  parent_id: string | null
  level: number
  subject: string
  grade: string | null
  semester: string | null
  sort_order: number
  description: string | null
  children_count: number
  question_count: number
}

/** 知识点树响应 */
export interface KnowledgeTreeResponse {
  tree: KnowledgePoint[]
}

/** 知识点搜索结果 */
export interface KnowledgeSearchResult {
  id: string
  name: string
  code: string
  parent_id: string | null
  level: number
  path: string[]
}

/** 知识点按 ID 获取的响应（智能创建/查找通用） */
export interface KnowledgeDetail {
  id: string
  name: string
  parent_id: string | null
  subject: string
  parent_name?: string | null
  is_new?: boolean
  fuzzy_matched?: boolean
}
