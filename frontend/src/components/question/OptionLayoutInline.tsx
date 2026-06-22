/**
 * 分行控件（内联版）— 嵌入题目内容标题栏右侧
 *
 * 功能：把选择题选项 A./B./C./D. 形式转换为 \begin{tasks}(N) \task ... \end{tasks} 格式
 *       并支持切换 1行 / 2行 / 3行 / 4行 4 种排布模式
 *       仅对选择题生效（callSite 需自行控制，非选择题不要渲染）
 * 输入参数：
 *   - value: 当前 LaTeX 源码
 *   - onChange: 切换模式后回调，参数为新的 LaTeX 源码
 *   - questionType: 题型（用于 setTasksColumn 的自动包装策略）
 *   - options: 选项数组（选择题自动包装时使用）
 *   - stem: 题干（选择题自动包装时使用）
 * 返回值：分行 + 列数切换的按钮组
 * 使用场景：校对工作台"题目内容"DualPaneEditor 的 titleExtra 位置
 *
 * 使用流程（两步骤）：
 *   1. 点击"分行"：将 A./B./C./D. 形式的选项包装为 tasks.sty 格式（默认 4 列）
 *   2. 点击"1行/2行/3行/4行"：调整 \begin{tasks}(N) 的 N 值，切换列数
 *
 * 修复说明：
 *   之前版本使用后出现"选择题两组选项"问题
 *   现已委托给 setTasksColumn（内置 stripChoiceOptionLines）清理 A./B./C./D. 重复行
 */
import { useMemo } from "react"
import { WrapText } from "lucide-react"
import { cn } from "@/utils/cn"
import {
  setTasksColumn,
  getTasksColumn,
  columnsToLayoutMode,
  layoutModeToColumns,
  type OptionLayoutMode,
} from "@/utils/latexConverter"

/* ========== 类型定义 ========== */

/** 控件 Props */
export interface OptionLayoutInlineProps {
  /** 当前 LaTeX 源码 */
  value: string
  /** 切换模式后回调，参数为新的 LaTeX 源码 */
  onChange: (newLatex: string) => void
  /** 题型（用于 setTasksColumn 的自动包装策略） */
  questionType?: string | null
  /** 选项数组（选择题自动包装时使用） */
  options?: unknown[]
  /** 题干（选择题自动包装时使用） */
  stem?: string
}

/* ========== 常量配置 ========== */

/**
 * 默认列数（"分行"按钮首次包装时使用的列数）
 * 功能：未指定列数时使用此值
 */
const DEFAULT_COLUMNS = 4

/**
 * 4 种排布模式展示配置
 * 功能：定义按钮标签、列数、提示文案
 */
const LAYOUT_OPTIONS: Array<{
  mode: OptionLayoutMode
  label: string
  title: string
}> = [
  { mode: "inline",   label: "1行", title: "1行4列：所有选项排在一行" },
  { mode: "three-row", label: "3行", title: "3行：3列3行排布（≤3选项时退化）" },
  { mode: "two-row",  label: "2行", title: "2行：2列2行排布" },
  { mode: "four-row", label: "4行", title: "4行：1列4行排布（每项独占一行）" },
]

/* ========== 主组件 ========== */

/**
 * 分行控件（内联版）
 *
 * 功能：内联显示"分行"按钮 + 4 个排布按钮，仅对选择题生效
 *       通过修改 LaTeX 中 \begin{tasks}(N) 的 N 值切换排版
 * 输入参数：见 OptionLayoutInlineProps
 * 返回值：内联控件 JSX
 * 使用场景：嵌入 DualPaneEditor 标题栏右侧的 titleExtra 位置
 */
