/**
 * StemEditor — 题干编辑区
 *
 * 功能：题干内容的编辑 + 实时预览，水平分割布局
 * 输入参数：
 *   value: string — 题干文本
 *   onChange: (value: string) => void — 变更回调
 *   onInsertFormula?: (latex: string) => void — 公式插入回调
 * 返回值：JSX 编辑区组件
 * 使用场景：校对工作台右栏的题干编辑 Tab
 */
import { useState, useRef, useEffect } from "react"
import { useDebounce } from "@/hooks/useDebounce"
import PreviewRenderer from "./PreviewRenderer"
import { Maximize2, Minimize2 } from "lucide-react"
import { cn } from "@/utils/cn"

interface StemEditorProps {
  /** 题干文本 */
  value: string
  /** 变更回调 */
  onChange: (value: string) => void
  /** 公式插入回调 */
  onInsertFormula?: (latex: string) => void
}

/** 题干编辑区组件 */
export default function StemEditor({ value, onChange, onInsertFormula: _onInsertFormula }: StemEditorProps) {
  // 防抖后的内容，用于预览渲染
  const debouncedValue = useDebounce(value, 500)
  // 全屏状态
  const [isFullscreen, setIsFullscreen] = useState(false)
  // textarea 引用
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 暴露插入公式方法给外部（通过 ref 或回调）
  useEffect(() => {
    // 监听粘贴事件，提示图片粘贴功能
    const textarea = textareaRef.current
    if (!textarea) return

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      // 检查是否有图片类型
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          // 图片粘贴功能暂未实现
          // TODO: 实现图片粘贴上传
        }
      }
    }

    textarea.addEventListener("paste", handlePaste)
    return () => textarea.removeEventListener("paste", handlePaste)
  }, [])

  // 全屏切换
  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)

  return (
    <div className={cn(
      "bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col",
      isFullscreen && "fixed inset-0 z-50 rounded-none"
    )}>
      {/* 标题栏 */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">题干</span>
        <button
          onClick={toggleFullscreen}
          className="p-1 rounded hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600"
          title={isFullscreen ? "退出全屏" : "全屏编辑"}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* 编辑区 + 预览区 水平分割 */}
      <div className="flex flex-1 overflow-hidden min-h-[120px]">
        {/* 左侧：编辑区 */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-4 py-3 text-sm resize-none focus:outline-none min-w-0 border-r border-slate-100"
          placeholder="输入题干内容（支持 LaTeX 公式：$...$ 行内，$$...$$ 块级）"
        />

        {/* 右侧：预览区 */}
        <div className="flex-1 px-4 py-3 overflow-y-auto min-w-0 bg-slate-50/50">
          <PreviewRenderer content={debouncedValue} />
        </div>
      </div>
    </div>
  )
}
