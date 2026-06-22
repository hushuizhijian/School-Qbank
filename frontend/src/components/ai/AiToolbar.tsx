/**
 * AI 辅助工具栏组件
 *
 * 功能：提供6个AI辅助操作按钮，嵌入中栏底部或右栏上方
 * 输入参数：
 *   - onAction: (action: AiActionType) => void — 点击AI功能按钮回调
 *   - disabled?: boolean — 是否禁用全部按钮
 * 返回值：React 组件
 * 使用场景：题目编辑/校对页面，AI辅助操作入口
 */

import { cn } from "@/utils/cn"
import { Brain, Split, SpellCheck, FileText, AlignLeft, Gauge } from "lucide-react"

/* ========== 类型定义 ========== */

/** AI 操作类型 */
type AiActionType =
  | "match_knowledge"     // 匹配知识点
  | "split_subquestions"  // 拆分小问
  | "fix_typos"           // 错别字校正
  | "generate_analysis"   // 生成解析
  | "standardize_stem"    // 题干标准化
  | "auto_difficulty"     // 难度标注

/** AI 工具栏 Props */
interface AiToolbarProps {
  onAction: (action: AiActionType) => void  // 点击AI功能按钮回调
  disabled?: boolean                         // 是否禁用
}

/* ========== 按钮配置 ========== */

/** 按钮定义列表：action、标签、图标组件、颜色 */
const aiButtons: {
  action: AiActionType       // 操作类型
  label: string              // 按钮文字
  icon: React.ComponentType<{ size?: number; className?: string }>  // 图标组件
  color: string              // 主题色名
}[] = [
  { action: "match_knowledge", label: "匹配知识点", icon: Brain, color: "purple" },
  { action: "split_subquestions", label: "拆分小问", icon: Split, color: "blue" },
  { action: "fix_typos", label: "错别字校正", icon: SpellCheck, color: "orange" },
  { action: "generate_analysis", label: "生成解析", icon: FileText, color: "green" },
  { action: "standardize_stem", label: "题干标准化", icon: AlignLeft, color: "cyan" },
  { action: "auto_difficulty", label: "难度标注", icon: Gauge, color: "amber" },
]

/* ========== 颜色映射 ========== */

/** 各主题色的默认样式和 hover 样式 */
const colorStyles: Record<string, { base: string; hover: string }> = {
  purple: {
    base: "bg-purple-50 text-purple-700",       // 默认浅紫背景+深紫文字
    hover: "hover:bg-purple-100",               // hover 加深背景
  },
  blue: {
    base: "bg-blue-50 text-blue-700",           // 默认浅蓝背景+深蓝文字
    hover: "hover:bg-blue-100",                 // hover 加深背景
  },
  orange: {
    base: "bg-orange-50 text-orange-700",       // 默认浅橙背景+深橙文字
    hover: "hover:bg-orange-100",               // hover 加深背景
  },
  green: {
    base: "bg-emerald-50 text-emerald-700",     // 默认浅绿背景+深绿文字
    hover: "hover:bg-emerald-100",              // hover 加深背景
  },
  cyan: {
    base: "bg-cyan-50 text-cyan-700",           // 默认浅青背景+深青文字
    hover: "hover:bg-cyan-100",                 // hover 加深背景
  },
  amber: {
    base: "bg-amber-50 text-amber-700",         // 默认浅琥珀背景+深琥珀文字
    hover: "hover:bg-amber-100",                // hover 加深背景
  },
}

/* ========== 主组件 ========== */

/**
 * AI 辅助工具栏
 *
 * 功能：展示6个AI辅助按钮，点击触发对应操作回调
 * 布局：标题行 + 按钮行（flex-wrap 自动换行）
 */
export default function AiToolbar({ onAction, disabled }: AiToolbarProps) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      {/* 标题行 */}
      <div className="flex items-center gap-1 mb-2">
        <span className="text-sm">🤖</span>                                  // 机器人图标
        <span className="text-xs font-semibold text-slate-500">AI 辅助</span> // 标题文字
      </div>

      {/* 按钮行 */}
      <div className="flex flex-wrap gap-1.5">
        {aiButtons.map(({ action, label, icon: Icon, color }) => {
          const styles = colorStyles[color] // 获取对应颜色样式

          return (
            <button
              key={action}                                                   // 以 action 为 key
              onClick={() => onAction(action)}                               // 触发回调
              disabled={disabled}                                            // 禁用状态
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-xs rounded",
                "transition-colors duration-150",                            // 过渡动画
                styles.base,                                                 // 默认颜色
                styles.hover,                                                // hover 颜色
                disabled && "opacity-50 cursor-not-allowed"                  // 禁用样式
              )}
            >
              <Icon size={12} />                                             // 按钮图标
              {label}                                                        // 按钮文字
            </button>
          )
        })}
      </div>
    </div>
  )
}
