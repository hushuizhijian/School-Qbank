/**
 * 计算题分列控件（内联版）— 嵌入题目内容标题栏右侧
 *
 * 功能：把计算题中多个独立 $$...$$ 公式块包装为 \begin{tasks}(N) \task ... \end{tasks} 格式
 *       并支持切换 1列 / 2列 / 3列 / 4列 / 5列 / 6列 6 种排布模式
 *       仅对计算题生效（callSite 需自行控制，非计算题不要渲染）
 * 输入参数：
 *   - value: 当前 LaTeX 源码
 *   - onChange: 切换模式后回调，参数为新的 LaTeX 源码
 *   - questionType: 题型（用于 setTasksColumn 的自动包装策略）
 * 返回值：分列 + 6 模式列数切换的按钮组
 * 使用场景：校对工作台"题目内容"DualPaneEditor 的 titleExtra 位置（仅计算题）
 *
 * 使用流程（两步骤，与选择题 OptionLayoutInline 一致）：
 *   1. 点击"分列"：将多个 $$...$$ 块包装为 tasks.sty 格式（默认 1 列）
 *   2. 点击"1列/2列/3列/4列/5列/6列"：调整 \begin{tasks}(N) 的 N 值，切换列数
 *
 * 设计原则：
 *   - 模仿 OptionLayoutInline 的 UI（同样的位置、同样的按钮形态）
 *   - 不显示 (A)/(B)/(C)/(D) 标签（计算题不需要）
 *   - 默认列数为 1（与"inline"默认 4 不同）
 *   - 列数范围 1~6（选择题是 1~4 行 × N 列；计算题是 1~6 列直接对应 N）
 */
import { useMemo } from "react"
import { Columns2, WrapText, Plus, Undo2 } from "lucide-react"
import { cn } from "@/utils/cn"
import {
  setTasksColumn,
  getTasksColumn,
  type CalcColumnMode,
} from "@/utils/latexConverter"

/* ========== 类型定义 ========== */

/** 控件 Props */
export interface SubQuestionLayoutInlineProps {
  /** 当前 LaTeX 源码 */
  value: string
  /** 切换模式后回调，参数为新的 LaTeX 源码 */
  onChange: (newLatex: string) => void
  /** 题型（用于 setTasksColumn 的自动包装策略） */
  questionType?: string | null
}

/* ========== 空行工具函数 ========== */

/**
 * 空任务占位行（用于在 \end{tasks} 前插入一行空白）
 *
 * 功能：在 tasks 块内插入 `\task $$\n` 后渲染为一空行
 * 输入参数：无
 * 返回值：固定格式的空任务源码
 * 使用场景：【空】按钮插入 /【还】按钮匹配
 */
const BLANK_TASK_LINE = "\\task $$\n"

/**
 * 统计 LaTeX 中空任务占位的数量
 *
 * 功能：扫描源码中 `\task $\n` / `\task $$\n` / `\task $$$\n` 等占位行（由【空】按钮插入）
 *       正则放宽匹配 1~N 个 $ 字符，兼容历史插入与未来扩展
 * 输入参数：latex — 当前 LaTeX 源码
 * 返回值：空任务占位行数量（数字）
 * 使用场景：blankCount 派生状态、外部重置
 */
function countBlankTasks(latex: string): number {
  if (!latex) return 0                                           // 空字符串兜底
  // 匹配 \task 后面紧跟 1~N 个 $ + 换行的占位行
  //   兼容 \task $\n（历史 bug 状态）和 \task $$\n（标准占位）
  const re = /\\task\s+\$+\n/g
  return (latex.match(re) || []).length                          // 统计匹配个数
}

/* ========== 常量配置 ========== */

/**
 * 默认列数（"分列"按钮首次包装时使用的列数）
 * 功能：未指定列数时使用此值（计算题默认 1 列）
 */
const DEFAULT_COLUMNS = 1

