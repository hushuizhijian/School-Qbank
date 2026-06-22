/**
 * AI 匹配知识点弹窗
 *
 * 功能：调用 AI 自动匹配题目知识点，展示推荐列表供用户勾选
 * 输入参数：open（是否打开）、onClose（关闭回调）、questionId（题目ID）、
 *   onApply（应用回调，传入选中的知识点ID列表）
 * 返回值：React 组件
 * 使用场景：题目编辑时一键匹配知识点
 */
import { useState, useEffect, useCallback } from "react"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import Modal from "@/components/common/Modal"
import { aiMatchKnowledge, type AiProviderSelection } from "@/api/ai"
import { cn } from "@/utils/cn"
import type { AiMatchKnowledgeResult } from "@/types/ai"

/* ========== Props 类型 ========== */

export interface AiMatchKnowledgeProps {
  open: boolean // 是否打开
  onClose: () => void // 关闭回调
  questionId: string // 题目ID
  onApply: (kpIds: string[]) => void // 应用回调，传入选中的知识点ID列表
  aiSelection?: AiProviderSelection // AI供应商/模型选择
}

/* ========== 常量 ========== */

/** 默认自动勾选的置信度阈值 */
const AUTO_CHECK_THRESHOLD = 0.7

/* ========== 主组件 ========== */

export default function AiMatchKnowledge({
  open,
  onClose,
  questionId,
  onApply,
  aiSelection,
}: AiMatchKnowledgeProps) {
  /* ========== 状态 ========== */

  const [loading, setLoading] = useState(false) // 加载状态
  const [error, setError] = useState<string | null>(null) // 错误信息
  const [results, setResults] = useState<AiMatchKnowledgeResult[]>([]) // 匹配结果列表
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set()) // 已勾选的知识点ID集合

  /* ========== 请求 AI 匹配 ========== */

  const fetchResults = useCallback(async () => {
    if (!questionId) return // 题目ID为空则跳过
    setLoading(true) // 开始加载
    setError(null) // 清空错误
    setResults([]) // 清空结果
    setCheckedIds(new Set()) // 清空勾选

    try {
      const res = await aiMatchKnowledge(questionId, aiSelection) // 调用API，传递供应商/模型选择
      if (!res.success) {
        setError(res.message || "AI 匹配失败") // 显示错误
        return
      }
      // 从 data 中提取匹配结果列表
      const items = (res.data?.matches || []) as AiMatchKnowledgeResult[]
      setResults(items) // 设置结果
      // 默认勾选置信度 > 70% 的项
      const defaultChecked = new Set(
        items
          .filter((item) => item.confidence > AUTO_CHECK_THRESHOLD)
          .map((item) => item.kp_code) // 取知识点编码
      )
      setCheckedIds(defaultChecked) // 设置默认勾选
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

  /* ========== 勾选切换 ========== */

  const toggleCheck = (kpCode: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev) // 复制集合
      if (next.has(kpCode)) {
        next.delete(kpCode) // 取消勾选
      } else {
        next.add(kpCode) // 添加勾选
      }
      return next
    })
  }

  /* ========== 全选/取消全选 ========== */

  const toggleAll = () => {
    if (checkedIds.size === results.length) {
      setCheckedIds(new Set()) // 已全选则取消全选
    } else {
      setCheckedIds(new Set(results.map((r) => r.kp_code))) // 否则全选
    }
  }

  /* ========== 应用所选 ========== */

  const handleApply = () => {
    onApply(Array.from(checkedIds)) // 传入选中的知识点ID列表
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

  /* ========== 渲染：置信度颜色 ========== */

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-green-600" // 高置信度绿色
    if (confidence >= 0.7) return "text-blue-600" // 中置信度蓝色
    return "text-amber-600" // 低置信度黄色
  }

  /* ========== 渲染：结果列表 ========== */

  const renderResults = () => (
    <div className="space-y-2">
      {/* 全选操作栏 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500">
          共 {results.length} 条推荐，已选 {checkedIds.size} 条
        </span>
        <button
          onClick={toggleAll} // 全选/取消全选
          className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
        >
          {checkedIds.size === results.length ? "取消全选" : "全选"}
        </button>
      </div>

      {/* 推荐列表 */}
      {results.map((item) => {
        const isChecked = checkedIds.has(item.kp_code) // 是否已勾选
        return (
          <label
            key={item.kp_code} // 以知识点编码为key
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
              isChecked
                ? "border-blue-200 bg-blue-50/50" // 选中态样式
                : "border-slate-100 hover:border-slate-200 hover:bg-slate-50" // 未选中态样式
            )}
          >
            {/* 勾选框 */}
            <input
              type="checkbox"
              checked={isChecked} // 勾选状态
              onChange={() => toggleCheck(item.kp_code)} // 切换勾选
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {/* 知识点信息 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">{item.kp_name}</span> {/* 知识点名称 */}
                <span className={cn("text-xs font-medium", getConfidenceColor(item.confidence))}>
                  {Math.round(item.confidence * 100)}%置信度 {/* 置信度百分比 */}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{item.reason}</p> {/* 匹配理由 */}
            </div>
          </label>
        )
      })}
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
      {/* 应用所选按钮 */}
      <button
        onClick={handleApply}
        disabled={checkedIds.size === 0} // 无选中时禁用
        className={cn(
          "px-4 py-2 text-sm rounded-md transition-colors",
          checkedIds.size > 0
            ? "bg-blue-600 text-white hover:bg-blue-700" // 有选中时蓝色
            : "bg-slate-100 text-slate-400 cursor-not-allowed" // 无选中时灰色
        )}
      >
        应用所选({checkedIds.size})
      </button>
    </>
  )

  /* ========== 主渲染 ========== */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 匹配知识点"
      width="max-w-xl"
      footer={!loading && !error && results.length > 0 ? renderFooter() : undefined}
    >
      {loading && renderLoading()}
      {!loading && error && renderError()}
      {!loading && !error && results.length === 0 && renderEmpty()}
      {!loading && !error && results.length > 0 && renderResults()}
    </Modal>
  )
}
