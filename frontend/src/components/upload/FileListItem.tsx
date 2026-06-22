/**
 * FileListItem — 已上传文件列表项组件
 * 功能：显示单个文件信息，包含文件名、大小、状态指示和删除按钮
 * 输入：filename 文件名，size 文件大小(字节)，status 状态，onRemove 删除回调
 * 返回：文件列表项 JSX
 * 使用场景：PaperUploadPage 左侧已上传文件列表
 */
import { FileText, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/utils/cn"

/** 组件属性 */
interface FileListItemProps {
  filename: string          // 文件名
  size: number              // 文件大小（字节）
  status: 'uploading' | 'done' | 'error'  // 状态
  onRemove: () => void      // 删除回调
}

/** 格式化文件大小为可读字符串 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`              // 字节级
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB` // KB级
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`   // MB级
}

/** 状态图标映射 */
function StatusIcon({ status }: { status: FileListItemProps['status'] }) {
  switch (status) {
    case 'uploading':
      return <Loader2 size={14} className="text-blue-500 animate-spin" /> // 上传中旋转
    case 'done':
      return <CheckCircle2 size={14} className="text-green-500" />        // 完成绿色勾
    case 'error':
      return <AlertCircle size={14} className="text-red-500" />           // 错误红色叹号
  }
}

/** 状态文字映射 */
function statusText(status: FileListItemProps['status']): string {
  switch (status) {
    case 'uploading': return '上传中'  // 上传中
    case 'done': return '已完成'       // 已完成
    case 'error': return '上传失败'    // 上传失败
  }
}

/** 文件列表项 */
export default function FileListItem({
  filename,
  size,
  status,
  onRemove,
}: FileListItemProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2 rounded border text-sm transition-colors",
        status === 'error'
          ? "border-red-200 bg-red-50"       // 错误态红色背景
          : "border-slate-200 bg-white"       // 正常态白色背景
      )}
    >
      {/* 文件图标 */}
      <FileText size={14} className="text-slate-400 shrink-0" />

      {/* 文件名（超长截断） */}
      <span className="truncate text-slate-700 flex-1">
        {filename}
      </span>

      {/* 文件大小 */}
      <span className="text-xs text-slate-400 shrink-0">
        {formatFileSize(size)}
      </span>

      {/* 状态指示 */}
      <div className="flex items-center gap-1 shrink-0">
        <StatusIcon status={status} />
        <span className={cn(
          "text-xs",
          status === 'uploading' && "text-blue-500", // 上传中蓝色
          status === 'done' && "text-green-500",     // 完成绿色
          status === 'error' && "text-red-500"       // 错误红色
        )}>
          {statusText(status)}
        </span>
      </div>

      {/* 删除按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation() // 阻止冒泡
          onRemove()          // 触发删除回调
        }}
        className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-red-500 transition-colors shrink-0"
        title="移除文件"
      >
        <X size={14} />
      </button>
    </div>
  )
}
