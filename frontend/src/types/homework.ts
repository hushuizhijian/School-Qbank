/**
 * 作业类型定义 — V2 组卷版
 *
 * 功能：定义组卷页所需的全部数据类型，包括作业基本信息、题目项、页面配置
 * 输入参数：无（仅类型）
 * 返回值：导出 TypeScript 类型
 * 使用场景：组卷页、作业列表、PDF 导出等
 */

/** 作业中的题目项 */
export interface HomeworkQuestionItem {
  id: string
  question_id: string
  sort_order: number
  score: number
  is_required: boolean
  stem: string
  question_type: string
  question_no: number
  options: Array<{ label?: string; text?: string; content?: string }> | string[]
  answer: string | null
}

/**
 * 作业页面配置（页眉/页脚/水印/logo 等）
 *
 * 新增字段（阶段4：页眉/Logo 独立可拖拽）：
 *  - header_box / logo_box: 元素在画布中的位置与大小
 *    坐标系：相对画布纸张左上角，单位 px（已含 scale 缩放）
 *    x/y: 元素左上角坐标
 *    width/height: 元素宽高
 *    show: 是否显示（不填则视为 true）
 */
export interface HomeworkPageConfig {
  paper_size?: "A3" | "A4"
  header_text?: string
  header_font_size?: number
  /** 页眉文字的位置与大小（独立可拖拽元素） */
  header_box?: ElementBox
  footer_text?: string
  footer_font_size?: number
  watermark_text?: string
  watermark_opacity?: number
  watermark_angle?: number
  watermark_size?: number
  logo_url?: string
  logo_width?: number
  /** Logo 位置与大小（独立可拖拽 + 等比缩放） */
  logo_box?: ElementBox
  /** 试卷标题的位置与大小（独立可拖拽元素，可在 A4 画布上自由移动） */
  title_box?: ElementBox
  question_font_size?: number
  title_font_size?: number
  info_font_size?: number
  show_subject_grade?: boolean
  show_name_class?: boolean
  /** 需求 3：每道题用户手动添加的留白行数映射（key = homework_questions.id） */
  blank_lines?: Record<string, number>
}

/**
 * 元素在画布中的位置与大小
 *
 * 输入参数：
 *  - x/y - 左上角坐标（相对画布纸张，单位 px）
 *  - width/height - 元素宽高
 *  - z_index - 图层层级（数值越大越靠上，相同则按 logo_box < header_box 顺序）
 *  - show - 是否显示（默认 true）
 *  - locked - 是否锁定（默认 false，锁定后不可拖动/缩放）
 * 使用场景：Photoshop 式图层系统的页眉/Logo 独立可拖拽元素
 */
export interface ElementBox {
  x: number
  y: number
  width: number
  height: number
  /** 图层层级（数值越大越靠上层）；不填则按默认顺序：标题<页眉<水印<Logo */
  z_index?: number
  /** 是否显示（默认 true） */
  show?: boolean
  /** 是否锁定（默认 false）；锁定后不可拖动/缩放/编辑 */
  locked?: boolean
}

/** 作业 */
export interface Homework {
  id: string
  title: string
  subject: string | null
  grade: string | null
  total_score: number
  status: string
  page_config: HomeworkPageConfig | null
  created_at: string | null
  updated_at: string | null
  questions: HomeworkQuestionItem[]
}
