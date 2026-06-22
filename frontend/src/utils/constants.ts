/** 全局常量定义 */

/** 6 种标准题型（与产品要求对齐：选择/填空/判断/计算/操作/解决问题） */
export const STANDARD_QUESTION_TYPES = [
  "choice",          // 1. 选择（含单选、多选）
  "fill_blank",      // 2. 填空
  "true_false",      // 3. 判断
  "calculation",     // 4. 计算
  "operation",       // 5. 操作
  "application",     // 6. 解决问题（含解答题、应用题）
] as const

/** 标准题型 key 联合类型 */
export type StandardQuestionType = typeof STANDARD_QUESTION_TYPES[number]

/**
 * 题型映射 — 6 种主键 + 兼容旧数据
 *
 * 6 种主键（前端下拉默认展示）：
 *   1. choice         选择
 *   2. fill_blank     填空
 *   3. true_false     判断
 *   4. calculation    计算
 *   5. operation      操作
 *   6. application    解决问题
 *
 * 兼容旧 key（数据库中可能已存在，前端不展示但能识别）：
 *   single_choice / multi_choice / single  → 选择
 *   fill / judge / calc / operate          → 对应新 key
 *   solution / general                     → 解决问题
 */
export const QUESTION_TYPE_MAP: Record<string, string> = {
  // ===== 标准 6 种（主键） =====
  choice: "选择",
  fill_blank: "填空",
  true_false: "判断",
  calculation: "计算",
  operation: "操作",
  application: "解决问题",
  // ===== 兼容旧数据（合并到对应新 key） =====
  single_choice: "选择",
  multi_choice: "选择",
  single: "选择",
  fill: "填空",
  judge: "判断",
  calc: "计算",
  operate: "操作",
  solution: "解决问题",
  general: "解决问题",
}

/** 题型标签配色（6 种标准 + 旧数据兜底） */
export const QUESTION_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  // 6 种标准配色
  choice: { bg: "bg-blue-100", text: "text-blue-700" },          // 选择
  fill_blank: { bg: "bg-cyan-100", text: "text-cyan-700" },      // 填空
  true_false: { bg: "bg-amber-100", text: "text-amber-700" },    // 判断
  calculation: { bg: "bg-green-100", text: "text-green-700" },   // 计算
  operation: { bg: "bg-purple-100", text: "text-purple-700" },   // 操作
  application: { bg: "bg-indigo-100", text: "text-indigo-700" }, // 解决问题
  // 兼容旧数据（沿用主键的配色）
  single_choice: { bg: "bg-blue-100", text: "text-blue-700" },
  multi_choice: { bg: "bg-blue-100", text: "text-blue-700" },
  fill: { bg: "bg-cyan-100", text: "text-cyan-700" },
  judge: { bg: "bg-amber-100", text: "text-amber-700" },
  calc: { bg: "bg-green-100", text: "text-green-700" },
  operate: { bg: "bg-purple-100", text: "text-purple-700" },
  solution: { bg: "bg-indigo-100", text: "text-indigo-700" },
  single: { bg: "bg-blue-100", text: "text-blue-700" },
  general: { bg: "bg-slate-100", text: "text-slate-600" },
}

/** 难度映射 — 5级难度（与设计文档3.3.2对齐） */
export const DIFFICULTY_MAP: Record<string, string> = {
  "1": "Lv.1 简单",
  "2": "Lv.2 基础",
  "3": "Lv.3 中等",
  "4": "Lv.4 较难",
  "5": "Lv.5 困难",
  // 兼容旧数据
  simple: "Lv.1 简单",
  medium: "Lv.3 中等",
  hard: "Lv.5 困难",
}

/** 难度等级定义（滑块用） */
export const DIFFICULTY_LEVELS = [
  { value: 1, label: "Lv.1 简单", color: "#4CAF50" },
  { value: 2, label: "Lv.2 基础", color: "#8BC34A" },
  { value: 3, label: "Lv.3 中等", color: "#FFC107" },
  { value: 4, label: "Lv.4 较难", color: "#FF9800" },
  { value: 5, label: "Lv.5 困难", color: "#F44336" },
] as const

/** 难度标签配色 */
export const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  "1": { bg: "bg-green-100", text: "text-green-700" },
  "2": { bg: "bg-lime-100", text: "text-lime-700" },
  "3": { bg: "bg-yellow-100", text: "text-yellow-700" },
  "4": { bg: "bg-orange-100", text: "text-orange-700" },
  "5": { bg: "bg-red-100", text: "text-red-700" },
  // 兼容旧数据
  simple: { bg: "bg-green-100", text: "text-green-700" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700" },
  hard: { bg: "bg-red-100", text: "text-red-700" },
}

/** 年级列表 */
export const GRADES = [
  "一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
]

/** 学期列表 */
export const SEMESTERS = ["上学期", "下学期"]

/** 试卷类型列表 */
export const PAPER_TYPES = [
  "期末考试", "单元测试", "月考", "期中考试", "专项练习", "模拟考试",
]

/** 教材版本列表 */
export const TEXTBOOK_VERSIONS = [
  "人教版", "北师大版", "苏教版", "浙教版",
]
