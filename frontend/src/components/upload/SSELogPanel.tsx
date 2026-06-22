/**
 * SSELogPanel — 右下角悬浮 SSE 日志小窗
 * 功能：连接后端 SSE 端点，实时显示解析进度日志
 * 输入：paperId 试卷ID（非空时自动连接）
 * 返回：SSE 悬浮窗 JSX
 * 使用场景：PaperUploadPage 等解析页面的进度展示
 */
import { useEffect, useRef, useState, useCallback } from "react"
import { X, ChevronDown, ChevronUp, Radio } from "lucide-react"

/** 单条日志 */
interface LogEntry {
  time: string
  message: string
  level: "info" | "ok" | "warn" | "err"
}

/** 组件属性 */
interface SSELogPanelProps {
  paperId: string | null        // 试卷ID，为 null 时不连接
  onClose?: () => void          // 关闭回调
  onComplete?: (paperId: string) => void  // 解析完成回调
  onError?: (paperId: string, msg: string) => void  // 解析失败回调
}

// 时间戳格式化
function now() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false })
}

/** 日志级别颜色 */
const levelColors: Record<string, string> = {
  info: "text-blue-600",
  ok: "text-green-600",
  warn: "text-amber-600",
  err: "text-red-600",
}

/** SSE 悬浮日志面板 */
export default function SSELogPanel({ paperId, onClose, onComplete, onError }: SSELogPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "done" | "failed">("idle")
  const [minimized, setMinimized] = useState(false)
  const logBodyRef = useRef<HTMLDivElement>(null)
  const sseRef = useRef<EventSource | null>(null)
  const prevPaperIdRef = useRef<string | null>(null)

  /** 添加日志 */
  const addLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    setLogs(prev => [...prev, { time: now(), message, level }])
  }, [])

  /** 连接 SSE */
  useEffect(() => {
    // 如果 paperId 没变，不重连
    if (!paperId || paperId === prevPaperIdRef.current) return
    prevPaperIdRef.current = paperId

    // 清理旧连接
    if (sseRef.current) {
      sseRef.current.close()
    }

    // 重置状态
    setLogs([])
    setStatus("connecting")
    setMinimized(false)
    addLog(`连接 SSE: ${paperId}`, "info")

    const url = `/api/papers/${paperId}/sse`
    const source = new EventSource(url)
    sseRef.current = source

    source.onopen = () => {
      setStatus("connected")
      addLog("SSE 已连接", "ok")
    }

    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        const type = event.type
        const data = event.data || {}

        if (type === "progress") {
          const message = data.message || data.stage || ""
          if (message) {
            addLog(message, "info")
          }
        } else if (type === "done") {
          setStatus("done")
          addLog("解析完成！", "ok")
          source.close()
          onComplete?.(paperId)
        } else if (type === "error") {
          setStatus("failed")
          addLog(`错误: ${data.message || "未知错误"}`, "err")
          source.close()
          onError?.(paperId, data.message || "")
        }
      } catch {
        // keepalive 忽略
      }
    }

    source.onerror = () => {
      // EventSource 自动重连，但标记一下状态
      if (source.readyState === EventSource.CLOSED) {
        setStatus("failed")
        addLog("SSE 连接断开", "err")
      }
    }

    return () => {
      source.close()
      sseRef.current = null
    }
  }, [paperId, addLog, onComplete, onError])

  // 自动滚动到底部
  useEffect(() => {
    if (logBodyRef.current) {
      logBodyRef.current.scrollTop = logBodyRef.current.scrollHeight
    }
  }, [logs])

  // 如果没 paperId，不显示
  if (!paperId) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px] rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Radio
            size={12}
            className={
              status === "connected" ? "text-green-500 animate-pulse" :
              status === "connecting" ? "text-amber-500 animate-pulse" :
              status === "done" ? "text-green-500" :
              "text-slate-400"
            }
          />
          <span className="text-xs font-medium text-slate-700">
            {status === "idle" && "等待中"}
            {status === "connecting" && "连接中..."}
            {status === "connected" && "解析中"}
            {status === "done" && "解析完成"}
            {status === "failed" && "解析失败"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMinimized(!minimized)}
            className="p-0.5 rounded hover:bg-slate-200 text-slate-400"
          >
            {minimized ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {onClose && (
            <button onClick={onClose} className="p-0.5 rounded hover:bg-slate-200 text-slate-400">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 日志内容 */}
      {!minimized && (
        <div
          ref={logBodyRef}
          className="h-[180px] overflow-y-auto p-2 font-mono text-xs leading-5 bg-white"
        >
          {logs.length === 0 ? (
            <span className="text-slate-300">等待日志...</span>
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