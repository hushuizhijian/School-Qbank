/**
 * AI 难度自动标注弹窗
 *
 * 功能：调用 AI 自动评估题目难度，展示推荐难度等级及理由供用户确认
 * 输入参数：open（是否打开）、onClose（关闭回调）、questionId（题目ID）、
 *   onApply（应用回调，传入难度等级字符串）
 * 返回值：React 组件
 * 使用场景：题目难度标注
 */
import { useState, useEffect, useCallback } from "react"
import { Loader2, RefreshCw, Sparkles } from "lucide-react"
import Modal from "@/components/common/Modal"
import { aiAutoDifficulty, type AiProviderSelection } from "@/api/ai"
import { cn } from "@/utils/cn"

/* ========== Props 类型 ========== */

export interface AiAutoDifficultyProps {
  open: boolean // 是否打开
  onClose: () => void // 关闭回调
  questionId: string // 题目ID
  onApply: (difficulty: string) => void // 应用回调，传入难度等级
  aiSelection?: AiProviderSelection // AI供应商/模型选择
}

/* ========== 难度等级配置 ========== */

/** 难度等级样式映射 */
const DIFFICULTY_CONFIG: Record<string, {
  label: string // 中文标签
  color: string // 文字颜色类名
  bg: string // 背景色类名
  border: string // 边框色类名
  icon: string // 图标文字
}> = {
  easy: {
    label: "简单",
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    icon: "😊",
  },
  medium: {
    label: "中等",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    icon: "🤔",
  },
  hard: {
    label: "困难",
    color: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "🔥",
  },
}

/* ========== 主组件 ========== */

export default function AiAutoDifficulty({
  open,
  onClose,
  questionId,
  onApply,
  aiSelection,
}: AiAutoDifficultyProps) {
  /* ========== 状态 ========== */

  const [loading, setLoading] = useState(false) // 加载状态
  const [error, setError] = useState<string | null>(null) // 错误信息
  const [difficulty, setDifficulty] = useState("") // 推荐难度等级
  const [reason, setReason] = useState("") // 推荐理由
  const [confidence, setConfidence] = useState(0) // 置信度

  /* ========== 请求 AI 难度标注 ========== */

  const fetchResults = useCallback(async () => {
    if (!questionId) return // 题目ID为空则跳过
    setLoading(true) // 开始加载
    setError(null) // 清空错误
    setDifficulty("") // 清空难度
    setReason("") // 清空理由
    setConfidence(0) // 清空置信度

    try {
      const res = await aiAutoDifficulty(questionId, aiSelection) // 调用API，传递供应商/模型选择
      if (!res.success) {
        setError(res.message || "AI 难度标注失败") // 显示错误
        return
      }
      // 从 data 中提取难度、理由和置信度
      setDifficulty((res.data?.difficulty as string) || "") // 设置难度等级
      setReason((res.data?.reason as string) || "") // 设置推荐理由
      setConfidence(res.confidence || 0) // 设置置信度
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

  /* ========== 应用难度 ========== */

  const handleApply = () => {
    if (!difficulty) return // 难度为空则跳过
    onApply(difficulty) // 传入难度等级
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

  /* ========== 渲染：难度推荐结果 ========== */

  const renderResults = () => {
    const config = DIFFICULTY_CONFIG[difficulty] // 获取难度配置
    const displayLabel = config?.label || difficulty // 显示标签
    const displayIcon = config?.icon || "📊" // 显示图标

    return (
      <div className="space-y-6">
        {/* 难度等级大号展示 */}
        <div className="flex flex-col items-center gap-4">
          {/* 难度图标 */}
          <span className="text-5xl">{displayIcon}</span>
          {/* 难度标签 */}
          <div
            className={cn(
              "px-6 py-3 rounded-xl border-2 text-2xl font-bold",
              config?.bg || "bg-slate-50", // 背景色
              config?.border || "border-slate-200", // 边框色
              config?.color || "text-slate-700" // 文字色
            )}
          >
            {displayLabel} {/* 难度等级文字 */}
          </div>
          {/* 置信度 */}
          {confidence > 0 && (
            <span className="text-sm text-slate-500">
              置信度 {Math.round(confidence * 100)}%
            </span>
          )}
        </div>

        {/* 推荐理由 */}
        {reason && (
          <div>
            <h3 className="text-sm font-medium text-slate-600 mb-2">推荐理由</h3>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-700 whitespace-pre-wrap">
              {reason} {/* 理由文本 */}
            </div>
          </div>
        )}

        {/* 所有难度等级参考 */}
        <div>
          <h3 className="text-sm font-medium text-slate-600 mb-2">难度等级参考</h3>
          <div className="flex gap-3">
            {Object.entries(DIFFICULTY_CONFIG).map(([key, cfg]) => (
              <div
                key={key}
                className={cn(
                  "flex-1 text-center py-2 px-3 rounded-lg border text-sm",
                  key === difficulty
                    ? cn(cfg.bg, cfg.border, cfg.color, "font-semibold") // 当前选中难度高亮
                    : "bg-white border-slate-100 text-slate-400" // 未选中灰色
                )}
              >
                <span className="text-lg">{cfg.icon}</span>
                <p className="mt-1">{cfg.label}</p>
              </div>
            ))}
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
      {/* 应用按钮 */}
      <button
        onClick={handleApply}
        disabled={!difficulty} // 难度为空时禁用
        className={cn(
          "px-4 py-2 text-sm rounded-md transition-colors",
          difficulty
            ? "bg-blue-600 text-white hover:bg-blue-700" // 有难度时蓝色
            : "bg-slate-100 text-slate-400 cursor-not-allowed" // 无难度时灰色
        )}
      >
        应用
      </button>
    </>
  )

  /* ========== 主渲染 ========== */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AI 难度自动标注"
      width="max-w-md"
      footer={!loading && !error && difficulty ? renderFooter() : undefined}
    >
      {loading && renderLoading()}
      {!loading && error && renderError()}
      {!loading && !error && !difficulty && renderEmpty()}
      {!loading && !error && difficulty && renderResults()}
    </Modal>
  )
}
