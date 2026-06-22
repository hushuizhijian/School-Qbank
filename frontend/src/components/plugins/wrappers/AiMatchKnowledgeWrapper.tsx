/**
 * AI 知识点匹配插件包装器
 *
 * 功能：渲染触发按钮 + 管理 AiMatchKnowledge 弹窗状态
 * 挂载位置：attribute-panel
 */

import type { PluginProps } from "@/types/plugin"
import type { KnowledgePointItem } from "@/types/question"
import AiPluginWrapper from "@/components/plugins/AiPluginWrapper"
import AiMatchKnowledge from "@/components/ai/AiMatchKnowledge"

export default function AiMatchKnowledgeWrapper({ onKnowledgeChange, ...props }: PluginProps) {
  return (
    <AiPluginWrapper<string[]>
      pluginProps={{ ...props, onKnowledgeChange }}         // 透传 onKnowledgeChange 给 Modal
      ModalComponent={AiMatchKnowledge}
      triggerLabel="AI 知识点匹配"
      onApplyResult={(kpIds) => {
        // AI 返回的 ID 列表（可能仅含 ID，name 留空，前端会用 id 截断显示）
        const items: KnowledgePointItem[] = (kpIds || []).map((id) => ({
          id,
          name: "",
          code: "",
          level: 0,
        }))
        onKnowledgeChange(items)                            // 调用核心回调
      }}
    />
  )
}