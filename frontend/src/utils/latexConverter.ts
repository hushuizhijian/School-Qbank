/**
 * LaTeX 转换工具 — Question 数据 ↔ LaTeX 源码 (tasks.sty 格式)
 *
 * 功能：
 *   1. 将 Question 的 stem + options 转换为 tasks.sty 格式的 LaTeX 源码
 *   2. 将 LaTeX 源码解析回 stem + options（编辑后保存）
 *   3. 将 LaTeX 源码转换为可渲染的 HTML/Markdown（供 KaTeX 预览用）
 *
 * 使用场景：DualPaneEditor 左栏显示 LaTeX 源码，右栏渲染预览
 *
 * ===== 选择题选项剥离规则 =====
 * 问题：VLM解析选择题时，stem中常包含选项文本（如"A. 1800 B. 1980"），
 *       同时options字段也包含这些选项，导致渲染时出现两组选项。
 * 规则：questionToLatex 组装 tasks.sty 格式前，必须从 stem 中剥离选项文本。
 *       剥离模式：
 *       1. "A. xxx  B. xxx  C. xxx  D. xxx" — 标准选项格式（点号分隔）
 *       2. "A、xxx  B、xxx  C、xxx  D、xxx" — 中文顿号分隔
 *       3. "A xxx  B xxx  C xxx  D xxx" — 无分隔符格式
 *       4. "A.xxx B.xxx C.xxx D.xxx" — 紧凑格式
 *       剥离时机：仅在选择题（single_choice/multi_choice）且有 options 数据时执行
 *   4. 安全措施：仅当剥离后的stem仍包含实质内容时才应用，避免误删
 */

// KaTeX：用于把 \task 内的数学公式直接渲染为 HTML 字符串嵌入 <td>
// 绕开 react-markdown / remark-math 在 <td> 内部不解析 $...$ 行内公式的问题
// 失败时 throwOnError: false 让 KaTeX 返回原文本 + 红色错误提示，不中断流程
import katex from "katex"

/** 选项数据结构 */
export interface OptionItem {
  label: string  // A / B / C / D
  content: string
}

/** 题型判断 — 选择题集合（含新旧 key 兼容） */
export const CHOICE_TYPES = new Set([
  "choice",          // 新标准 key（统一后的选择）
  "single_choice",   // 兼容旧数据
  "multi_choice",    // 兼容旧数据
  "single",          // 兼容旧数据
])

/**
 * 图片插入位置类型
 *
 * 功能：定义图片在预览中的插入位置
 * 取值：
 *   - 'after-stem': 图片插入在题干之后、选项之前
 *   - 'end': 图片追加在末尾
 * 使用场景：latexToPreview 的 imagePosition 参数
 */
export type ImagePosition = 'after-stem' | 'end'

/**
 * 修复 \includegraphics 提取的 URL
 *
 * 功能：将相对路径补全为完整URL，确保图片可正常加载
 * 输入参数：
 *   - url: 原始URL路径
 * 返回值：补全后的完整URL
 * 使用场景：latexToPreview 处理 \includegraphics 和 images 参数时调用
 *
 * 补全规则：
 *   - http:// 或 https:// 开头 → 原样使用
 *   - /data/ 开头 → 原样使用（Vite代理会处理）
 *   - /images/ 开头 → 改为 /data/images/...
 *   - 其他相对路径 → 改为 /data/images/ + 路径
 */
function fixImageUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url                              // 绝对URL，原样使用
  }
  if (url.startsWith("/data/")) {
    return url                              // Vite代理路径，原样使用
  }
  if (url.startsWith("/images/")) {
    return "/data" + url                    // /images/ → /data/images/
  }
  return "/data/images/" + url              // 其他相对路径 → /data/images/ + 路径
}

/**
 * 提取并保护数学区域
 *
 * 功能：将 $...$ 和 $$...$$ 区域替换为占位符，防止文本模式转换破坏数学公式
 * 输入参数：
 *   - text: 包含数学区域的原始文本
 * 返回值：{ text: 替换后的文本, regions: 原始数学区域数组 }
 * 使用场景：latexToPreview 在执行文本模式转换前调用
 *
 * 保护机制：
 *   - 先匹配 $$...$$（双美元符号），再匹配 $...$（单美元符号）
 *   - 占位符格式：\x00MATH{n}\x00（n为序号）
 *   - 还原时通过序号找回原始内容
 */
function protectMathRegions(text: string): { text: string; regions: string[] } {
  const regions: string[] = []              // 存储原始数学区域内容

  // 先保护 $$...$$（双美元符号，优先匹配避免被单美元符号截断）
  let result = text.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
    const index = regions.length            // 当前占位符序号
    regions.push(match)                    // 存储原始内容
    return `\x00MATH${index}\x00`          // 替换为占位符
  })

  // 再保护 $...$（单美元符号）
  result = result.replace(/\$([^\$]+?)\$/g, (match) => {
    const index = regions.length            // 当前占位符序号
    regions.push(match)                    // 存储原始内容
    return `\x00MATH${index}\x00`          // 替换为占位符
  })

  return { text: result, regions }
}

