/**
 * AI 修正错别字插件包装器
 *
 * 功能：渲染触发按钮 + 管理 AiFixTypos 弹窗状态
 * 挂载位置：editor-side
 */

import type { PluginProps } from "@/types/plugin"
import AiPluginWrapper from "@/components/plugins/AiPluginWrapper"
import AiFixTypos from "@/components/ai/AiFixTypos"

export default function AiFixTyposWrapper({ ...props }: PluginProps) {
  return (
    <AiPluginWrapper<{ original: string; corrected: string; reason: string }[]>
      pluginProps={props}
      ModalComponent={AiFixTypos}
      triggerLabel="AI 修正错别字"
      onApplyResult={(corrections, onUpdateField) => {
        onUpdateField("corrections", corrections)
      }}
    />
  )
}