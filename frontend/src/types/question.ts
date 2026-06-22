/** 题目类型定义 — V2 增强版 */

/** 知识点简要信息 */
export interface KnowledgePointItem {
  id: string
  name: string       // 中文名称
  code: string       // 内部编码
  level: number
}

/** 题目 */
export interface Question {
  id: string
  paper_id: string | null
  question_no: number

  // 三区内容
  stem: string
  options: unknown[]
  answer: string | null
  analysis: string | null

  // 图表
  images: string[]
  tikz_code: string | null
  figure_type: string
  boundary: Record<string, unknown> | null
  latex_source: string | null    // MinerU 输出的 LaTeX 源码

  // 属性
  question_type: string
  // 旧版难度（兼容历史数据）：simple / medium / hard
  difficulty: string
  // AI 自动打的难度：0.1~1.0 小数（0.1=最简单，1.0=最难）
  ai_difficulty: number | null
  // 用户手动打的难度：0.1~1.0 小数（可空，未打分时为 NULL）
  user_difficulty: number | null
  score: number | null

  // 状态
  question_status: string
  in_bank: boolean
  is_favorite: boolean

  // 来源信息
  source_paper_name: string | null
  source_year: string | null
  source_region: string | null
  has_figure: boolean
  has_formula: boolean
  has_table: boolean
  has_warning: boolean

  // 知识点（中文展示）
  knowledge_points: KnowledgePointItem[]

  // 时间戳
  created_at: string | null
  updated_at: string | null
}

/** 题库列表响应 */
export interface BankQuestionListResponse {
  items: Question[]
  total: number
  page: number
  page_size: number
  facets?: {
    question_types: { value: string; count: number }[]
    difficulties: { value: string; count: number }[]
    grades: { value: string; count: number }[]
    knowledge_points: { id: string; name: string; count: number }[]
  }
}

/** 题目更新请求 */
export interface QuestionUpdateRequest {
  stem?: string
  options?: unknown[]
  answer?: string | null
  analysis?: string | null
  images?: string[]
  question_type?: string
  difficulty?: string
  // AI / 用户难度（0.1~1.0 小数）
  ai_difficulty?: number | null
  user_difficulty?: number | null
  score?: number | null
  source_year?: string | null
  source_region?: string | null
  question_status?: string
  in_bank?: boolean
  is_favorite?: boolean
  has_figure?: boolean
  has_formula?: boolean
  has_table?: boolean
  question_no?: number
  latex_source?: string | null
}