/**
 * 6 种排布模式展示配置
 * 功能：定义按钮标签、列数、提示文案
 */
const LAYOUT_OPTIONS: Array<{
  mode: CalcColumnMode
  label: string
  columns: number
  title: string
}> = [
  { mode: "1col", label: "1列", columns: 1, title: "1列：每行 1 个子题，垂直堆叠" },
  { mode: "2col", label: "2列", columns: 2, title: "2列：2列均匀分布" },
  { mode: "3col", label: "3列", columns: 3, title: "3列：3列均匀分布" },
  { mode: "4col", label: "4列", columns: 4, title: "4列：4列均匀分布" },
  { mode: "5col", label: "5列", columns: 5, title: "5列：5列均匀分布" },
  { mode: "6col", label: "6列", columns: 6, title: "6列：6列均匀分布" },
]

/* ========== 主组件 ========== */

/**
 * 计算题分列控件（内联版）
 *
 * 功能：内联显示"分列"按钮 + 6 个列数按钮，仅对计算题生效
 *       通过修改 LaTeX 中 \begin{tasks}(N) 的 N 值切换列数
 * 输入参数：见 SubQuestionLayoutInlineProps
 * 返回值：内联控件 JSX
 * 使用场景：嵌入 DualPaneEditor 标题栏右侧的 titleExtra 位置（仅计算题）
 */
