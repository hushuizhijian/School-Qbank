/**
 * 质量检查插件包装器
 *
 * 功能：渲染触发按钮 + 管理 QualityChecker 抽屉状态
 * 挂载位置：toolbar
 */

import { useState } from "react"
import type { PluginProps } from "@/types/plugin"
import QualityChecker from "@/components/proofreading/QualityChecker"
import { ClipboardCheck } from "lucide-react"

export default function QualityCheckerWrapper({
  paperId,
  questions,
  onNavigate,
  onRefresh,
}: PluginProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   bg-amber-50 text-amber-700 border border-amber-200 rounded
                   hover:bg-amber-100 transition-colors shadow-sm"
      >
        <ClipboardCheck size={14} />
        质量检查
      </button>

      <QualityChecker
        open={open}
        onClose={() => setOpen(false)}
        paperId={paperId}
        questions={questions}
        onNavigate={onNavigate}
        onFixApplied={onRefresh}
      />
    </>
  )
}