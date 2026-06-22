/**
 * AI 拆分子题插件包装器
 *
 * 功能：渲染触发按钮 + 管理 AiSplitSubQuestions 弹窗状态
 * 挂载位置：editor-bottom
 */

import type { PluginProps } from "@/types/plugin"
import AiPluginWrapper from "@/components/plugins/AiPluginWrapper"
import AiSplitSubQuestions from "@/components/ai/AiSplitSubQuestions"

export default function AiSplitSubQuestionsWrapper({ ...props }: PluginProps) {
  return (
    <AiPluginWrapper<{ sub_no: number; content: string }[]>
      pluginProps={props}
      ModalComponent={AiSplitSubQuestions}
      triggerLabel="AI 拆分子题"
      onApplyResult={(subQuestions, onUpdateField) => {
        onUpdateField("sub_questions", subQuestions)
      }}
    />
  )
}