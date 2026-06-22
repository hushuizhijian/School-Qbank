/**
 * DualPaneEditor — 核心双栏编辑器组件
 *
 * 功能：左侧 Monaco Editor + 右侧 KaTeX 预览，中间可拖拽分隔条
 * 输入参数：
 *   value: string — 当前 LaTeX 源码
 *   onChange: (value: string) => void — 内容变更回调
 *   title: string — 标题（如 "题目内容"、"解析内容"）
 *   height?: string — 编辑器高度，默认 '400px'
 *   lowConfidenceRanges?: Array — 低置信度范围，用于黄色高亮
 *   readOnly?: boolean — 是否只读
 *   images?: string[] — 题目图片URL列表（预览区显示）
 *   imagePosition?: 'after-stem' | 'end' — 图片插入位置（after-stem=题干后选项前，end=末尾）
 * 返回值：JSX 双栏编辑器组件
 * 使用场景：校对工作台中的题目内容、解析内容等 LaTeX 编辑+预览
 */
import { useState, useRef, useCallback, useEffect } from "react"
import MonacoEditorPanel from "@/components/question/MonacoEditorPanel"
import KaTeXPreviewPanel from "@/components/question/KaTeXPreviewPanel"
import { cn } from "@/utils/cn"
import type { ImagePosition, TasksRenderOptions } from "@/utils/latexConverter"

/** 低置信度范围定义 */
interface LowConfidenceRange {
  /** 起始行号 */
  startLineNumber: number
  /** 起始列号 */
  startColumn: number
  /** 结束行号 */
  endLineNumber: number
  /** 结束列号 */
  endColumn: number
}

/** 双栏编辑器 Props */
interface DualPaneEditorProps {
  /** 当前 LaTeX 源码 */
  value: string
  /** 内容变更回调 */
  onChange: (value: string) => void
  /** 标题（如 "题目内容"、"解析内容"） */
  title: string
  /** 标题栏右侧附加内容（与标题同行展示，如分行/分列控件） */
  titleExtra?: React.ReactNode
  /** 编辑器高度，默认 '400px' */
  height?: string
  /** 低置信度范围，用于黄色高亮 */
  lowConfidenceRanges?: LowConfidenceRange[]
  /** 是否只读 */
  readOnly?: boolean
  /** 题目图片URL列表（预览区显示） */
  images?: string[]
  /** 图片插入位置：after-stem=题干后选项前，end=末尾 */
  imagePosition?: ImagePosition
  /** tasks 块渲染选项（是否显示 ABCD 标签、列间距等） */
  tasksRenderOptions?: TasksRenderOptions
}

/** 左侧最小宽度（像素） */
const LEFT_MIN_WIDTH = 300
/** 右侧最小宽度（像素） */
const RIGHT_MIN_WIDTH = 300
/** 默认左侧宽度百分比 */
const DEFAULT_LEFT_WIDTH = 50

