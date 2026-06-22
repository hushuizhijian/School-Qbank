/**
 * 插件错误边界组件
 *
 * 功能：包裹每个插件，捕获渲染异常后显示占位 UI + 重试按钮
 * 输入参数：pluginId（插件标识）、pluginLabel（显示名称）、children（插件组件）
 * 返回值：正常时渲染 children，崩溃时显示占位卡片
 * 使用场景：PluginSlot 内部每个插件外层包裹
 */

import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

/* ========== 类型定义 ========== */

/** 插件错误边界 Props */
interface PluginErrorBoundaryProps {
  pluginId: string                                     // 插件唯一标识
  pluginLabel: string                                  // 插件显示名称
  children: ReactNode                                  // 插件组件
}

/** 插件错误边界 State */
interface PluginErrorBoundaryState {
  hasError: boolean                                    // 是否捕获到错误
  error: Error | null                                  // 错误对象
}

/* ========== 错误边界组件 ========== */

export default class PluginErrorBoundary extends Component<PluginErrorBoundaryProps, PluginErrorBoundaryState> {
  constructor(props: PluginErrorBoundaryProps) {
    super(props)                                        // 调用父类构造函数
    this.state = { hasError: false, error: null }       // 初始化状态
  }

  /**
   * 静态方法：从错误中派生新状态
   * 输入参数：error — 捕获的错误对象
   * 返回值：新状态 { hasError: true, error }
   */
  static getDerivedStateFromError(error: Error): PluginErrorBoundaryState {
    return { hasError: true, error }                    // 标记错误并保存错误对象
  }

  /**
   * 生命周期：错误捕获后的副作用处理
   * 输入参数：error — 错误对象 / errorInfo — 组件栈信息
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[PluginErrorBoundary] 插件 "${this.props.pluginLabel}" 崩溃:`, error)
    console.error("[PluginErrorBoundary] 组件栈:", errorInfo.componentStack)
  }

  /**
   * 重试处理函数
   * 功能：重置错误状态，触发插件重新挂载
   */
  handleRetry = () => {
    this.setState({ hasError: false, error: null })     // 清除错误状态
  }

  render() {
    // 正常渲染插件
    if (!this.state.hasError) {
      return this.props.children
    }

    // 崩溃时显示占位 UI
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        {/* 错误图标 + 标题 */}
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          <span className="text-sm font-medium text-slate-600">
            {this.props.pluginLabel} 暂不可用
          </span>
        </div>

        {/* 错误描述 */}
        <p className="text-xs text-slate-400 mb-2">
          功能加载异常，请尝试重新加载
        </p>

        {/* 错误详情（折叠） */}
        {this.state.error && (
          <details className="mb-2">
            <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
              查看详情
            </summary>
            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs text-red-500 overflow-auto max-h-24 whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          </details>
        )}

        {/* 重试按钮 */}
        <button
          onClick={this.handleRetry}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 text-slate-600 rounded hover:bg-slate-100 transition-colors"
        >
          <RefreshCw size={12} />
          重新加载
        </button>
      </div>
    )
  }
}