/**
 * 还原数学区域
 *
 * 功能：将占位符替换回原始数学区域内容
 * 输入参数：
 *   - text: 包含占位符的文本
 *   - regions: 原始数学区域数组
 * 返回值：还原后的完整文本
 * 使用场景：latexToPreview 在文本模式转换完成后调用
 */
function restoreMathRegions(text: string, regions: string[]): string {
  return text.replace(/\x00MATH(\d+)\x00/g, (_, indexStr) => {
    const index = parseInt(indexStr, 10)    // 解析占位符序号
    return regions[index]                   // 还原为原始数学内容
  })
}

/**
 * 对非数学区域应用文本模式转换
 *
 * 功能：将LaTeX文本命令转换为Markdown/Unicode等效表示
 * 输入参数：
 *   - text: 已保护数学区域的文本（数学区域已被占位符替换）
 * 返回值：转换后的文本
 * 使用场景：latexToPreview 在保护数学区域后调用
 *
 * 转换规则：
 *   - \text{...} → 直接显示内容
 *   - \textbf{...} → **...**（加粗）
 *   - \emph{...} / \textit{...} → *...*（斜体）
 *   - \underline{...} → <u>...</u>（下划线）
 *   - 数学符号 → Unicode字符（×、÷、≠ 等）
 *   - 间距命令 → 空格
 *   注意：\frac 不做转换，由KaTeX渲染
 */
function applyTextModeConversions(text: string): string {
  let result = text

  // 文本命令转换
  result = result.replace(/\\text\{([^}]*)\}/g, "$1")         // \text{...} → 内容
  result = result.replace(/\\textbf\{([^}]*)\}/g, "**$1**")   // \textbf{...} → **...**
  result = result.replace(/\\emph\{([^}]*)\}/g, "*$1*")       // \emph{...} → *...*
  result = result.replace(/\\textit\{([^}]*)\}/g, "*$1*")     // \textit{...} → *...*
  result = result.replace(/\\underline\{([^}]*)\}/g, "<u>$1</u>") // \underline{...} → <u>...</u>

  // 数学符号转换（文本模式下转为Unicode，数学模式下由KaTeX渲染）
  result = result.replace(/\\times/g, "×")                    // 乘号
  result = result.replace(/\\div/g, "÷")                      // 除号
  result = result.replace(/\\neq/g, "≠")                      // 不等于
  result = result.replace(/\\leq/g, "≤")                      // 小于等于
  result = result.replace(/\\geq/g, "≥")                      // 大于等于
  result = result.replace(/\\approx/g, "≈")                   // 约等于
  result = result.replace(/\\degree/g, "°")                   // 度
  result = result.replace(/\\circ/g, "°")                     // 圈（度）
  result = result.replace(/\\perp/g, "⊥")                     // 垂直
  result = result.replace(/\\parallel/g, "∥")                 // 平行
  result = result.replace(/\\angle/g, "∠")                    // 角

  // 间距命令转换
  result = result.replace(/\\quad/g, "  ")                    // \quad → 两空格
  result = result.replace(/\\qquad/g, "    ")                 // \qquad → 四空格
  result = result.replace(/\\,/g, " ")                        // \, → 一空格
  result = result.replace(/\\;/g, " ")                        // \; → 一空格
  result = result.replace(/\\!/g, "")                         // \! → 无空格

  return result
}

/**
 * 从题干中剥离选项文本
 *
 * 功能：识别并移除stem末尾的选项模式，避免与tasks.sty选项重复
 * 输入参数：
 *   - stem: 原始题干文本
 *   - options: 选项数组（用于验证剥离结果）
 * 返回值：剥离选项后的题干文本
 * 使用场景：questionToLatex 组装前调用
 *
 * 剥离规则：
 *   - 匹配 stem 末尾的 "A. xxx B. xxx C. xxx D. xxx" 等选项模式
 *   - 仅当剥离后stem仍有实质内容（长度>2）时才应用
 *   - 支持多种选项格式：点号、顿号、无分隔符
 */
export function stripOptionsFromStem(stem: string, options: unknown[]): string {
  if (!stem || !options || options.length === 0) return stem || ""

  // 模式1: "A. xxx  B. xxx  C. xxx  D. xxx" 或 "A.xxx B.xxx C.xxx D.xxx"
  // 模式2: "A、xxx  B、xxx  C、xxx  D、xxx"
  // 模式3: "A xxx  B xxx  C xxx  D xxx"（选项字母后直接跟内容）
  // 匹配从 A 开始到 D 结束的连续选项块
  const optionPatterns = [
    // A. / A、 / A 后跟内容，然后 B. / B、 / B 后跟内容，依此类推
    /[A-D][.、．]\s*\S.*?[A-D][.、．]\s*\S.*?[A-D][.、．]\s*\S.*?[A-D][.、．]\s*\S.*/s,
    // A 后直接跟内容（无分隔符），空格分隔选项
    /\bA\s+\S+(?:\s+B\s+\S+(?:\s+C\s+\S+(?:\s+D\s+\S+)?)?)?/s,
  ]

  let cleaned = stem

  for (const pattern of optionPatterns) {
    // 从stem末尾开始匹配，尝试剥离
    const match = cleaned.match(pattern)
    if (match && match.index !== undefined) {
      const before = cleaned.substring(0, match.index).trim()
      // 安全检查：剥离后stem仍有实质内容
      if (before.length > 2) {
        cleaned = before
        break                               // 匹配到一个模式即停止
      }
    }
  }

  return cleaned
}

