/**
 * React 错误边界组件
 *
 * 功能：捕获子组件树中的渲染错误，防止整个页面白屏崩溃
 * 输入参数：children — 子组件 / fallback — 自定义错误 UI（可选）
 * 返回值：错误时显示回退 UI，正常时渲染子组件
 * 使用场景：包裹校对工作台等关键页面，捕获异常后提供重新加载入口
 */
import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

/* ========== 类型定义 ========== */

/** 错误边界 Props */
interface ErrorBoundaryProps {
  children: ReactNode                                  // 子组件
  fallback?: ReactNode                                 // 自定义错误回退 UI（可选）
  onError?: (error: Error, errorInfo: string) => void  // 错误上报回调（可选）
}

/** 错误边界 State */
interface ErrorBoundaryState {
  hasError: boolean                                    // 是否捕获到错误
  error: Error | null                                  // 错误对象
}

/* ========== 默认错误回退 UI ========== */

/**
 * 默认错误展示组件
 * 功能：显示错误信息 + 重新加载按钮
 */
function DefaultErrorFallback({
  error,
  onRetry,
}: {
  error: Error | null
  onRetry: () => void
}) {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px] bg-slate-50">
      <div className="text-center max-w-md p-8">
        {/* 错误图标 */}
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertTriangle size={32} className="text-red-500" />
        </div>

        {/* 错误标题 */}
        <h2 className="text-lg font-semibold text-slate-800 mb-2">
          页面加载异常
        </h2>

        {/* 错误描述 */}
        <p className="text-sm text-slate-500 mb-4">
          页面渲染时发生错误，请尝试重新加载。如果问题持续出现，请联系管理员。
        </p>

        {/* 错误详情（折叠） */}
        {error && (
          <details className="mb-4 text-left">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
              查看错误详情
            </summary>
            <pre className="mt-2 p-3 bg-slate-100 rounded text-xs text-red-600 overflow-auto max-h-40 whitespace-pre-wrap">
              {error.message}
              {"\n\n"}
              {error.stack?.slice(0, 500)}
            </pre>
          </details>
        )}

        {/* 重新加载按钮 */}
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw size={14} />
          重新加载页面
        </button>
      </div>
    </div>
  )
}

/* ========== 错误边界类组件 ========== */

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)                                        // 调用父类构造函数
    this.state = { hasError: false, error: null }       // 初始化状态
  }

  /**
   * 静态方法：从错误中派生新状态
   * 输入参数：error — 捕获的错误对象
   * 返回值：新状态 { hasError: true, error }
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }                    // 标记错误并保存错误对象
  }

  /**
   * 生命周期：错误捕获后的副作用处理
   * 输入参数：error — 错误对象 / errorInfo — 组件栈信息
   * 使用场景：错误上报到日志服务
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 输出错误日志到控制台
    console.error("[ErrorBoundary] 捕获到渲染错误:", error)
    console.error("[ErrorBoundary] 组件栈:", errorInfo.componentStack)

    // 调用外部错误上报回调（如有）
    this.props.onError?.(error, errorInfo.componentStack || "")
  }

  /**
   * 重新加载处理函数
   * 功能：重置错误状态，触发页面重新渲染
   */
  handleRetry = () => {
    this.setState({ hasError: false, error: null })     // 清除错误状态
  }

  render() {
    // 有错误时显示回退 UI
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <DefaultErrorFallback
            error={this.state.error}
            onRetry={this.handleRetry}
          />
        )
      )
    }

    // 无错误时正常渲染子组件
    return this.props.children
  }
}