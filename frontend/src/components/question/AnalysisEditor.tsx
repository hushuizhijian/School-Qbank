/**
 * AnalysisEditor — 详细解析编辑区
 *
 * 功能：详细解析的编辑 + 实时预览
 * 输入参数：
 *   value: string — 解析文本
 *   onChange: (value: string) => void — 变更回调
 * 返回值：JSX 编辑区组件
 * 使用场景：校对工作台右栏的详细解析编辑 Tab
 */
import { useDebounce } from "@/hooks/useDebounce"
import PreviewRenderer from "./PreviewRenderer"

interface AnalysisEditorProps {
  /** 解析文本 */
  value: string
  /** 变更回调 */
  onChange: (value: string) => void
}

/** 详细解析编辑区组件 */
export default function AnalysisEditor({ value, onChange }: AnalysisEditorProps) {
  // 防抖后的内容，用于预览渲染
  const debouncedValue = useDebounce(value, 500)

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">
      {/* 标题栏 */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">详细解析</span>
      </div>

      {/* 编辑区 + 预览区 水平分割 */}
      <div className="flex flex-1 overflow-hidden min-h-[100px]">
        {/* 左侧：编辑区 */}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-4 py-3 text-sm resize-none focus:outline-none min-w-0 border-r border-slate-100"
          placeholder="输入详细解析（支持分步：步骤1: / 步骤2: / ...，支持 LaTeX: $...$）"
        />

        {/* 右侧：预览区 */}
        <div className="flex-1 px-4 py-3 overflow-y-auto min-w-0 bg-slate-50/50">
          <PreviewRenderer content={debouncedValue} />
        </div>
      </div>
    </div>
  )
}