export default function OptionLayoutInline({
  value,
  onChange,
  questionType,
  options,
  stem,
}: OptionLayoutInlineProps) {
  /* ========== 计算当前状态 ========== */

  // LaTeX 中是否已存在 tasks 块（决定"分行"按钮是否显示 + 1行/2行等是否启用）
  const hasTasksBlock = useMemo(
    () => /\\begin\{tasks\}/.test(value || ""),
    [value]
  )
  // 当前 tasks 列数（仅在 hasTasksBlock 为 true 时有效）
  const currentColumns = useMemo(
    () => (hasTasksBlock ? getTasksColumn(value) : null),
    [value, hasTasksBlock]
  )
  // 当前激活模式（仅在 hasTasksBlock 为 true 时有值）
  const activeMode: OptionLayoutMode | null = useMemo(
    () => (currentColumns != null ? columnsToLayoutMode(currentColumns) : null),
    [currentColumns]
  )
  // "分行"按钮是否禁用：已存在 tasks 块时禁用（已经分过行了）
  const wrapDisabled = hasTasksBlock

  /* ========== 切换处理 ========== */

  /**
   * 处理"分行"按钮点击
   * 功能：把 A./B./C./D. 形式的选项包装为 tasks.sty 格式（默认 4 列）
   *       委托给 setTasksColumn：选择题 + 有 options 时自动包装
   * 返回值：无
   */
  const handleWrap = () => {
    if (wrapDisabled) return                                   // 已分行则跳过
    const newLatex = setTasksColumn(
      value,                                                   // 原始 LaTeX（含 A./B./C./D. 行）
      DEFAULT_COLUMNS,                                        // 默认 4 列
      questionType || undefined,                              // 题型
      options,                                                // 选项数组
      stem,                                                   // 题干
    )
    onChange(newLatex)                                         // 回传包装后的 LaTeX
  }

  /**
   * 处理 1行/2行/3行/4行 按钮点击
   * 功能：仅在 hasTasksBlock 为 true 时调整 \begin{tasks}(N) 的 N 值
   *       未分行时按钮 disabled，handlePickMode 直接 return
   * 输入参数：mode — 目标排布模式
   * 返回值：无
   */
  const handlePickMode = (mode: OptionLayoutMode) => {
    if (!hasTasksBlock) return                                 // 未分行：禁用
    if (mode === activeMode) return                            // 已是当前模式：跳过
    const newColumns = layoutModeToColumns(mode)               // 模式 → 列数
    // 已有 tasks 块：setTasksColumn 会清理 A./B./C./D. 重复行后仅替换 N
    const newLatex = setTasksColumn(value, newColumns, questionType || undefined, options, stem)
    onChange(newLatex)                                         // 回传新 LaTeX
  }

  /* ========== 渲染 ========== */

  return (
    // 控件容器：与标题同行展示，溢出时隐藏多余按钮
    <div
      className="flex items-center gap-1.5 min-w-0 overflow-hidden"
      title="分行控件（仅选择题）：先把 A./B./C./D. 转为 tasks 格式，再调整列数"
    >
      {/* ===== 第一步：【分行】按钮 ===== */}
      <button
        type="button"
        onClick={handleWrap}                                    // 点击触发包装
        disabled={wrapDisabled}                                 // 已分行则禁用
        title={wrapDisabled
          ? "已分行为 tasks 格式，可直接调整列数"
          : "把 A./B./C./D. 形式包装为 tasks.sty 格式（默认 4 列）"
        }
        className={cn(
          "flex items-center gap-1 h-6 px-2 text-[11px] rounded-md border transition-colors shrink-0",
          wrapDisabled
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" // 已分行：灰显
            : "bg-blue-500 text-white border-blue-500 hover:bg-blue-600"        // 未分行：蓝底白字 + 悬停加深
        )}
      >
        <WrapText size={12} />
        分行
      </button>

      {/* ===== 第二步：列数切换按钮组 ===== */}
      <div
        className="flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 shrink min-w-0"
        role="group"
        aria-label="选项排布模式"
      >
        {LAYOUT_OPTIONS.map((opt) => {
          // 激活态：仅在 hasTasksBlock 为 true 且模式匹配时激活
          const isActive = hasTasksBlock && opt.mode === activeMode
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => handlePickMode(opt.mode)}           // 点击切换模式
              disabled={!hasTasksBlock}                          // 未分行时禁用
              title={hasTasksBlock
                ? opt.title                                     // 已分行：显示模式说明
                : "请先点击左侧【分行】按钮"
              }
              aria-pressed={isActive}                            // 无障碍：是否激活
              className={cn(
                "px-1.5 h-5 text-[11px] rounded transition-colors shrink-0", // 基础样式
                !hasTasksBlock
                  ? "text-slate-300 cursor-not-allowed"         // 未分行：灰 + 禁止光标
                  : isActive
                    ? "bg-blue-500 text-white"                  // 激活：蓝底白字
                    : "text-slate-600 hover:bg-slate-100"       // 默认：灰字 + 悬停背景
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