export default function SubQuestionLayoutInline({
  value,
  onChange,
  questionType,
}: SubQuestionLayoutInlineProps) {
  /* ========== 计算当前状态 ========== */

  // LaTeX 中是否已存在 tasks 块（决定"分列"按钮是否显示 + 1列/2列等是否启用）
  const hasTasksBlock = useMemo(
    () => /\\begin\{tasks\}/.test(value || ""),
    [value]
  )
  // 当前 tasks 列数（仅在 hasTasksBlock 为 true 时有效）
  const currentColumns = useMemo(
    () => (hasTasksBlock ? getTasksColumn(value) : null),
    [value, hasTasksBlock]
  )
  // 当前激活模式（根据列数反推，1~6 列对应 6 个按钮）
  const activeMode: CalcColumnMode | null = useMemo(() => {
    if (currentColumns == null) return null                  // 无 tasks 块：无激活
    if (currentColumns >= 1 && currentColumns <= 6) {
      return `${currentColumns}col` as CalcColumnMode       // 1~6 → 对应按钮
    }
    return null                                              // 超过 6 列：无激活（兜底）
  }, [currentColumns])
  // "分列"按钮是否禁用：已存在 tasks 块时禁用（已经分过列了）
  const wrapDisabled = hasTasksBlock
  // 当前空任务占位行数量（从 LaTeX 派生；source of truth = LaTeX 本身）
  const blankCount = useMemo(() => countBlankTasks(value), [value])

  /* ========== 切换处理 ========== */

  /**
   * 处理"分列"按钮点击
   * 功能：把多个 $$...$$ 块包装为 tasks.sty 格式（默认 1 列）
   *       委托给 setTasksColumn：
   *         - 无 options 时走"含 ≥2 个 $$ 块"自动包装分支
   *         - 已存在 tasks 块时仅替换 N
   * 返回值：无
   */
  const handleWrap = () => {
    if (wrapDisabled) return                                   // 已分列则跳过
    const newLatex = setTasksColumn(
      value,                                                   // 原始 LaTeX（含多个 $$ 块）
      DEFAULT_COLUMNS,                                        // 默认 1 列
      questionType || undefined,                              // 题型
    )
    onChange(newLatex)                                         // 回传包装后的 LaTeX
  }

  /**
   * 处理 1列/2列/3列/4列/5列/6列 按钮点击
   * 功能：仅在 hasTasksBlock 为 true 时调整 \begin{tasks}(N) 的 N 值
   *       未分列时按钮 disabled，handlePickMode 直接 return
   * 输入参数：mode — 目标排布模式
   * 返回值：无
   */
  const handlePickMode = (mode: CalcColumnMode) => {
    if (!hasTasksBlock) return                                 // 未分列：禁用
    if (mode === activeMode) return                            // 已是当前模式：跳过
    // 找到目标列数
    const target = LAYOUT_OPTIONS.find((o) => o.mode === mode)
    if (!target) return                                        // 防御
    // 已有 tasks 块：setTasksColumn 仅替换 N；含 \task 块内的公式会被保留
    const newLatex = setTasksColumn(value, target.columns, questionType || undefined)
    onChange(newLatex)                                         // 回传新 LaTeX
  }

  /**
   * 处理【空】按钮点击 — 在 \end{tasks} 前插入一行空白任务
   *
   * 功能：未分列时禁用；分列后每点一次在末尾多一行空行（累加）
   * 返回值：无
   *
   * 注意 1：必须用 replace 的**函数形式**而非字符串形式
   *   原因：String.prototype.replace 的字符串参数会把 `$$` 解析为字面量 `$`、
   *   `$1` 解析为第一个捕获组。`${BLANK_TASK_LINE}${match}` 函数形式直接字符串拼接，无特殊解析
   *
   * 注意 2：贪婪匹配 `\end` 前的所有空白（`\s*`），再插入固定 `\n\task $$\n`
   *   原因：原 `latex_source` 中 `\end{tasks}` 前的 `$$` 关闭符后可能紧跟 `\end`（无换行）、
   *   也可能有 1~N 个换行/空格。若直接插入 `\task $$\n`，
   *   在 `$$\end` 这种拼接状态下会产生 `$$\task $$` 同行（占位行未独占）
   *   用 `\s*` 吃掉所有空白后，无论原状态如何都强制变成 `\n\task $$\n\end` 标准格式
   */
  const handleAddBlank = () => {
    if (!hasTasksBlock) return                                 // 未分列：禁用
    if (!/\\end\{tasks\}/.test(value)) return                  // 防御：无 \end{tasks} 不插入
    // 把 \end{tasks} 前的所有空白替换为 \n\task $$\n（保证占位行独占一行）
    const newLatex = value.replace(
      /\s*\\end\{tasks\}/,                                     // 贪婪吃掉 \end 前所有空白
      () => `\n${BLANK_TASK_LINE}\\end{tasks}`,                // 插入 \n\task $$\n\end
    )
    onChange(newLatex)                                         // 回传新 LaTeX
  }

  /**
   * 处理【还】按钮点击 — 移除所有空任务占位行
   *
   * 功能：清除由【空】按钮插入的所有 `\task $$\n` / `\task $\n` 等占位
   *       恢复 tasks 块到原始状态
   *       blankCount === 0 时禁用（按钮灰显）
   * 返回值：无
   *
   * 注意：移除时使用 `\s*\\task\s+\$+\n` 模式（含前导空白），
   *       保证不留连续空行；同样用 replace 函数形式避免 $ 转义
   */
  const handleRemoveBlank = () => {
    if (blankCount === 0) return                               // 无空行：禁用
    // 移除所有空任务占位行（含其前换行符，保证不留空行）
    // 函数形式：每个 match 直接丢弃，无 $ 转义问题
    const newLatex = value.replace(
      /\s*\\task\s+\$+\n/g,                                    // 匹配 "\task $\n" / "\task $$\n" 等
      () => "",                                                // 替换为空字符串
    )
    onChange(newLatex)                                         // 回传新 LaTeX
  }

  /* ========== 渲染 ========== */

  return (
    // 控件容器：与标题同行展示，溢出时隐藏多余按钮
    <div
      className="flex items-center gap-1.5 min-w-0 overflow-hidden"
      title="分列控件（仅计算题）：把多个 $$...$$ 块包装为 tasks 格式，再调整列数"
    >
      {/* ===== 第一步：【分列】按钮 ===== */}
      <button
        type="button"
        onClick={handleWrap}                                    // 点击触发包装
        disabled={wrapDisabled}                                 // 已分列则禁用
        title={wrapDisabled
          ? "已分列为 tasks 格式，可直接调整列数"
          : "把多个 $$...$$ 块包装为 tasks.sty 格式（默认 1 列）"
        }
        className={cn(
          "flex items-center gap-1 h-6 px-2 text-[11px] rounded-md border transition-colors shrink-0",
          wrapDisabled
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" // 已分列：灰显
            : "bg-blue-500 text-white border-blue-500 hover:bg-blue-600"        // 未分列：蓝底白字 + 悬停加深
        )}
      >
        <WrapText size={12} />
        分列
      </button>

      {/* ===== 第二步：列数切换按钮组 ===== */}
      <div
        className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 shrink min-w-0"
        role="group"
        aria-label="计算题子题列数"
      >
        {LAYOUT_OPTIONS.map((opt) => {
          // 激活态：仅在 hasTasksBlock 为 true 且模式匹配时激活
          const isActive = hasTasksBlock && opt.mode === activeMode
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => handlePickMode(opt.mode)}           // 点击切换模式
              disabled={!hasTasksBlock}                          // 未分列时禁用
              title={hasTasksBlock
                ? opt.title                                     // 已分列：显示模式说明
                : "请先点击左侧【分列】按钮"
              }
              aria-pressed={isActive}                            // 无障碍：是否激活
              className={cn(
                "px-1.5 h-5 text-[11px] rounded transition-colors shrink-0", // 基础样式
                !hasTasksBlock
                  ? "text-slate-300 cursor-not-allowed"         // 未分列：灰 + 禁止光标
                  : isActive
                    ? "bg-blue-500 text-white"                  // 激活：蓝底白字
                    : "text-slate-600 hover:bg-slate-100"       // 默认：灰字 + 悬停背景
              )}
            >
              <span className="inline-flex items-center gap-0.5">
                {opt.columns}
                <Columns2 size={9} className="opacity-60" />
              </span>
            </button>
          )
        })}
      </div>

      {/* ===== 第三步：【空】按钮 — 在 tasks 块末尾增加一行空行 ===== */}
      <button
        type="button"
        onClick={handleAddBlank}                                  // 点击增加一行空任务
        disabled={!hasTasksBlock}                                // 未分列时禁用
        title={hasTasksBlock
          ? `在末尾增加一行空行（当前 ${blankCount} 行）`
          : "请先点击左侧【分列】按钮"
        }
        className={cn(
          "flex items-center gap-0.5 h-6 px-2 text-[11px] rounded-md border transition-colors shrink-0",
          !hasTasksBlock
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" // 未分列：灰显
            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"      // 可用：白底 + 悬停加深
        )}
      >
        <Plus size={12} />
        空
        {blankCount > 0 && (
          // 已插入空行时显示数量徽标
          <span className="ml-0.5 px-1 rounded bg-blue-100 text-blue-600 text-[10px] leading-4">
            {blankCount}
          </span>
        )}
      </button>

      {/* ===== 第四步：【还】按钮 — 清除所有空行，恢复原状 ===== */}
      <button
        type="button"
        onClick={handleRemoveBlank}                              // 点击移除所有空任务
        disabled={blankCount === 0}                             // 无空行时禁用
        title={blankCount === 0
          ? "暂无空行可移除"
          : `清除所有空行（共 ${blankCount} 行）`
        }
        className={cn(
          "flex items-center gap-0.5 h-6 px-2 text-[11px] rounded-md border transition-colors shrink-0",
          blankCount === 0
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" // 无空行：灰显
            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"      // 可用：白底 + 悬停加深
        )}
      >
        <Undo2 size={12} />
        还
      </button>
    </div>
  )
}
