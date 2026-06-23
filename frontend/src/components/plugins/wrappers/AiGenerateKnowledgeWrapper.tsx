/**
 * AI 生成知识点插件包装器（一键直接保存）
 *
 * 功能：点击按钮直接调用 AI 匹配知识点，自动保存到当前题目，无弹窗
 * 挂载位置：editor-bottom
 *
 * 与 AiMatchKnowledgeWrapper 的区别：
 *   - AiMatchKnowledgeWrapper：弹窗交互，AI 返回候选列表供用户勾选确认
 *   - AiGenerateKnowledgeWrapper：一键调用，AI 自动保存到题目（兜底场景）
 *
 * 使用场景：进入校对页时 batch_auto_ai 失败的题目（缺知识点），用户手动重试
 */
import { useState } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { toast } from "sonner"
import type { PluginProps } from "@/types/plugin"
import { aiMatchKnowledge } from "@/api/ai"

export default function AiGenerateKnowledgeWrapper({
  currentQuestion,
  aiSelection,
  onRefresh,
}: PluginProps) {
  // 一键调用 loading 状态
  const [loading, setLoading] = useState(false)

  /**
   * 一键调用 AI 匹配知识点并自动保存
   *
   * 功能：调用后端 /api/ai/match-knowledge，AI 自动分析题干 + 自动创建新知识点 + 自动写回题目
   * 输入参数：无
   * 返回值：无
   * 使用场景：校对工作台，AI 批量补全失败的题目可手动重试
   */
  const handleGenerate = async () => {
    // 无当前题目时直接返回
    if (!currentQuestion) return

    setLoading(true)
    try {
      // 调用 AI 匹配知识点（后端会自动保存到题目）
      const res = await aiMatchKnowledge(currentQuestion.id, aiSelection)
      if (!res.success) {
        toast.error(res.message || "AI 生成知识点失败")
        return
      }

      // 成功提示（包含新建知识点数）
      const newCount = (res.data?.new_knowledge_points as string[] | undefined)?.length || 0
      const matchedCount = (res.data?.matched_ids as string[] | undefined)?.length || 0
      const msg = newCount > 0
        ? `已匹配 ${matchedCount} 个知识点（新建 ${newCount} 个）`
        : `已匹配 ${matchedCount} 个知识点`
      toast.success(msg)

      // 刷新当前题目数据
      if (onRefresh) {
        await onRefresh()
      }
    } catch (err) {
      console.error("AI 生成知识点失败:", err)
      toast.error(err instanceof Error ? err.message : "AI 生成知识点失败")
    } finally {
      setLoading(false)
    }
  }

  // 按钮禁用条件：无当前题目 或 正在加载
  const disabled = !currentQuestion || loading

  return (
    <button
      onClick={handleGenerate}
      disabled={disabled}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                 bg-purple-50 text-purple-600 border border-purple-200 rounded
                 hover:bg-purple-100 transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
      title="AI 一键匹配并保存知识点（无需确认）"
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Sparkles size={12} />
      )}
      AI 生成知识点
    </button>
  )
}
