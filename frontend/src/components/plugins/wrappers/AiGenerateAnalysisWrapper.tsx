/**
 * AI 生成解析插件包装器
 *
 * 功能：渲染触发按钮 + 管理 AiGenerateAnalysis 弹窗状态
 * 挂载位置：editor-bottom
 */

import type { PluginProps } from "@/types/plugin"
import AiPluginWrapper from "@/components/plugins/AiPluginWrapper"
import AiGenerateAnalysis from "@/components/ai/AiGenerateAnalysis"

export default function AiGenerateAnalysisWrapper({ ...props }: PluginProps) {
  return (
    <AiPluginWrapper<string>
      pluginProps={props}
      ModalComponent={AiGenerateAnalysis}
      triggerLabel="AI 生成解析"
      onApplyResult={(analysis, onUpdateField) => {
        onUpdateField("analysis", analysis)
      }}
    />
  )
}