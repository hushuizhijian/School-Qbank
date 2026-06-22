/**
 * AI 拆分小问弹窗
 *
 * 功能：调用 AI 将复合题拆分为多个小问，展示拆分预览供用户确认
 * 输入参数：open（是否打开）、onClose（关闭回调）、questionId（题目ID）、
 *   onApply（应用回调，传入拆分后的小问列表）
 * 返回值：React 组件
 * 使用场景：复合题拆分为独立小问
 */
import { useState, useEffect, useCallback } from "react"
import { Loader2, RefreshCw, Sparkles, ListOrdered } from "lucide-react"
import Modal from "@/components/common/Modal"
import { aiSplitSubquestions, type AiProviderSelection } from "@/api/ai"
import { cn } from "@/utils/cn"

/* ========== Props 类型 ========== */

export interface AiSplitSubQuestionsProps {
  open: boolean // 是否打开
  onClose: () => void // 关闭回调
  questionId: string // 题目ID
  onApply: (subQuestions: { sub_no: number; content: string }[]) => void // 应用回调
  aiSelection?: AiProviderSelection // AI供应商/模型选择
}

/* ========== 小问数据类型 ========== */

interface SubQuestion {
  sub_no: number // 小问序号
  content: string // 小问内容
}

/* ========== 主组件 ========== */

export default function AiSplitSubQuestions({
  open,
  onClose,
  questionId,
  onApply,
  aiSelection,
}: AiSplitSubQuestionsProps) {
  /* ========== 状态 ========== */

  const [loading, setLoading] = useState(false) // 加载状态
  const [error, setError] = useState<string | null>(null) // 错误信息
  const [originalText, setOriginalText] = useState("") // 原始题干文本
  const [subQuestions, setSubQuestions] = useState<SubQuestion[]>([]) // 拆分后的小问列表

  /* ========== 请求 AI 拆分 ========== */

  const fetchResults = useCallback(async () => {
    if (!questionId) return // 题目ID为空则跳过
    setLoading(true) // 开始加载
    setError(null) // 清空错误
    setOriginalText("") // 清空原文
    setSubQuestions([]) // 清空结果

    try {
      const res = await aiSplitSubquestions(questionId, aiSelection) // 调用API，传递供应商/模型选择
      if (!res.success) {
        setError(res.message || "AI 拆分失败") // 显示错误
        return
      }
      // 从 data 中提取原文和拆分结果
      setOriginalText((res.data?.original_text as string) || "") // 设置原文
      const items = (res.data?.sub_questions || []) as SubQuestion[] // 提取小问列表
      setSubQuestions(items) // 设置结果
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败") // 捕获异常
    } finally {
      setLoading(false) // 结束加载
    }
  }, [questionId, aiSelection])

  /* ========== 打开时自动请求 ========== */

  useEffect(() => {
    if (open && questionId) {
      fetchResults() // 弹窗打开时触发请求
    }
  }, [open, questionId, fetchResults])

  /* ========== 应用拆分 ========== */

  const handleApply = () => {
    onApply(subQuestions) // 传入拆分后的小问列表
    onClose() // 关闭弹窗
  }

  /* ========== 渲染：加载状态 ========== */

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" /> {/* 旋转加载图标 */}
      <p className="text-slate-500 text-sm">AI 分析中...</p>
    </div>
  )

  /* ========== 渲染：错误状态 ========== */

  const renderError = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <p className="text-red-500 text-sm">{error}</p> {/* 错误信息 */}
      <button
        onClick={fetchResults} // 重试
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
      >
        <RefreshCw size={14} /> 重试
      </button>
    </div>
  )

  /* ========== 渲染：空结果 ========== */

  const renderEmpty = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Sparkles className="h-8 w-8 text-slate-300" /> {/* 空状态图标 */}
      <p className="text-slate-500 text-sm">AI 未找到可操作的内容</p>
    </div>
  )

  /* ========== 渲染：拆分预览 ========== */

  const renderResults = () => (
    <div className="space-y-4">
      {/* 原文展示区 */}
      <div>
        <h3 className="text-sm font-medium text-slate-600 mb-2">原文</h3>
        <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 whitespace-pre-wrap border border-slate-100">
          {originalText || "（无原文）"} {/* 原始题干文本 */}
        </div>
      </div>

      {/* 拆分结果区 */}
      <div>
        <h3 className="text-sm font-medium text-slate-600 mb-2">
          拆分结果（共 {subQuestions.length} 小问）
        </h3>
        <div className="space-y-2">
          {subQuestions.map((sq) => (
            <div
              key={sq.sub_no} // 以小问序号为key
              className="flex items-start gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-100"
            >
              {/* 小问序号标签 */}
              <span className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-medium">
                {sq.sub_no} {/* 序号 */}
              </span>
              {/* 小问内容 */}
              <p className="text-sm text-slate-800 whitespace-pre-wrap flex-1">
                {sq.content} {/* 小问文本 */}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  /* ========== 渲染：底部操作栏 ========== */

  const renderFooter = () => (
    <>
      {/* 取消按钮 */}
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
      >
        取消
      </button>
      {/* 应用拆分按钮 */}
      <button
        onClick={handleApply}
        className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
      >
        应用拆分
      </button>
    </>
  )

  /* ========== 主渲染 ========== */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 拆分小问"
      width="max-w-xl"
      footer={!loading && !error && subQuestions.length > 0 ? renderFooter() : undefined}
    >
      {loading && renderLoading()}
      {!loading && error && renderError()}
      {!loading && !error && subQuestions.length === 0 && renderEmpty()}
      {!loading && !error && subQuestions.length > 0 && renderResults()}
    </Modal>
  )
}
