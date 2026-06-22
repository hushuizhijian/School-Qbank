/**
 * AI 标准化题干插件包装器
 *
 * 功能：渲染触发按钮 + 管理 AiStandardizeStem 弹窗状态
 * 挂载位置：editor-side
 */

import type { PluginProps } from "@/types/plugin"
import AiPluginWrapper from "@/components/plugins/AiPluginWrapper"
import AiStandardizeStem from "@/components/ai/AiStandardizeStem"

export default function AiStandardizeStemWrapper({ ...props }: PluginProps) {
  return (
    <AiPluginWrapper<string>
      pluginProps={props}
      ModalComponent={AiStandardizeStem}
      triggerLabel="AI 标准化题干"
      onApplyResult={(stem, onUpdateField) => {
        onUpdateField("stem", stem)
      }}
    />
  )
}