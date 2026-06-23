/**
 * Word 编辑插件
 *
 * 功能：在双栏编辑器标题栏右侧提供"word编辑"按钮，点击弹出 A4 编辑浮窗
 * 挂载位置：title-right
 * 输入参数：PluginProps（currentQuestion / onUpdateField）
 * 返回值：触发按钮 + 弹窗
 * 使用场景：校对工作台"题目内容"组件右上角
 *
 * 行为说明：
 *   - 仅在有 currentQuestion 时显示按钮
 *   - 弹窗关闭后通过 onUpdateField("word_content", content) 持久化
 *   - 首次打开时如无 word_content，自动用题目 images 作为初始图片源
 */
import { useState, useCallback } from "react"
import { FileText } from "lucide-react"
import type { PluginProps } from "@/types/plugin"
import WordEditor, { type WordContent } from "@/components/question/WordEditor"

/**
 * 归一化后端 images 字段为 URL 数组
 * 功能：与 ProofreadingWorkbench.normalizeImages 行为一致（独立实现避免耦合）
 * 输入参数：images — 后端 images 字段（string[] | object[] | null）
 * 返回值：URL 字符串数组
 */
function normalizeImages(images: unknown[] | null | undefined): string[] {
  if (!images || !Array.isArray(images)) return []
  return images
    .map((item) => {
      if (typeof item === "string") return item
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        return String(obj.path || obj.url || "")
      }
      return ""
    })
    .filter((url) => url.length > 0)
    .map((raw) => {
      // URL 补全：参考 ProofreadingWorkbench 的补全规则
      if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
      if (raw.startsWith("/data/")) return raw
      if (raw.startsWith("/images/")) return "/data" + raw
      return "/data/images/" + raw
    })
}

export default function WordEditorWrapper({ currentQuestion, onUpdateField }: PluginProps) {
  // 弹窗开关
  const [open, setOpen] = useState(false)

  // 无选中题目时不渲染按钮
  if (!currentQuestion) return null

  /**
   * 处理保存
   * 功能：把 word_content 写回题目
   */
  const handleSave = useCallback(
    async (content: WordContent) => {
      await onUpdateField("word_content", content as unknown)
    },
    [onUpdateField],
  )

  // 解析 word_content
  const initialContent: WordContent | null =
    currentQuestion.word_content &&
    typeof currentQuestion.word_content === "object" &&
    "html" in (currentQuestion.word_content as Record<string, unknown>)
      ? (currentQuestion.word_content as unknown as WordContent)
      : null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-0.5 text-xs border border-blue-200 text-blue-600 rounded hover:bg-blue-50 transition-colors"
        title="在 A4 页面中像 Word 一样编辑文本和图片"
      >
        <FileText size={12} /> word编辑
      </button>
      <WordEditor
        open={open}
        onClose={() => setOpen(false)}
        initialContent={initialContent}
        fallbackImageUrls={normalizeImages(currentQuestion.images)}
        onSave={handleSave}
      />
    </>
  )
}