/**
 * 将 Question 数据转换为 LaTeX 源码
 *
 * 选择题格式（使用 tasks.sty）：
 * 题干内容（已剥离选项）
 * \begin{tasks}(4)
 * \task 选项A内容
 * \task 选项B内容
 * \task 选项C内容
 * \task 选项D内容
 * \end{tasks}
 *
 * 注意：\begin{task} 不是 tasks 宏包提供的环境，正确的环境名是 tasks。
 *       直接使用 \begin{tasks}(N)，不需要外层再套 \begin{task}。
 *       \begin{tasks}(4) → 4列1行排布
 *       \begin{tasks}(2) → 2列2行排布
 *
 * 非选择题格式：
 * 题干内容（原样输出）
 *
 * @param stem - 题干内容
 * @param options - 选项数组（选择题才有）
 * @param questionType - 题型
 * @returns LaTeX 源码字符串
 */
export function questionToLatex(
  stem: string,
  options: unknown[],
  questionType: string
): string {
  if (!CHOICE_TYPES.has(questionType) || !options || options.length === 0) {
    // 非选择题或无选项，直接返回题干
    return stem || ""
  }

  // 选择题：先从stem中剥离选项文本，再组装 tasks.sty 格式
  const cleanStem = stripOptionsFromStem(stem || "", options)

  // 根据选项数量决定列数：4选项→4列1行，2-3选项→对应列数，5+选项→2列多行
  const optionCount = options.length
  const columns = optionCount <= 4 ? optionCount : 2

  const lines: string[] = []
  lines.push(cleanStem)                                    // 题干内容
  lines.push(`\\begin{tasks}(${columns})`)                 // 直接使用tasks环境，指定列数

  // 解析选项
  const parsedOptions = parseOptions(options)
  for (const opt of parsedOptions) {
    lines.push(`\\task ${opt.content}`)
  }

  lines.push("\\end{tasks}")

  return lines.join("\n")
}

/**
 * 解析选项数据
 * 支持多种格式：
 *   - string[]: ["选项A", "选项B", "选项C", "选项D"]
 *   - {label, content}[]: [{label: "A", content: "选项A"}, ...]
 *   - {A: "...", B: "...", ...}: 对象格式
 */
export function parseOptions(options: unknown[]): OptionItem[] {
  if (!options || options.length === 0) return []

  const labels = ["A", "B", "C", "D", "E", "F", "G", "H"]
  const result: OptionItem[] = []

  for (let i = 0; i < options.length; i++) {
    const opt = options[i]

    if (typeof opt === "string") {
      // 纯字符串格式
      result.push({ label: labels[i] || String(i + 1), content: opt })
    } else if (opt && typeof opt === "object") {
      const obj = opt as Record<string, unknown>
      if (obj.label && obj.content) {
        // {label, content} 格式
        result.push({
          label: String(obj.label),
          content: String(obj.content),
        })
      } else {
        // 尝试从 A/B/C/D 键提取
        const label = labels[i] || String(i + 1)
        const content = obj[label] || obj.content || obj.text || String(obj)
        result.push({ label, content: String(content) })
      }
    }
  }

  return result
}

/**
 * 将 LaTeX 源码解析回 stem + options
 *
 * 识别两种 tasks.sty 格式：
 *   新格式（推荐）：题干 \begin{tasks}(4) \task ... \end{tasks}
 *   旧格式（兼容）：\begin{task} 题干 \begin{tasks}(4) \task ... \end{tasks} \end{task}
 *
 * @param latex - LaTeX 源码
 * @param questionType - 题型
 * @returns { stem, options }
 */
