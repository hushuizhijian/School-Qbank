/**
 * 全局 SSE 日志悬浮小窗 — 右下角悬浮显示，支持拖拽移动
 * 在所有页面可见，实时显示操作日志和报错
 *
 * 二期优化：增加拖拽移动功能
 *   - 拖拽标题栏可移动面板
 *   - 位置保存到 localStorage
 *   - 双击标题栏恢复默认位置（右下角）
 */
import { useRef, useEffect, useState, useCallback } from "react"
import { X, ChevronDown, ChevronUp, Radio, GripHorizontal } from "lucide-react"
import { useSSEStore } from "@/stores/sseStore"

/** 日志级别颜色映射 */
const levelColors: Record<string, string> = {
  info: "text-blue-600",
  ok: "text-green-600",
  warn: "text-amber-600",
  err: "text-red-600",
}

/** 默认位置（右下角） */
const DEFAULT_POSITION = { left: -1, top: -1 }

/** 从 localStorage 恢复位置 */
function loadPosition(): { left: number; top: number } {
  try {
    const saved = localStorage.getItem("sse-panel-position")
    if (saved) {
      const pos = JSON.parse(saved)
      if (typeof pos.left === "number" && typeof pos.top === "number") {
        return pos
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_POSITION
}

/** 保存位置到 localStorage */
function savePosition(left: number, top: number) {
  try {
    localStorage.setItem("sse-panel-position", JSON.stringify({ left, top }))
  } catch { /* ignore */ }
}

/** 全局 SSE 日志面板 */
export default function GlobalSSEPanel() {
  const logs = useSSEStore((s) => s.logs)
  const clearLogs = useSSEStore((s) => s.clearLogs)
  const [minimized, setMinimized] = useState(false)
  const [visible, setVisible] = useState(true)
  const logBodyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // 拖拽状态
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState<{ left: number; top: number }>(loadPosition)
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  // 自动滚动
  useEffect(() => {
    if (logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight
    }
  }, [logs])

  /** 开始拖拽 */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 忽略按钮点击
    const target = e.target as HTMLElement
    if (target.closest("button")) return

    setIsDragging(true)

    const panel = panelRef.current
    if (!panel) return

    const rect = panel.getBoundingClientRect()
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }

    // 如果使用默认位置（right/bottom定位），先转为绝对坐标
    if (position.left === -1) {
      setPosition({
        left: rect.left,
        top: rect.top,
      })
    }
  }, [position.left])

  /** 拖拽移动 */
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        left: e.clientX - dragOffset.current.x,
        top: e.clientY - dragOffset.current.y,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      // 保存位置
      const panel = panelRef.current
      if (panel) {
        const rect = panel.getBoundingClientRect()
        savePosition(rect.left, rect.top)
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

  /** 双击标题栏恢复默认位置 */
  const handleDoubleClick = () => {
    setPosition(DEFAULT_POSITION)
    savePosition(-1, -1)
  }

  // 隐藏状态：显示小按钮
  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        className="fixed bottom-4 right-4 z-50 px-3 py-1.5 text-xs bg-slate-800 text-white rounded-lg shadow-lg hover:bg-slate-700"
      >
        日志
      </button>
    )
  }

  const lastLog = logs[logs.length - 1]
  const hasError = logs.some((l) => l.level === "err")
  const hasWarn = logs.some((l) => l.level === "warn")

  // 是否使用默认位置（right/bottom 定位）
  const isDefaultPos = position.left === -1

  return (
    <div
      ref={panelRef}
      className={`fixed z-50 w-[320px] rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden ${
        isDragging ? "shadow-xl opacity-95" : ""
      }`}
      style={
        isDefaultPos
          ? { bottom: "1rem", right: "1rem" }
          : { left: `${position.left}px`, top: `${position.top}px` }
      }
    >
      {/* 标题栏（可拖拽） */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className={`flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        } select-none`}
        title="拖拽移动 | 双击恢复默认位置"
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={12} className="text-slate-300" />
          <Radio
            size={10}
            className={
              hasError ? "text-red-500" :
              hasWarn ? "text-amber-500" :
              lastLog ? "text-green-500" :
              "text-slate-400"
            }
          />
          <span className="text-xs font-medium text-slate-700">
            操作日志
            {logs.length > 0 && (
              <span className="ml-1 text-slate-400">({logs.length})</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="p-0.5 rounded hover:bg-slate-200 text-slate-400"
          >
            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            onClick={clearLogs}
            className="p-0.5 rounded hover:bg-slate-200 text-slate-400 text-xs"
            title="清空日志"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 日志内容 */}
      {!minimized && (
        <div
          ref={logBodyRef}
          className="h-[160px] overflow-y-auto p-2 font-mono text-xs leading-5 bg-white"
        >
          {logs.length === 0 ? (
            <span className="text-slate-300">暂无日志</span>
          ) : (
            logs.map((log, i) => (
              <div key={i} className="truncate">
                <span className="text-slate-300">{log.time}</span>
                {" "}
                <span className={levelColors[log.level] || "text-slate-600"}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}