/** 核心双栏编辑器组件 */
export default function DualPaneEditor({
  value,
  onChange,
  title,
  titleExtra,
  height = "400px",
  lowConfidenceRanges,
  readOnly = false,
  images,
  imagePosition,
  tasksRenderOptions,
}: DualPaneEditorProps) {
  /** 左侧宽度百分比 */
  const [leftWidth, setLeftWidth] = useState(DEFAULT_LEFT_WIDTH)
  /** 是否正在拖拽分隔条 */
  const [isDragging, setIsDragging] = useState(false)
  /** 容器引用，用于计算拖拽位置 */
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * 处理鼠标按下分隔条事件
   * 开始拖拽，注册全局鼠标移动和松开监听
   */
  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault() // 阻止默认行为，防止选中文本
      setIsDragging(true) // 标记拖拽中

      /** 鼠标移动处理：根据鼠标位置计算左侧宽度百分比 */
      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!containerRef.current) return

        const containerRect = containerRef.current.getBoundingClientRect() // 容器位置
        const containerWidth = containerRect.width // 容器总宽度
        const offsetX = moveEvent.clientX - containerRect.left // 鼠标相对容器左侧偏移

        // 计算左侧最小/最大宽度百分比
        const minPercent = (LEFT_MIN_WIDTH / containerWidth) * 100 // 左侧最小百分比
        const maxPercent = ((containerWidth - RIGHT_MIN_WIDTH) / containerWidth) * 100 // 右侧最小对应的最大百分比

        // 计算新的左侧百分比，限制在合法范围内
        const newPercent = Math.min(maxPercent, Math.max(minPercent, (offsetX / containerWidth) * 100))
        setLeftWidth(newPercent) // 更新左侧宽度
      }

      /** 鼠标松开处理：结束拖拽，移除全局监听 */
      const handleMouseUp = () => {
        setIsDragging(false) // 标记拖拽结束
        document.removeEventListener("mousemove", handleMouseMove) // 移除移动监听
        document.removeEventListener("mouseup", handleMouseUp) // 移除松开监听
      }

      // 注册全局监听，确保鼠标移出分隔条区域也能继续拖拽
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [] // 无外部依赖
  )

  /**
   * 构建 Monaco 低置信度装饰器配置
   * 直接传递 lowConfidenceRanges，MonacoEditorPanel 内部会转换为 Monaco 格式
   */
  const decorationRanges = lowConfidenceRanges

  /**
   * 清理副作用：组件卸载时移除可能残留的全局监听
   * 防止拖拽中卸载组件导致内存泄漏
   */
  useEffect(() => {
    return () => {
      // 组件卸载时无需额外清理，因为 mouseup 处理中已移除监听
      // 但如果组件在拖拽中被卸载，需要确保 isDragging 状态重置
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col border border-slate-200 rounded-lg overflow-hidden bg-white", // 基础样式
        isDragging && "select-none" // 拖拽时禁止文本选中
      )}
      style={{ height }} // 动态高度
    >
      {/* 标题栏：左侧标题 + 附加内容 */}
      <div className="h-10 border-b flex items-center px-3 shrink-0 bg-slate-50 gap-3">
        {/* 左侧标题 */}
        <span className="text-sm font-medium text-slate-700 shrink-0">{title}</span>

        {/* 标题旁的附加内容（如分行/分列控件） */}
        {titleExtra && (
          <div className="flex-1 min-w-0 flex items-center">
            {titleExtra}
          </div>
        )}
        {/* 防止 titleExtra 为空时塌陷 */}
        {!titleExtra && <div className="flex-1" />}
      </div>

      {/* 主内容区：左侧编辑器 + 可拖拽分隔条 + 右侧预览 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：Monaco 编辑器面板 — 纯 LaTeX 源码模式 */}
        <div
          className="overflow-hidden relative" // 隐藏溢出
          style={{ width: `${leftWidth}%` }} // 动态宽度
        >
          {/* 左栏标签：LaTeX 源码 */}
          <div className="absolute top-0 right-0 z-10 px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100/80 rounded-bl border-l border-b border-slate-200 select-none pointer-events-none">
            源码
          </div>
          <MonacoEditorPanel
            value={value} // LaTeX 源码
            onChange={onChange} // 内容变更回调
            language="latex" // 语言模式
            decorations={decorationRanges} // 低置信度高亮装饰
            readOnly={readOnly} // 只读模式
          />
        </div>

        {/* 可拖拽分隔条 */}
        <div
          className={cn(
            "w-1 shrink-0 cursor-col-resize transition-colors z-10", // 基础样式：4px宽、可拖拽
            isDragging
              ? "bg-blue-400" // 拖拽中：蓝色高亮
              : "bg-slate-300 hover:bg-blue-400" // 默认：灰色，悬停变蓝
          )}
          onMouseDown={handleDividerMouseDown} // 鼠标按下开始拖拽
        />

        {/* 右侧：KaTeX 预览面板 — 渲染引擎（完全隔离，不影响左栏） */}
        <div
          className="overflow-hidden relative" // 隐藏溢出
          style={{ width: `${100 - leftWidth}%` }} // 动态宽度：剩余百分比
        >
          {/* 右栏标签：预览 */}
          <div className="absolute top-0 left-0 z-10 px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100/80 rounded-br border-r border-b border-slate-200 select-none pointer-events-none">
            预览
          </div>
          <KaTeXPreviewPanel
            latex={value} // LaTeX 源码（防抖在组件内部处理）
            images={images} // 题目图片列表
            imagePosition={imagePosition} // 图片插入位置
            tasksRenderOptions={tasksRenderOptions} // tasks 块渲染选项
          />
        </div>
      </div>
    </div>
  )
}