export function latexToQuestion(
  latex: string,
  questionType: string
): { stem: string; options: unknown[] } {
  if (!CHOICE_TYPES.has(questionType)) {
    // 非选择题，直接返回
    return { stem: latex, options: [] }
  }

  // 选择题：尝试解析 tasks.sty 格式
  // 优先匹配旧格式：\begin{task}...\begin{tasks}(N)...\end{tasks}...\end{task}
  const oldFormatMatch = latex.match(
    /\\begin\{task\}\s*([\s\S]*?)\\begin\{tasks\}\(\d+\)\s*([\s\S]*?)\\end\{tasks\}\s*\\end\{task\}/
  )

  if (oldFormatMatch) {
    const stem = oldFormatMatch[1].trim()
    const optionsBlock = oldFormatMatch[2]

    // 解析 \task 选项
    const taskItems = optionsBlock
      .split(/\\task\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const labels = ["A", "B", "C", "D", "E", "F", "G", "H"]
    const options = taskItems.map((content, i) => ({
      label: labels[i] || String(i + 1),
      content,
    }))

    return { stem, options }
  }

  // 新格式：题干 \begin{tasks}(N)...\end{tasks}
  const newFormatMatch = latex.match(
    /([\s\S]*?)\\begin\{tasks\}\(\d+\)\s*([\s\S]*?)\\end\{tasks\}/
  )

  if (newFormatMatch) {
    const stem = newFormatMatch[1].trim()
    const optionsBlock = newFormatMatch[2]

    // 解析 \task 选项
    const taskItems = optionsBlock
      .split(/\\task\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    const labels = ["A", "B", "C", "D", "E", "F", "G", "H"]
    const options = taskItems.map((content, i) => ({
      label: labels[i] || String(i + 1),
      content,
    }))

    return { stem, options }
  }

  // 无法解析 tasks 格式，整体作为 stem
  return { stem: latex, options: [] }
}

/**
 * 将 LaTeX 源码转换为可渲染的 Markdown（供 KaTeX 预览用）
 *
 * 功能：将LaTeX源码转换为ReactMarkdown + KaTeX可渲染的Markdown字符串
 * 输入参数：
 *   - latex: LaTeX 源码
 *   - images: 图片URL列表（可选，用于在预览中显示题目图片）
 *   - imagePosition: 图片插入位置（可选，默认'end'）
 *     'after-stem': 图片插入在题干之后、选项之前
 *     'end': 图片追加在末尾
 * 返回值：可供 ReactMarkdown + KaTeX 渲染的 Markdown 字符串
 * 使用场景：DualPaneEditor 右栏预览渲染
 *
 * 转换规则：
 *   - 旧格式 \begin{task}...\begin{tasks}(N)...\end{tasks}\end{task} → 提取内容
 *   - 新格式 题干 \begin{tasks}(N)...\end{tasks} → 提取题干+选项列表
 *   - \task → 选项标记 (A) (B) (C) (D)，按列数排布
 *   - $...$ 和 $$...$$ → 数学区域保护，保留给 KaTeX 渲染
 *   - \includegraphics[...]{url} → ![](url) 图片（自动补全URL）
 *   - 文本模式LaTeX命令 → 仅在非数学区域转换，数学模式内保留原样
 */
export function latexToPreview(
  latex: string,
  images?: string[],
  imagePosition?: ImagePosition,
  tasksOpts?: TasksRenderOptions,
): string {
  const position: ImagePosition = imagePosition || "end"       // 默认图片位置为末尾
  const opts: TasksRenderOptions = tasksOpts || { showLabels: true, columnGap: "2em" }

  // 修复空内容判断：LaTeX为空但images存在时，仍生成图片Markdown
  if (!latex?.trim()) {
    if (images && images.length > 0) {
      return images.map(url => `![](${fixImageUrl(url)})`).join("\n")  // 仅输出图片
    }
    return ""                               // 无内容也无图片
  }

  let result = latex

  // 1. 处理 \includegraphics[...]{url} → Markdown 图片（修复URL）
  result = result.replace(
    /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g,
    (_, url) => `![](${fixImageUrl(url)})`
  )

  // 2. 处理旧格式 tasks.sty：\begin{task}...\begin{tasks}(N)...\end{tasks}...\end{task}
  let imagesInsertedAfterStem = false       // 标记图片是否已插入题干后
  result = result.replace(
    /\\begin\{task\}\s*([\s\S]*?)\\begin\{tasks\}\((\d+)\)\s*([\s\S]*?)\\end\{tasks\}\s*\\end\{task\}/g,
    (_, stemContent, colCount, optionsContent) => {
      const shouldInsert = position === "after-stem"          // 需要插入在题干后
        && !imagesInsertedAfterStem                           // 尚未插入过
        && !!images && images.length > 0                      // 有图片可插入
      if (shouldInsert) imagesInsertedAfterStem = true        // 标记已插入
      return formatTasksPreview(
        stemContent.trim(),
        colCount,
        optionsContent,
        shouldInsert ? images : undefined,
        opts
      )
    }
  )

  // 3. 处理新格式：题干 \begin{tasks}(N)...\end{tasks}
  result = result.replace(
    /([\s\S]*?)\\begin\{tasks\}\((\d+)\)\s*([\s\S]*?)\\end\{tasks\}/g,
    (_, stemContent, colCount, optionsContent) => {
      const shouldInsert = position === "after-stem"          // 需要插入在题干后
        && !imagesInsertedAfterStem                           // 尚未插入过
        && !!images && images.length > 0                      // 有图片可插入
      if (shouldInsert) imagesInsertedAfterStem = true        // 标记已插入
      return formatTasksPreview(
        stemContent.trim(),
        colCount,
        optionsContent,
        shouldInsert ? images : undefined,
        opts
      )
    }
  )

  // 4. 清理残留的 \begin{task} / \end{task}（非标准格式）
  result = result.replace(/\\begin\{task\}\s*/g, "")
  result = result.replace(/\s*\\end\{task\}/g, "")

  // 5. 清理残留的 \begin{tasks}(...) / \end{tasks}
  result = result.replace(/\\begin\{tasks\}\(\d+\)\s*/g, "")
  result = result.replace(/\s*\\end\{tasks\}/g, "")

  // 6. 处理独立的 \task → 选项标记
  let taskIndex = 0
  const taskLabels = ["A", "B", "C", "D", "E", "F", "G", "H"]
  result = result.replace(/\\task\s+/g, () => {
    const label = taskLabels[taskIndex] || String(taskIndex + 1)
    taskIndex++
    return `**(${label})** `
  })

  // 7. 保护数学区域（$...$ 和 $$...$$），防止文本模式转换破坏公式
  const { text: protectedText, regions: mathRegions } = protectMathRegions(result)

  // 8. 对非数学区域应用文本模式转换
  let converted = applyTextModeConversions(protectedText)

  // 9. 处理 \\ 换行（仅在非数学区域内，数学环境中的 \\ 由KaTeX渲染）
  converted = converted.replace(/\\\\/g, "\n")

  // 10. 还原数学区域
  result = restoreMathRegions(converted, mathRegions)

  // 11. 插入题目图片（根据 imagePosition 决定位置）
  if (images && images.length > 0 && !imagesInsertedAfterStem) {
    const imageMarkdown = images.map(url => `![](${fixImageUrl(url)})`).join("\n")
    if (position === "after-stem") {
      // 在题干后、选项前插入：查找第一个选项标记的位置
      const optionMatch = result.match(/\*\*\(A\)\*\*/)
      if (optionMatch && optionMatch.index !== undefined) {
        const before = result.substring(0, optionMatch.index)  // 选项前内容
        const after = result.substring(optionMatch.index)       // 选项及之后内容
        result = before + "\n\n" + imageMarkdown + "\n" + after // 插入图片
      } else {
        result += "\n\n" + imageMarkdown                       // 无选项标记，追加末尾
      }
    } else {
      result += "\n\n" + imageMarkdown                         // 'end' 模式，追加末尾
    }
  }

  return result
}

/* ========== 选项布局控制代码（tasks 列数）工具函数 ========== */

/**
 * 选项布局模式
 *
 * 功能：定义选项/子题分行的呈现模式，对应 LaTeX 中 \begin{tasks}(N) 的 N 值
 * 取值：
 *   - 'inline': 一行呈现（N=4 或以上，4列1行）
 *   - 'two-row': 两行呈现（N=2，2列2行）
 *   - 'three-row': 三行呈现（N=3，3列3行）
 *   - 'four-row': 四行呈现（N=1，1列4行）
 * 使用场景：校对工作台控制选择题/计算题子题显示模式
 */
export type OptionLayoutMode = "inline" | "two-row" | "three-row" | "four-row"

/**
 * 计算题分列模式
 *
 * 功能：定义计算题子题分列的呈现模式，对应 LaTeX 中 \begin{tasks}(N) 的 N 值
 * 取值：1col / 2col / 3col / 4col / 5col / 6col（N=1~6）
 * 使用场景：校对工作台控制计算题多个子题的列数
 */
export type CalcColumnMode = "1col" | "2col" | "3col" | "4col" | "5col" | "6col"

/**
 * 选项布局模式 → tasks 列数
 *
 * 功能：将选项布局模式映射为 LaTeX 中 \begin{tasks}(N) 的 N 值
 * 输入参数：mode — 选项布局模式
 * 返回值：对应的列数（1/2/3/4）
 * 使用场景：校对工作台切换分行模式时调用
 */
export function layoutModeToColumns(mode: OptionLayoutMode): number {
  switch (mode) {
    case "inline": return 4          // 一行呈现：4列
    case "two-row": return 2         // 两行呈现：2列
    case "three-row": return 3       // 三行呈现：3列
    case "four-row": return 1        // 四行呈现：1列
    default: return 4                // 兜底：4列
  }
}

/**
 * tasks 列数 → 选项布局模式
 *
 * 功能：将 LaTeX 中 \begin{tasks}(N) 的 N 值反推为选项布局模式
 * 输入参数：n — 列数（1/2/3/4/...）
 * 返回值：对应的选项布局模式
 * 使用场景：校对工作台加载时回显当前分行模式
 *
 * 映射规则：
 *   - N >= 4 → 一行呈现
 *   - N == 3 → 三行呈现
 *   - N == 2 → 两行呈现
 *   - N == 1 → 四行呈现
 *   - 其他 → 一行呈现（兜底）
 */
export function columnsToLayoutMode(n: number): OptionLayoutMode {
  if (n >= 4) return "inline"
  if (n === 3) return "three-row"
  if (n === 2) return "two-row"
  return "four-row"
}

/**
 * 从 LaTeX 源码中解析 \begin{tasks}(N) 的列数 N
 *
 * 功能：在 LaTeX 源码中查找 tasks 环境的列数声明
 * 输入参数：latex — LaTeX 源码
 * 返回值：列数 N（找不到则返回 null）
 * 使用场景：校对工作台初始化选项布局控件时调用
 *
 * 匹配模式：
 *   - 支持新旧两种 tasks.sty 格式
 *   - 取最后一次出现的 \begin{tasks}(N)（应对多块场景）
 */
export function getTasksColumn(latex: string | null | undefined): number | null {
  if (!latex) return null

  // 匹配所有 \begin{tasks}(N)，取最后一次
  const matches = latex.match(/\\begin\{tasks\}\(\s*(\d+)\s*\)/g)
  if (!matches || matches.length === 0) return null

  // 取最后一次匹配的列数
  const last = matches[matches.length - 1]
  const colMatch = last.match(/(\d+)/)
  if (!colMatch) return null
  const n = parseInt(colMatch[1], 10)
  return isNaN(n) ? null : n
}

/**
 * 从 LaTeX 源码中提取所有独立 $$...$$ 数学块
 *
 * 功能：用正则提取 LaTeX 源码中所有独占一行的 $$...$$ 块
 *       用于把计算题的多个小题自动包装为 tasks 环境
 * 输入参数：latex — LaTeX 源码
 * 返回值：所有 $$...$$ 块的字符串数组（含外侧 $$ 符号）
 *         若没有则返回空数组
 * 使用场景：setTasksColumn 自动包装计算题子题时调用
 */
function extractMathBlocks(latex: string): string[] {
  if (!latex) return []
  // 匹配所有 $$...$$ 块（含独占一行或多行内容）
  const re = /\$\$[\s\S]*?\$\$/g
  const blocks = latex.match(re) || []
  return blocks.map((b) => b.trim()).filter((b) => b.length > 0)
}

/**
 * 去除 LaTeX 中残留的 A./B./C./D. 选项行
 *
 * 功能：当 LaTeX 中同时包含任务块（\begin{tasks}...）和 A. xxx / B. xxx 行
 *       时，删除这些选项行（视为 tasks 块的重复选项）
 *       解决"使用分行控件后选择题出现两组选项"的问题
 * 输入参数：
 *   - latex — LaTeX 源码
 *   - force — 强制清理（默认 false，仅在已含 \begin{tasks} 时清理）
 *              设为 true 时无视守卫直接清理（用于 setTasksColumn 自动包装分支）
 * 返回值：清理后的 LaTeX 源码
 * 使用场景：setTasksColumn 替换 N / 自动包装时调用
 *
 * 清理规则：
 *   - 匹配独立行 ^[A-D][.．、]\s+...$（行首 A./B./C./D. + 内容）
 *   - 默认要求 LaTeX 中含 \begin{tasks} 块（否则可能是 stem 中的字母）
 *   - force=true 时跳过守卫强制清理（用于【分行】按钮首次包装）
 *   - 清理后压缩多余空行
 */
export function stripChoiceOptionLines(latex: string, force = false): string {
  if (!latex) return latex
  // 默认仅当 LaTeX 中含 tasks 块时才清理（避免误删 stem 中的合法字母）
  // force=true 时跳过守卫（用于首次包装场景）
  if (!force && !/\\begin\{tasks\}/.test(latex)) return latex
  // 匹配行首 A./B./C./D.（含全角句号、顿号）+ 空格 + 内容
  const re = /^[A-D][.．、]\s+[^\n]+$/gm
  const cleaned = latex.replace(re, "")
  // 压缩连续 3+ 个空行为 2 个
  return cleaned.replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * 替换 LaTeX 源码中 \begin{tasks}(N) 的列数（支持自动包装）
 *
 * 功能：将 LaTeX 源码中所有 \begin{tasks}(N) 的 N 替换为新值
 *       若源码中不存在 tasks 环境，则按情况自动包装：
 *         - 选择题 + 有 options → 用 options 包装
 *         - LaTeX 中含多个独立 $$...$$ 块 → 把块包装为 tasks 子项
 * 输入参数：
 *   - latex — 原始 LaTeX 源码
 *   - newColumns — 新的列数（1/2/3/4/...）
 *   - questionType — 题型（决定自动包装策略）
 *   - options — 选项数组（选择题追加 tasks 环境时需要）
 *   - stem — 题干（选择题追加 tasks 环境时需要）
 * 返回值：替换后的 LaTeX 源码
 * 使用场景：校对工作台切换选项/子题布局时调用
 *
 * 行为：
 *   - 存在 tasks 环境 → 替换 N（全局替换，确保所有块同步）
 *   - 不存在 tasks 环境 + 选择题 + 有 options → 用 options 自动包装
 *   - 不存在 tasks 环境 + 含 ≥2 个独立 $$...$$ 块 → 把块包装为 tasks 子项
 *   - 其他情况 → 原样返回
 */
export function setTasksColumn(
  latex: string | null | undefined,
  newColumns: number,
  questionType?: string,
  options?: unknown[],
  stem?: string,
): string {
  const safeLatex = latex || ""

  // 列数合法化（1~8 之间）
  const safeColumns = Math.max(1, Math.min(8, Math.floor(newColumns) || 4))

  // 已存在 tasks 环境：清理重复的 A./B./C./D. 行后全局替换
  if (/\\begin\{tasks\}\(\s*\d+\s*\)/.test(safeLatex)) {
    // 先清理 stem 中残留的 A. xxx / B. xxx / C. xxx / D. xxx 选项行
    // （这些行可能来自旧版工具的自动包装，与 tasks 块重复）
    const cleaned = questionType && CHOICE_TYPES.has(questionType)
      ? stripChoiceOptionLines(safeLatex)
      : safeLatex
    return cleaned.replace(
      /\\begin\{tasks\}\(\s*\d+\s*\)/g,
      `\\begin{tasks}(${safeColumns})`,
    )
  }

  // 没有 tasks 环境：选择题 + 有 options → 用 options 自动包装
  if (questionType && CHOICE_TYPES.has(questionType) && options && options.length > 0) {
    const parsedOptions = parseOptions(options)
    // 题干可能仍含 A./B./C./D. 行（如 stem 是后端存的原始题干）
    // force=true 强制清理，避免与下方生成的 \task 块重复
    const cleanedStem = stripChoiceOptionLines(stem || safeLatex, true)
    const lines: string[] = []
    lines.push(cleanedStem)                              // 清理后的题干
    lines.push(`\\begin{tasks}(${safeColumns})`)         // tasks 环境
    for (const opt of parsedOptions) {
      lines.push(`\\task ${opt.content}`)
    }
    lines.push("\\end{tasks}")
    return lines.join("\n")
  }

  // 没有 tasks 环境：但 LaTeX 中含 ≥2 个独立 $$...$$ 块（计算题等多子题场景）
  // → 把块自动包装为 tasks 子项
  const mathBlocks = extractMathBlocks(safeLatex)
  if (mathBlocks.length >= 2) {
    // 题干 = 第一个块之前的所有文本（可能为空）
    const firstBlock = mathBlocks[0]
    const stemText = safeLatex.substring(0, safeLatex.indexOf(firstBlock)).trim()
    const lines: string[] = []
    if (stemText) lines.push(stemText)              // 保留题干部分
    lines.push(`\\begin{tasks}(${safeColumns})`)   // tasks 环境
    for (const block of mathBlocks) {
      lines.push(`\\task ${block}`)
    }
    lines.push("\\end{tasks}")
    return lines.join("\n")
  }

  // 其他情况：原样返回
  return safeLatex
}

/* ========== 格式化 tasks 选项为预览 Markdown ========== */

/**
 * 提取 \task 内的数学公式内容（去掉 $$...$$ 包裹）
 *
 * 功能：把 `\task $$\n1.2 \times 0.6 =\n$$` 转为 `1.2 \times 0.6 =`
 * 输入参数：item — \task 后的原始内容
 * 返回值：去掉 $$ 包裹并 trim 后的数学内容
 * 使用场景：formatTasksPreview 中需要把内容传给 KaTeX 渲染
 */
function extractMathContent(item: string): string {
  const trimmed = item.trim()                                       // 去除首尾空白
  // 匹配首尾成对的 $$...$$ 包裹（支持多行）
  const match = trimmed.match(/^\$\$([\s\S]*)\$\$$/)
  if (match) return match[1].trim()                                 // 去掉包裹，trim 内部
  return trimmed                                                    // 无包裹原样返回
}

/**
 * 把数学公式字符串用 KaTeX 渲染为 HTML 字符串
 *
 * 功能：在 formatTasksPreview 中调用，让 \task 内的公式直接渲染为 KaTeX HTML
 *       嵌入 <td>，绕开 react-markdown / remark-math 在表格内不解析 $...$ 的限制
 * 输入参数：formula — 数学公式字符串
 * 返回值：KaTeX 渲染后的 HTML 字符串（displayMode:false 行内模式）
 * 使用场景：formatTasksPreview 中每个 \task 单元格
 *
 * 注意：
 *   - 失败时 throwOnError:false 让 KaTeX 返回带红色错误提示的 HTML，不抛出
 *   - 浏览器环境安全：纯文本（无 LaTeX 命令）也能正常渲染，原样输出
 */
function renderMathToHtml(formula: string): string {
  return katex.renderToString(formula, {
    displayMode: false,                                             // 行内模式（与 td 内一行展示对齐）
    throwOnError: false,                                            // 失败不抛错，KaTeX 内部兜底
  })
}

/**
 * tasks 排版选项
 *
 * 功能：定义 latexToPreview / latexToMarkdown 转换 tasks 块时的行为
 * 使用场景：调用方传入以控制预览区渲染风格
 */
export interface TasksRenderOptions {
  /** 是否显示 (A)/(B)/(C)/(D) 标签 — 选择题 true，计算题 false */
  showLabels?: boolean
  /** 同行选项之间的水平间距（CSS 长度），默认 '2em' */
  columnGap?: string
}

/**
 * 格式化 tasks 选项为预览 Markdown
 *
 * 功能：将 \task 选项按指定列数排布渲染，支持在题干后插入图片
 * 输入参数：
 *   - stemContent: 题干文本
 *   - colCount: 列数（如"4"表示4列1行，"2"表示2列2行）
 *   - optionsContent: 选项块内容（含 \task 标记）
 *   - images: 图片URL列表（可选，在题干后、选项前插入）
 *   - opts: 渲染选项（标签开关）
 * 返回值：格式化后的 Markdown 字符串（含 HTML 表格）
 * 使用场景：latexToPreview 内部调用
 *
 * 排版策略：使用 HTML 表格实现 1/2/3/4 列布局
 *   - table-layout: fixed → 列宽均匀分配
 *   - width: 100% → 撑满容器
 *   - 每行 N 个 td → 真正分 N 列
 *   - 计算题场景：showLabels=false，不显示 (A)/(B)/(C)/(D)
 */
function formatTasksPreview(
  stemContent: string,
  colCount: string,
  optionsContent: string,
  images?: string[],
  opts?: TasksRenderOptions,
): string {
  let output = stemContent + "\n\n"                      // 题干 + 空行

  // 插入图片（在题干后、选项前）
  if (images && images.length > 0) {
    for (const url of images) {
      output += `![](${fixImageUrl(url)})\n`             // 逐张插入图片
    }
    output += "\n"                                         // 图片与选项之间空行
  }

  // 解析 \task 选项
  const taskItems = optionsContent
    .split(/\\task\s+/)
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)

  const labels = ["A", "B", "C", "D", "E", "F", "G", "H"] // 标签池
  const cols = parseInt(colCount, 10) || 4                 // 列数，默认4列
  const showLabels = opts?.showLabels ?? true             // 是否显示 (A)/(B)/...
  // 列间距（默认 1em）；控制表格 cell 内的左右内边距
  const columnGap = opts?.columnGap || "1em"

  /* ========== 单个选项的拼接 ========== */
  // 选择题显示 (A)/(B)/(C)/(D) 加粗标签；计算题不显示
  // 注意 1：用 <strong> HTML 标签而非 markdown ** 加粗
  //   原因：react-markdown 在 HTML 表格的 <td> 内部不解析 markdown ** 加粗
  //   会原样输出 ** 字符，使用 <strong> 标签可绕过此限制
  // 注意 2：\task 内的数学公式直接用 KaTeX 渲染为 HTML 字符串嵌入 <td>
  //   原因：react-markdown 的 remark-math + rehype-katex 在 HTML 表格的 <td> 内部
  //         不识别 $...$ 行内公式也不识别 $$...$$ 块公式，会原样输出 $ 字符
  //   解决：调用 katex.renderToString 把公式字符串转为已渲染的 HTML，
  //         再作为 HTML 字符串直接嵌入 <td>，完全不经过 markdown 解析路径
  const formatItem = (item: string, i: number): string => {
    // 步骤 1：去掉 \task 内容首尾的 $$...$$ 包裹
    const mathContent = extractMathContent(item)
    // 步骤 2：调用 KaTeX 渲染为 HTML 字符串
    const mathHtml = renderMathToHtml(mathContent)
    // 步骤 3：拼接 (A)/(B) 标签 + KaTeX HTML（选择题显示标签，计算题不显示）
    const labelText = showLabels ? `<strong>(${labels[i]})</strong> ` : ""
    return labelText + mathHtml
  }

  /* ========== 按列数排布：HTML 表格实现真正的分列 + 均匀分布 ========== */
  if (taskItems.length === 0) {
    return output
  }

  // 决定每行列数：cols >= 4 时 4 列 1 行；cols==2 时 2 列；cols==3 时 3 列；cols==1 时 1 列
  const perRow = Math.max(1, Math.min(4, cols))
  // 行数 = ceil(taskItems.length / perRow)
  const rowCount = Math.ceil(taskItems.length / perRow)

  // 表格 inline-style：
  //   - width: 100%：撑满容器
  //   - table-layout: fixed：列宽均匀（首行决定，后续 td 等宽）
  //   - border-collapse: collapse：去除 td 间隙
  //   - border: 0：无边框
  //   - margin: 0.25em 0：与上下文字留一点空隙
  const tableStyle = `width:100%; table-layout:fixed; border-collapse:collapse; border:0; margin:0.25em 0;`
  // td inline-style：左右内边距等于 columnGap；垂直居中；不换行保持紧凑
  const tdStyleBase = `padding:2px ${columnGap}; vertical-align:top; word-break:break-word;`

  // 构造表格 HTML
  const tableLines: string[] = []
  tableLines.push(`<table style="${tableStyle}">`)
  for (let r = 0; r < rowCount; r++) {
    tableLines.push("<tr>")
    for (let c = 0; c < perRow; c++) {
      const idx = r * perRow + c
      if (idx < taskItems.length) {
        // 列宽 = 100% / perRow
        const tdStyle = `width:${(100 / perRow).toFixed(2)}%; ${tdStyleBase}`
        tableLines.push(`<td style="${tdStyle}">${formatItem(taskItems[idx], idx)}</td>`)
      } else {
        // 缺位补空 td（保持布局对齐）
        const tdStyle = `width:${(100 / perRow).toFixed(2)}%; ${tdStyleBase}`
        tableLines.push(`<td style="${tdStyle}"></td>`)
      }
    }
    tableLines.push("</tr>")
  }
  tableLines.push("</table>")
  output += tableLines.join("") + "\n"

  return output
}
