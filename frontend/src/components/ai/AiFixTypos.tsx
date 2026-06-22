/**
 * AI 错别字校正弹窗
 *
 * 功能：调用 AI 检测题目中的错别字，展示修改建议供用户逐条确认
 * 输入参数：open（是否打开）、onClose（关闭回调）、questionId（题目ID）、
 *   onApply（应用回调，传入确认的修正列表）
 * 返回值：React 组件
 * 使用场景：题目文本质量校验与修正
 */
import { useState, useEffect, useCallback } from "react"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import Modal from "@/components/common/Modal"
import { aiFixTypos, type AiProviderSelection } from "@/api/ai"
import { cn } from "@/utils/cn"

/* ========== Props 类型 ========== */

export interface AiFixTyposProps {
  open: boolean // 是否打开
  onClose: () => void // 关闭回调
  questionId: string // 题目ID
  onApply: (corrections: { original: string; corrected: string; reason: string }[]) => void // 应用回调
  aiSelection?: AiProviderSelection // AI供应商/模型选择
}

/* ========== 修正项数据类型 ========== */

interface CorrectionItem {
  original: string // 原文
  corrected: string // 修正后
  reason: string // 修正理由
}

/* ========== 主组件 ========== */

export default function AiFixTypos({
  open,
  onClose,
  questionId,
  onApply,
  aiSelection,
}: AiFixTyposProps) {
  /* ========== 状态 ========== */

  const [loading, setLoading] = useState(false) // 加载状态
  const [error, setError] = useState<string | null>(null) // 错误信息
  const [corrections, setCorrections] = useState<CorrectionItem[]>([]) // 修正建议列表
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(new Set()) // 已确认的修正索引集合

  /* ========== 请求 AI 校正 ========== */

  const fetchResults = useCallback(async () => {
    if (!questionId) return // 题目ID为空则跳过
    setLoading(true) // 开始加载
    setError(null) // 清空错误
    setCorrections([]) // 清空结果
    setCheckedIndices(new Set()) // 清空勾选

    try {
      const res = await aiFixTypos(questionId, aiSelection) // 调用API，传递供应商/模型选择
      if (!res.success) {
        setError(res.message || "AI 校正失败") // 显示错误
        return
      }
      // 从 data 中提取修正列表
      const items = (res.data?.corrections || []) as CorrectionItem[]
      setCorrections(items) // 设置结果
      // 默认全部勾选
      setCheckedIndices(new Set(items.map((_, i) => i))) // 默认全选
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

  const toggleCheck = (index: number) => {
    setCheckedIndices((prev) => {
      const next = new Set(prev) // 复制集合
      if (next.has(index)) {
        next.delete(index) // 取消勾选
      } else {
        next.add(index) // 添加勾选
      }
      return next
    })
  }

  /* ========== 全选/取消全选 ========== */

  const toggleAll = () => {
    if (checkedIndices.size === corrections.length) {
      setCheckedIndices(new Set()) // 已全选则取消全选
    } else {
      setCheckedIndices(new Set(corrections.map((_, i) => i))) // 否则全选
    }
  }

  /* ========== 应用所选 ========== */

  const handleApplySelected = () => {
    const selected = corrections.filter((_, i) => checkedIndices.has(i)) // 过滤已选
    onApply(selected) // 传入确认的修正列表
    onClose() // 关闭弹窗
  }

  /* ========== 全部应用 ========== */

  const handleApplyAll = () => {
    onApply(corrections) // 传入全部修正
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

  /* ========== 渲染：修正列表 ========== */

  const renderResults = () => (
    <div className="space-y-2">
      {/* 操作栏 */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500">
          共 {corrections.length} 处修正，已选 {checkedIndices.size} 处
        </span>
        <button
          onClick={toggleAll} // 全选/取消全选
          className="text-xs text-blue-600 hover:text-blue-700 transition-colors"
        >
          {checkedIndices.size === corrections.length ? "取消全选" : "全选"}
        </button>
      </div>

      {/* 修正建议列表 */}
      {corrections.map((item, index) => {
        const isChecked = checkedIndices.has(index) // 是否已勾选
        return (
          <label
            key={index} // 以索引为key
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
              onChange={() => toggleCheck(index)} // 切换勾选
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            {/* 修正内容 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {/* 原文：红色删除线 */}
                <span className="text-red-500 line-through text-sm font-medium">
                  {item.original}
                </span>
                {/* 箭头 */}
                <span className="text-slate-400 text-xs">→</span>
                {/* 修正后：绿色 */}
                <span className="text-green-600 text-sm font-medium">
                  {item.corrected}
                </span>
              </div>
              {/* 修正理由 */}
              <p className="text-xs text-slate-500 mt-1">{item.reason}</p>
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
        onClick={handleApplySelected}
        disabled={checkedIndices.size === 0} // 无选中时禁用
        className={cn(
          "px-4 py-2 text-sm rounded-md transition-colors",
          checkedIndices.size > 0
            ? "bg-blue-600 text-white hover:bg-blue-700" // 有选中时蓝色
            : "bg-slate-100 text-slate-400 cursor-not-allowed" // 无选中时灰色
        )}
      >
        应用所选
      </button>
      {/* 全部应用按钮 */}
      <button
        onClick={handleApplyAll}
        className="px-4 py-2 text-sm bg-green-600 text-white hover:bg-green-700 rounded-md transition-colors"
      >
        全部应用
      </button>
    </>
  )

  /* ========== 主渲染 ========== */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 错别字校正"
      width="max-w-xl"
      footer={!loading && !error && corrections.length > 0 ? renderFooter() : undefined}
    >
      {loading && renderLoading()}
      {!loading && error && renderError()}
      {!loading && !error && corrections.length === 0 && renderEmpty()}
      {!loading && !error && corrections.length > 0 && renderResults()}
    </Modal>
  )
}
