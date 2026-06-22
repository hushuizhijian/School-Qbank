/**
 * AI 题干标准化弹窗
 *
 * 功能：调用 AI 将题干文本标准化，左右对比展示原文与标准化结果，diff 标红变更处
 * 输入参数：open（是否打开）、onClose（关闭回调）、questionId（题目ID）、
 *   onApply（应用回调，传入标准化后的题干文本）
 * 返回值：React 组件
 * 使用场景：题干格式不统一时一键标准化
 */
import { useState, useEffect, useCallback } from "react"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import Modal from "@/components/common/Modal"
import { aiStandardizeStem, type AiProviderSelection } from "@/api/ai"
import { cn } from "@/utils/cn"

/* ========== Props 类型 ========== */

export interface AiStandardizeStemProps {
  open: boolean // 是否打开
  onClose: () => void // 关闭回调
  questionId: string // 题目ID
  onApply: (stem: string) => void // 应用回调，传入标准化后的题干
  aiSelection?: AiProviderSelection // AI供应商/模型选择
}

/* ========== 主组件 ========== */

export default function AiStandardizeStem({
  open,
  onClose,
  questionId,
  onApply,
  aiSelection,
}: AiStandardizeStemProps) {
  /* ========== 状态 ========== */

  const [loading, setLoading] = useState(false) // 加载状态
  const [error, setError] = useState<string | null>(null) // 错误信息
  const [originalStem, setOriginalStem] = useState("") // 原始题干
  const [standardizedStem, setStandardizedStem] = useState("") // 标准化后题干

  /* ========== 请求 AI 标准化 ========== */

  const fetchResults = useCallback(async () => {
    if (!questionId) return // 题目ID为空则跳过
    setLoading(true) // 开始加载
    setError(null) // 清空错误
    setOriginalStem("") // 清空原文
    setStandardizedStem("") // 清空标准化结果

    try {
      const res = await aiStandardizeStem(questionId, aiSelection) // 调用API，传递供应商/模型选择
      if (!res.success) {
        setError(res.message || "AI 标准化失败") // 显示错误
        return
      }
      // 从 data 中提取原文和标准化结果
      setOriginalStem((res.data?.original_stem as string) || "") // 设置原文
      setStandardizedStem((res.data?.standardized_stem as string) || "") // 设置标准化结果
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败") // 捕获异常
    } finally {
      setLoading(false) // 结束加载
    }
  }, [questionId, aiSelection])

  /* ========== 打开时自动请求 ========== */

  useEffect(() => {
    if (open && questionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchResults() // 弹窗打开时触发请求
    }
  }, [open, questionId, fetchResults])

  /* ========== 应用标准化 ========== */

  const handleApply = () => {
    if (!standardizedStem.trim()) return // 结果为空则跳过
    onApply(standardizedStem) // 传入标准化后的题干
    onClose() // 关闭弹窗
  }

  /* ========== 简易 diff：逐行对比，标红变更行 ========== */

  const computeDiff = () => {
    const originalLines = originalStem.split("\n") // 原文按行拆分
    const standardLines = standardizedStem.split("\n") // 标准化按行拆分
    const maxLen = Math.max(originalLines.length, standardLines.length) // 取最大行数

    const diffItems = []
    for (let i = 0; i < maxLen; i++) {
      const orig = originalLines[i] ?? "" // 原文行（可能为空）
      const std = standardLines[i] ?? "" // 标准化行（可能为空）
      const changed = orig !== std // 是否有变更
      diffItems.push({ orig, std, changed, lineNo: i + 1 }) // 行号从1开始
    }
    return diffItems
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

  /* ========== 渲染：左右对比 + diff ========== */

  const renderResults = () => {
    const diffItems = computeDiff() // 计算diff
    const hasChanges = diffItems.some((d) => d.changed) // 是否有变更

    return (
      <div className="space-y-3">
        {/* 无变更提示 */}
        {!hasChanges && (
          <p className="text-sm text-slate-500 text-center py-4">
            题干已符合标准格式，无需修改
          </p>
        )}

        {/* 左右对比布局 */}
        <div className="grid grid-cols-2 gap-4">
          {/* 左侧：原文 */}
          <div>
            <h3 className="text-sm font-medium text-slate-600 mb-2">原文</h3>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-700 whitespace-pre-wrap space-y-0.5">
              {diffItems.map((item) => (
                <div
                  key={`orig-${item.lineNo}`}
                  className={cn(
                    "px-1 rounded",
                    item.changed && "bg-red-50 text-red-700" // 变更行标红
                  )}
                >
                  {item.orig || "\u00A0"} {/* 空行用不可见空格占位 */}
                </div>
              ))}
            </div>
          </div>

          {/* 右侧：标准化后 */}
          <div>
            <h3 className="text-sm font-medium text-slate-600 mb-2">标准化后</h3>
            <div className="p-3 bg-green-50/50 rounded-lg border border-green-100 text-sm text-slate-700 whitespace-pre-wrap space-y-0.5">
              {diffItems.map((item) => (
                <div
                  key={`std-${item.lineNo}`}
                  className={cn(
                    "px-1 rounded",
                    item.changed && "bg-green-100 text-green-800 font-medium" // 变更行标绿
                  )}
                >
                  {item.std || "\u00A0"} {/* 空行用不可见空格占位 */}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

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
      {/* 应用标准化按钮 */}
      <button
        onClick={handleApply}
        disabled={!standardizedStem.trim()} // 结果为空时禁用
        className={cn(
          "px-4 py-2 text-sm rounded-md transition-colors",
          standardizedStem.trim()
            ? "bg-blue-600 text-white hover:bg-blue-700" // 有内容时蓝色
            : "bg-slate-100 text-slate-400 cursor-not-allowed" // 无内容时灰色
        )}
      >
        应用标准化
      </button>
    </>
  )

  /* ========== 主渲染 ========== */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 题干标准化"
      width="max-w-2xl"
      footer={!loading && !error && standardizedStem ? renderFooter() : undefined}
    >
      {loading && renderLoading()}
      {!loading && error && renderError()}
      {!loading && !error && !standardizedStem && renderEmpty()}
      {!loading && !error && standardizedStem && renderResults()}
    </Modal>
  )
}
