/**
 * 分页估算工具 — 根据题目内容估算其在 A4 纸张上的占用高度
 *
 * 功能：粗略估算每道题在指定纸张上占用的纵向空间（mm）
 *       用于在前端做实时分页预览，确保 1:1 映射到 PDF
 * 输入参数：question - 题目对象；options - 估算配置
 * 返回值：占用高度（mm）
 *
 * 估算策略（与 PDF 导出保持一致）：
 *  - 题号 + 题干：按"每 25 字 / 行"估算，最少 2 行
 *  - 选项：每项 1 行（两列布局下也按 1 行/项）
 *  - 配图：按图片数 × 25mm（最保守估计）
 *  - 留白行：每行 = line_height mm
 *  - 题间间距：6mm
 *
 * 重要：此处估算与 pdf_export_service.py 中保持一致的逻辑（line_height = fontSize + 4）
 */
import type { Question } from "@/types/question"

export interface EstimateOptions {
  /** 纸张大小（A4 / A3） */
  paperSize: "A3" | "A4"
  /** 题目正文字号（pt/mm 单位，跟 PDF 一样用 point） */
  questionFontSize: number
  /** 用户手动添加的留白行数 */
  blankLines: number
}

/**
 * 把 mm 转换为"画布上的行数"（用于前端 Canvas 渲染时的同步估算）
 * 输入参数：mm 数
 * 返回值：px 数（96dpi 下的 1mm = 3.78px）
 */
export function mmToPx(mm: number): number {
  return mm * 3.7795275591
}

/**
 * 估算单道题的占用高度（mm）
 * 输入参数：question - 题目；options - 配置
 * 返回值：mm
 */
export function estimateQuestionHeight(question: Question, options: EstimateOptions): number {
  const { paperSize, questionFontSize, blankLines } = options
  // 行高（与 PDF 一致：fontSize + 4）
  const lineHeight = questionFontSize + 4

  // 单列/双列宽度
  // A4: 单列全宽 ~168mm; A3: 双列每列 ~126.5mm
  // 这里给一个保守的"每行字数"估算
  const charsPerLine = paperSize === "A3" ? 24 : 32

  // 题干字符数（去除 HTML/LaTeX 标记后）
  const stemText = stripHtmlLatex(question.stem || "")
  // 题号占 1 行
  const qnoLines = 1
  // 题干按"每行 charsPerLine 字"切分
  const stemLines = Math.max(1, Math.ceil(stemText.length / charsPerLine))
  // 选项行数：每项 1 行（最保守）
  let optionLines = 0
  if (question.options && Array.isArray(question.options) && question.options.length > 0) {
    optionLines = (question.options as unknown[]).length
  }
  // 配图：每张 25mm
  const imageLines = (question.images?.length ?? 0) * 25
  // 留白行
  const blankH = blankLines * lineHeight
  // 题间间距
  const gap = 6

  // 总高度 = 题号行 + 题干行 + 选项行 + 配图 + 留白 + 间距
  return (qnoLines + stemLines + optionLines) * lineHeight + imageLines + blankH + gap
}

/**
 * 简单去除 HTML/LaTeX 标记，返回纯文本字符数
 * 输入参数：html - 原始 HTML
 * 返回值：纯文本
 */
function stripHtmlLatex(html: string): string {
  if (!html) return ""
  return html
    .replace(/<img[^>]*>/gi, "[图]")
    .replace(/\$\$[\s\S]*?\$\$/g, "[公式]")
    .replace(/\$[^$]*\$/g, "[公式]")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim()
}

/**
 * 估算封面区高度（标题 + 学科年级 + 姓名班级 + 分隔线）
 * 输入参数：hasCover - 是否有封面；titleFontSize - 标题字号；
 *          infoFontSize - 信息栏字号；showNameClass - 是否显示姓名班级；
 *          showSubjectGrade - 是否显示学科年级行
 * 返回值：mm
 */
export function estimateCoverHeight(
  hasCover: boolean,
  titleFontSize: number,
  infoFontSize: number,
  showNameClass: boolean,
  showSubjectGrade: boolean,
): number {
  if (!hasCover) return 0
  let h = 0
  // 标题
  h += titleFontSize + 4
  // 学科年级第一行
  h += infoFontSize + 6
  // 姓名班级
  if (showNameClass) h += infoFontSize + 6
  // 学科年级第二行
  if (showSubjectGrade) h += infoFontSize * 0.9 + 6
  // 分隔线 + 间距
  h += 8
  return h
}

