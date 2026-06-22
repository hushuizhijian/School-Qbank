/**
 * AI 批量标准化插件包装器
 *
 * 功能：渲染触发按钮 + 管理 AiBatchStandardize 弹窗状态
 * 挂载位置：toolbar
 */

import { useState } from "react"
import type { PluginProps } from "@/types/plugin"
import AiBatchStandardize from "@/components/ai/AiBatchStandardize"
import { Sparkles } from "lucide-react"

export default function AiBatchStandardizeWrapper({ selectedIds, aiSelection, onRefresh }: PluginProps) {
  const [open, setOpen] = useState(false)
  const ids = selectedIds || []

  if (ids.length === 0) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   bg-purple-500 text-white rounded hover:bg-purple-600
                   transition-colors shadow-sm"
      >
        <Sparkles size={14} />
        AI 标准化
      </button>

      {open && (
        <AiBatchStandardize
          open={open}
          onClose={() => setOpen(false)}
          questionIds={ids}
          onComplete={() => {
            onRefresh()
            setOpen(false)
          }}
          aiSelection={aiSelection}
        />
      )}
    </>
  )
}