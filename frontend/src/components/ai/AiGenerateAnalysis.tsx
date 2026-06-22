/**
 * AI 生成标准解析弹窗
 *
 * 功能：调用 AI 为题目生成标准解析，展示可编辑的解析文本供用户确认
 * 输入参数：open（是否打开）、onClose（关闭回调）、questionId（题目ID）、
 *   onApply（应用回调，传入生成的解析文本）
 * 返回值：React 组件
 * 使用场景：题目缺少解析时一键生成
 */
import { useState, useEffect, useCallback } from "react"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import Modal from "@/components/common/Modal"
import { aiGenerateAnalysis } from "@/api/ai"
import type { AiProviderSelection } from "@/api/ai"
import { cn } from "@/utils/cn"

/* ========== Props 类型 ========== */

export interface AiGenerateAnalysisProps {
  open: boolean // 是否打开
  onClose: () => void // 关闭回调
  questionId: string // 题目ID
  onApply: (analysis: string) => void // 应用回调，传入解析文本
  aiSelection?: AiProviderSelection // AI供应商/模型选择
}

/* ========== 主组件 ========== */

export default function AiGenerateAnalysis({
  open,
  onClose,
  questionId,
  onApply,
  aiSelection,
}: AiGenerateAnalysisProps) {
  /* ========== 状态 ========== */

  const [loading, setLoading] = useState(false) // 加载状态
  const [error, setError] = useState<string | null>(null) // 错误信息
  const [analysis, setAnalysis] = useState("") // 生成的解析文本（可编辑）

  /* ========== 请求 AI 生成解析 ========== */

  const fetchResults = useCallback(async () => {
    if (!questionId) return // 题目ID为空则跳过
    setLoading(true) // 开始加载
    setError(null) // 清空错误
    setAnalysis("") // 清空解析

    try {
      const res = await aiGenerateAnalysis(questionId, aiSelection) // 调用API，传递供应商/模型
      if (!res.success) {
        setError(res.message || "AI 生成解析失败") // 显示错误
        return
      }
      // 从 data 中提取解析文本
      const text = (res.data?.analysis as string) || "" // 提取解析内容
      setAnalysis(text) // 设置解析
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

  /* ========== 应用替换 ========== */

  const handleApply = () => {
    if (!analysis.trim()) return // 解析为空则跳过
    onApply(analysis) // 传入解析文本
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

  /* ========== 渲染：解析编辑区 ========== */

  const renderResults = () => (
    <div className="space-y-3">
      {/* 提示文字 */}
      <p className="text-xs text-slate-500">
        AI 生成的解析如下，您可以直接编辑后再应用
      </p>
      {/* 可编辑的文本区 */}
      <textarea
        value={analysis} // 解析文本
        onChange={(e) => setAnalysis(e.target.value)} // 编辑更新
        rows={10} // 行数
        className="w-full rounded-lg border border-slate-200 p-3 text-sm text-slate-800 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent whitespace-pre-wrap"
        placeholder="解析内容将在此显示..."
      />
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
      {/* 应用替换按钮 */}
      <button
        onClick={handleApply}
        disabled={!analysis.trim()} // 解析为空时禁用
        className={cn(
          "px-4 py-2 text-sm rounded-md transition-colors",
          analysis.trim()
            ? "bg-blue-600 text-white hover:bg-blue-700" // 有内容时蓝色
            : "bg-slate-100 text-slate-400 cursor-not-allowed" // 无内容时灰色
        )}
      >
        应用替换
      </button>
    </>
  )

  /* ========== 主渲染 ========== */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 生成标准解析"
      width="max-w-xl"
      footer={!loading && !error && analysis ? renderFooter() : undefined}
    >
      {loading && renderLoading()}
      {!loading && error && renderError()}
      {!loading && !error && !analysis && renderEmpty()}
      {!loading && !error && analysis && renderResults()}
    </Modal>
  )
}
