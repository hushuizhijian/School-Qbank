/**
 * ParseProgressView — 解析进度展示组件
 * 功能：根据不同状态展示引导提示、进度环形图、完成摘要或错误信息
 * 输入：status 状态，progress 进度，stage 阶段文字，parsedCount 已识别题数，
 *       totalCount 总题数，errorCount 异常题数，paperId 试卷ID
 * 返回：进度展示 JSX
 * 使用场景：PaperUploadPage 右侧进度区
 */
import { FileText, CheckCircle2, XCircle, ArrowRight, RotateCcw } from "lucide-react"
import { cn } from "@/utils/cn"
import { useNavigate } from "react-router-dom"

/** 组件属性 */
interface ParseProgressViewProps {
  status: 'idle' | 'parsing' | 'completed' | 'failed'  // 状态
  progress: number        // 进度 0-100
  stage: string           // 当前阶段文字
  parsedCount: number     // 已识别题数
  totalCount: number      // 总题数（完成后）
  errorCount: number      // 异常题数
  paperId?: string        // 试卷ID（完成后用于跳转）
  onRetry?: () => void    // 重试回调
}

/**
 * SVG 环形进度图
 * 功能：根据进度绘制环形进度条
 * 输入：progress 进度百分比 0-100，size 尺寸，strokeWidth 线宽
 */
function CircularProgress({
  progress,
  size = 120,
  strokeWidth = 8,
}: {
  progress: number
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2  // 半径
  const circumference = 2 * Math.PI * radius // 周长
  const offset = circumference - (progress / 100) * circumference // 偏移量

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* 背景圆环 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={strokeWidth}
      />
      {/* 进度圆环 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
    </svg>
  )
}

/** 空闲状态视图 */
function IdleView() {
  return (
    <div className="text-center">
      {/* 示意图标 */}
      <div className="relative inline-block mb-4">
        <FileText size={64} className="text-slate-200" />
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
          <ArrowRight size={12} className="text-blue-500" />
        </div>
      </div>
      {/* 引导文字 */}
      <p className="text-lg text-slate-400 mb-1">准备就绪</p>
      <p className="text-sm text-slate-300">
        在左侧上传文件并配置参数后，点击「开始解析」
      </p>
    </div>
  )
}

/** 解析中状态视图 */
function ParsingView({
  progress,
  stage,
  parsedCount,
}: {
  progress: number
  stage: string
  parsedCount: number
}) {
  return (
    <div className="text-center">
      {/* 环形进度图 + 中心百分比 */}
      <div className="relative inline-block mb-4">
        <CircularProgress progress={progress} />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold text-slate-700">
            {Math.round(progress)}%
          </span>
        </div>
      </div>

      {/* 当前阶段文字 */}
      <p className="text-sm text-slate-600 mb-2">{stage}</p>

      {/* 已识别题数 */}
      <p className="text-xs text-slate-400">
        已识别 <span className="text-blue-600 font-medium">{parsedCount}</span> 道题目
      </p>
    </div>
  )
}

/** 完成状态视图 */
function CompletedView({
  totalCount,
  errorCount,
  paperId,
}: {
  totalCount: number
  errorCount: number
  paperId?: string
}) {
  const navigate = useNavigate()
  const normalCount = totalCount - errorCount // 正常题数

  /** 跳转到校对页面 */
  const goToProofreading = () => {
    if (paperId) {
      navigate(`/papers/${paperId}`) // 跳转校对页
    }
  }

  return (
    <div className="text-center">
      {/* 完成图标 */}
      <CheckCircle2 size={56} className="text-green-500 mx-auto mb-3" />

      {/* 完成标题 */}
      <p className="text-lg font-medium text-slate-700 mb-4">解析完成</p>

      {/* 摘要卡片 */}
      <div className="inline-flex gap-4 p-4 bg-white rounded-xl border border-slate-200 mb-4">
        {/* 总题数 */}
        <div className="text-center">
          <p className="text-2xl font-semibold text-slate-700">{totalCount}</p>
          <p className="text-xs text-slate-400">总题数</p>
        </div>
        {/* 正常题数 */}
        <div className="text-center">
          <p className="text-2xl font-semibold text-green-600">{normalCount}</p>
          <p className="text-xs text-slate-400">正常</p>
        </div>
        {/* 异常题数 */}
        <div className="text-center">
          <p className={cn(
            "text-2xl font-semibold",
            errorCount > 0 ? "text-red-500" : "text-slate-400" // 有异常标红
          )}>
            {errorCount}
          </p>
          <p className="text-xs text-slate-400">异常</p>
        </div>
      </div>

      {/* 进入校对按钮 */}
      <div>
        <button
          onClick={goToProofreading}
          disabled={!paperId}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          进入校对
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}

/** 失败状态视图 */
function FailedView({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="text-center">
      {/* 错误图标 */}
      <XCircle size={56} className="text-red-500 mx-auto mb-3" />

      {/* 错误标题 */}
      <p className="text-lg font-medium text-slate-700 mb-2">解析失败</p>

      {/* 错误描述 */}
      <p className="text-sm text-slate-400 mb-4">
        解析过程中发生错误，请检查文件后重试
      </p>

      {/* 重试按钮 */}
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
        >
          <RotateCcw size={14} />
          重新解析
        </button>
      )}
    </div>
  )
}

/** 解析进度展示主组件 */
export default function ParseProgressView({
  status,
  progress,
  stage,
  parsedCount,
  totalCount,
  errorCount,
  paperId,
  onRetry,
}: ParseProgressViewProps) {
  return (
    <div className="flex items-center justify-center h-full">
      {status === 'idle' && <IdleView />}
      {status === 'parsing' && (
        <ParsingView progress={progress} stage={stage} parsedCount={parsedCount} />
      )}
      {status === 'completed' && (
        <CompletedView totalCount={totalCount} errorCount={errorCount} paperId={paperId} />
      )}
      {status === 'failed' && <FailedView onRetry={onRetry} />}
    </div>
  )
}
