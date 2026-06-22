/**
 * ZoomableImage — 可缩放/平移图片组件
 *
 * 功能：支持鼠标滚轮缩放、拖拽平移、单击重置。
 *       缩放比例 0.3x ~ 5x，中心点缩放，平移基于缩放后的可视坐标。
 * 输入参数：
 *   src: string — 图片 URL
 *   alt?: string — 替代文本
 *   className?: string — 容器额外样式
 *   minScale?: number — 最小缩放，默认 0.3
 *   maxScale?: number — 最大缩放，默认 5
 * 返回值：JSX 可缩放图片组件
 * 使用场景：分题页题目配图查看 / 图片库预览 / 校对工作台
 */
import { useState, useRef, useEffect, useCallback } from "react"
import { ZoomIn, ZoomOut, RotateCcw, Move } from "lucide-react"
import { cn } from "@/utils/cn"

/** 组件属性 */
interface ZoomableImageProps {
  /** 图片地址 */
  src: string
  /** 替代文本 */
  alt?: string
  /** 容器样式 */
  className?: string
  /** 最小缩放比例 */
  minScale?: number
  /** 最大缩放比例 */
  maxScale?: number
  /** 是否显示工具栏 */
  showToolbar?: boolean
}

/** 缩放步长 */
const ZOOM_STEP = 0.2

/**
 * 可缩放图片组件
 * - 滚轮：以上方鼠标位置为锚点缩放
 * - 拖拽：缩放后可平移
 * - 工具栏：放大/缩小/重置
 */
export default function ZoomableImage({
  src,
  alt = "可缩放图片",
  className,
  minScale = 0.3,
  maxScale = 5,
  showToolbar = true,
}: ZoomableImageProps) {
  // 当前缩放比例
  const [scale, setScale] = useState(1)
  // 平移偏移（基于容器坐标系）
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false)
  // 加载失败
  const [isError, setIsError] = useState(false)
  // 拖拽起点
  const dragStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  // 容器引用
  const containerRef = useRef<HTMLDivElement>(null)

  // 重置变换
  const resetTransform = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // 当 src 变化时重置（与外部 src prop 同步的标准场景）
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    resetTransform()
    setIsError(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  /**
   * 滚轮缩放处理
   * 以鼠标位置为锚点缩放，保证视觉中心不变
   */
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      // 鼠标在容器内的坐标
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // 容器中心
      const cx = rect.width / 2
      const cy = rect.height / 2
      // 计算新缩放
      const direction = e.deltaY > 0 ? -1 : 1
      const nextScale = Math.max(
        minScale,
        Math.min(maxScale, scale + direction * ZOOM_STEP),
      )
      if (nextScale === scale) return
      // 以鼠标为锚点：调整 offset 使鼠标处像素保持不动
      // 偏移差 = (新比例 - 旧比例) * (鼠标 - 中心) / 新比例
      const dx = ((nextScale - scale) * (mx - cx)) / nextScale
      const dy = ((nextScale - scale) * (my - cy)) / nextScale
      setScale(nextScale)
      setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
    },
    [scale, minScale, maxScale],
  )

  /** 鼠标按下：开始拖拽 */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 仅左键
      if (e.button !== 0) return
      e.preventDefault()
      setIsDragging(true)
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        ox: offset.x,
        oy: offset.y,
      }
    },
    [offset],
  )

  /** 鼠标移动：实时更新偏移 */
  useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent) => {
      const start = dragStartRef.current
      if (!start) return
      setOffset({
        x: start.ox + (e.clientX - start.x),
        y: start.oy + (e.clientY - start.y),
      })
    }
    const handleUp = () => {
      setIsDragging(false)
      dragStartRef.current = null
    }
    window.addEventListener("mousemove", handleMove)
    window.addEventListener("mouseup", handleUp)
    return () => {
      window.removeEventListener("mousemove", handleMove)
      window.removeEventListener("mouseup", handleUp)
    }
  }, [isDragging])

  /** 工具栏按钮 */
  const zoomIn = () => setScale((s) => Math.min(maxScale, s + ZOOM_STEP))
  const zoomOut = () => setScale((s) => Math.max(minScale, s - ZOOM_STEP))

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full overflow-hidden bg-slate-50 select-none",
        isDragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
    >
      {/* 图片本体 */}
      {!isError ? (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onError={() => setIsError(true)}
          className="absolute left-1/2 top-1/2 max-w-none pointer-events-none"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transformOrigin: "center center",
            maxHeight: "100%",
            maxWidth: "100%",
          }}
        />
      ) : (
        <div className="flex flex-col items-center justify-center w-full h-full text-slate-300 text-xs">
          图片加载失败
        </div>
      )}

      {/* 工具栏 */}
      {showToolbar && !isError && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur rounded-full shadow-md border border-slate-200 text-xs z-10">
          <button
            type="button"
            onClick={zoomOut}
            disabled={scale <= minScale}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="缩小"
            aria-label="缩小"
          >
            <ZoomOut size={12} />
          </button>
          <span className="px-1.5 min-w-[40px] text-center text-slate-600 font-medium">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={scale >= maxScale}
            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="放大"
            aria-label="放大"
          >
            <ZoomIn size={12} />
          </button>
          <span className="w-px h-3 bg-slate-200 mx-0.5" />
          <button
            type="button"
            onClick={resetTransform}
            className="p-1 rounded hover:bg-slate-100 transition-colors"
            title="重置"
            aria-label="重置"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      )}

      {/* 拖拽提示（缩放>1 时显示） */}
      {showToolbar && scale > 1 && !isError && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-black/60 text-white text-[10px] rounded z-10 pointer-events-none">
          <Move size={10} />
          可拖拽平移
        </div>
      )}
    </div>
  )
}
