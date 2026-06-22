/**
 * AI 难度打分插件包装器
 *
 * 功能：渲染触发按钮 + 管理 AiAutoDifficulty 弹窗状态
 * 挂载位置：attribute-panel
 */

import type { PluginProps } from "@/types/plugin"
import AiPluginWrapper from "@/components/plugins/AiPluginWrapper"
import AiAutoDifficulty from "@/components/ai/AiAutoDifficulty"

export default function AiAutoDifficultyWrapper({ ...props }: PluginProps) {
  return (
    <AiPluginWrapper<string>
      pluginProps={props}
      ModalComponent={AiAutoDifficulty}
      triggerLabel="AI 难度打分"
      onApplyResult={(difficulty, onUpdateField) => {
        onUpdateField("difficulty", difficulty)
      }}
    />
  )
}