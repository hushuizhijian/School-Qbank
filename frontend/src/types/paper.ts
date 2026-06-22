/** 试卷类型定义 */

/** 试卷 */
export interface Paper {
  id: string
  filename: string
  subject: string
  grade: string
  semester: string | null
  region: string | null
  paper_type: string | null
  academic_year: string | null
  version: string | null
  file_path: string
  page_count: number
  total_questions: number
  status: string
  parse_stage: string | null
  parse_progress: Record<string, unknown> | null
  parse_config: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
}

/** 校对统计 */
export interface ProofreadingStats {
  total: number
  pending: number
  normal: number
  error: number
  missing_knowledge: number
  with_figure: number
  with_table: number
  by_type: Record<string, number>
  quality_checks: {
    empty_stem: string[]
    missing_answer: string[]
    missing_kp: string[]
    missing_type: string[]
  }
}
