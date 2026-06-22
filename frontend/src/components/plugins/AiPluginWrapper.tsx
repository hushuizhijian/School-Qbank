/**
 * AI 插件通用包装器组件
 *
 * 功能：通用的 AI 弹窗插件包装器，渲染触发按钮 + 管理弹窗状态
 * 输入参数：pluginProps（插件数据）、ModalComponent（AI弹窗组件）、triggerLabel（按钮文字）、
 *   onApplyResult（应用回调，将 AI 结果转换为 onUpdateField 调用）
 * 返回值：React 组件
 * 使用场景：每个 AI 插件包装器内部使用
 */

import { useState } from "react"
import type { PluginProps } from "@/types/plugin"
import type { AiProviderSelection } from "@/api/ai"
import { Sparkles } from "lucide-react"

/* ========== 类型定义 ========== */

/** AI 弹窗组件通用 Props（所有 AI 弹窗共享的模式） */
interface AiModalProps<T = unknown> {
  open: boolean
  onClose: () => void
  questionId: string
  onApply: (result: T) => void
  aiSelection?: AiProviderSelection
}

/** AI 弹窗组件类型 */
type AiModalComponent<T = unknown> = React.ComponentType<AiModalProps<T>>

/** 通用包装器 Props */
interface AiPluginWrapperProps<T = unknown> {
  pluginProps: PluginProps                               // 插件注入数据
  ModalComponent: AiModalComponent<T>                    // AI 弹窗组件
  triggerLabel: string                                   // 触发按钮文字
  onApplyResult: (result: T, onUpdateField: PluginProps["onUpdateField"]) => void  // 结果处理
  disabled?: boolean                                     // 是否禁用按钮
}

/* ========== 通用包装器 ========== */

/**
 * AI 插件通用包装器
 *
 * 功能：统一管理 AI 弹窗的打开/关闭状态 + 触发按钮渲染
 * 使用方式：每个 AI 插件包装器调用此组件，传入具体配置
 */
export default function AiPluginWrapper<T>({
  pluginProps,
  ModalComponent,
  triggerLabel,
  onApplyResult,
  disabled = false,
}: AiPluginWrapperProps<T>) {
  const { currentQuestion, onUpdateField, aiSelection } = pluginProps

  // 弹窗打开状态
  const [open, setOpen] = useState(false)

  // 无当前题目时禁用按钮
  const isDisabled = disabled || !currentQuestion

  return (
    <>
      {/* 触发按钮 */}
      <button
        onClick={() => setOpen(true)}
        disabled={isDisabled}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                   bg-purple-50 text-purple-600 border border-purple-200 rounded
                   hover:bg-purple-100 transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed"
        title={triggerLabel}
      >
        <Sparkles size={12} />
        {triggerLabel}
      </button>

      {/* AI 弹窗（仅在打开时渲染） */}
      {open && currentQuestion && (
        <ModalComponent
          open={open}
          onClose={() => setOpen(false)}
          questionId={currentQuestion.id}
          onApply={(result) => {
            onApplyResult(result, onUpdateField)
            setOpen(false)
          }}
          aiSelection={aiSelection}
        />
      )}
    </>
  )
}