/**
 * 把题目按可用高度分页（A4 单列 / A3 双列）
 *
 * 输入参数：
 *  - items: 题目项（包含 hqId/question/score/blankLines）
 *  - paperSize: 纸张大小
 *  - fontSizes: 各类字号
 *  - pageConfig: 页面配置（含标题/信息栏字号等）
 * 返回值：分页结果 — 每个分页含 { pageIndex, columnItems: [{hqId, question, score, blankLines}] }
 *
 * 关键点：
 *  - A4 单列：单页单列，超出换页
 *  - A3 双列：单页双列，先填左列再填右列；都满则换页
 *  - 估算高度与 pdf_export_service.py 保持一致
 */
export interface PaginationItem {
  hqId: string
  question: Question
  score: number
  blankLines: number
}

export interface PaginationPage {
  /** 页码（从 1 开始） */
  pageIndex: number
  /** 该页各列的题目列表（A4 单列时只有 left） */
  columns: PaginationItem[][]
}

export interface PaginationInput {
  items: PaginationItem[]
  paperSize: "A3" | "A4"
  questionFontSize: number
  titleFontSize: number
  infoFontSize: number
  showNameClass: boolean
  showSubjectGrade: boolean
  hasCover: boolean
}

export function paginateQuestions(input: PaginationInput): PaginationPage[] {
  const { items, paperSize, questionFontSize, titleFontSize, infoFontSize, showNameClass, showSubjectGrade, hasCover } = input

  // 纸张可用高度（mm）
  // A4: 297 - 20 (上) - 15 (下) = 262mm
  // A3: 420 - 22 - 18 = 380mm
  const paperH = paperSize === "A3" ? 420 : 297
  const marginT = paperSize === "A3" ? 22 : 20
  const marginB = paperSize === "A3" ? 18 : 15
  const usableH = paperH - marginT - marginB

  // 封面占用
  const coverH = estimateCoverHeight(hasCover, titleFontSize, infoFontSize, showNameClass, showSubjectGrade)
  // 首列起始可用高度
  const colH = usableH - coverH

  // 估算单题高度
  const estOpts = { paperSize, questionFontSize, blankLines: 0 }

  // 分页结果
  const pages: PaginationPage[] = []
  let currentPage: PaginationPage = {
    pageIndex: 1,
    columns: paperSize === "A3" ? [[], []] : [[]],
  }
  let colHeights: number[] = paperSize === "A3" ? [colH, colH] : [colH]
  // 首列扣除封面高度
  if (paperSize === "A3") colHeights[0] -= coverH
  else colHeights[0] -= coverH

  const pushToPage = () => {
    if (currentPage.columns.some((c) => c.length > 0)) {
      pages.push(currentPage)
    }
    currentPage = {
      pageIndex: pages.length + 1,
      columns: paperSize === "A3" ? [[], []] : [[]],
    }
    colHeights = paperSize === "A3" ? [usableH, usableH] : [usableH]
  }

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    // 估算该题占用高度（带实际 blankLines）
    const itemOpts = { ...estOpts, blankLines: it.blankLines }
    const h = estimateQuestionHeight(it.question, itemOpts)

    // 选一列：单列就是 [0]；双列先填 0，满则填 1，都满则换页
    let targetCol = 0
    if (paperSize === "A3") {
      if (colHeights[0] >= h) {
        targetCol = 0
      } else if (colHeights[1] >= h) {
        targetCol = 1
      } else {
        // 都不够，开新页
        pushToPage()
        targetCol = 0
      }
    } else {
      if (colHeights[0] < h) {
        pushToPage()
        targetCol = 0
      }
    }

    currentPage.columns[targetCol].push(it)
    colHeights[targetCol] -= h
  }

  // 收尾：把最后一页加入
  if (currentPage.columns.some((c) => c.length > 0)) {
    pages.push(currentPage)
  }

  // 修正 pageIndex（确保从 1 连续递增）
  pages.forEach((p, i) => {
    p.pageIndex = i + 1
  })

  // 确保至少有一页
  if (pages.length === 0) {
    pages.push({
      pageIndex: 1,
      columns: paperSize === "A3" ? [[], []] : [[]],
    })
  }

  return pages
}
