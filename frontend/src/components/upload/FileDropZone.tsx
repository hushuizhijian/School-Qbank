/**
 * FileDropZone — 拖拽上传区域组件
 * 功能：支持拖拽和点击选择文件，拖拽时高亮显示
 * 输入：onFilesSelected 文件选择回调，accept 接受类型，multiple 多文件开关
 * 返回：拖拽上传区域 JSX
 * 使用场景：PaperUploadPage 左侧配置区文件上传
 */
import { useState, useRef, useCallback } from "react"
import { Upload } from "lucide-react"
import { cn } from "@/utils/cn"

/** 组件属性 */
interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void  // 文件选择回调
  accept?: string                            // 接受的文件类型，默认 .pdf
  multiple?: boolean                         // 是否支持多文件
}

/** 拖拽上传区域 */
export default function FileDropZone({
  onFilesSelected,
  accept = ".pdf",
  multiple = false,
}: FileDropZoneProps) {
  // 拖拽悬停状态
  const [isDragging, setIsDragging] = useState(false)
  // 隐藏的 file input 引用
  const inputRef = useRef<HTMLInputElement>(null)

  /** 处理拖拽进入 */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()  // 阻止默认行为
    e.stopPropagation() // 阻止冒泡
    setIsDragging(true) // 标记拖拽中
  }, [])

  /** 处理拖拽悬停 */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()  // 阻止默认行为
    e.stopPropagation() // 阻止冒泡
  }, [])

  /** 处理拖拽离开 */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()  // 阻止默认行为
    e.stopPropagation() // 阻止冒泡
    setIsDragging(false) // 取消拖拽标记
  }, [])

  /** 处理文件放下 */
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()  // 阻止默认行为
      e.stopPropagation() // 阻止冒泡
      setIsDragging(false) // 取消拖拽标记
      const files = Array.from(e.dataTransfer.files) // 转为数组
      if (files.length > 0) {
        onFilesSelected(files) // 回调通知父组件
      }
    },
    [onFilesSelected]
  )

  /** 处理点击选择文件 */
  const handleClick = useCallback(() => {
    inputRef.current?.click() // 触发隐藏 input
  }, [])

  /** 处理 input change 事件 */
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []) // 转为数组
      if (files.length > 0) {
        onFilesSelected(files) // 回调通知父组件
      }
      // 重置 input 值，允许重复选择同一文件
      e.target.value = ""
    },
    [onFilesSelected]
  )

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={cn(
        "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
        isDragging
          ? "border-blue-500 bg-blue-50"   // 拖拽中高亮
          : "border-slate-300 hover:border-blue-400" // 默认态
      )}
    >
      {/* 隐藏的文件选择 input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        className="hidden"
      />

      {/* 上传图标 */}
      <Upload
        size={32}
        className={cn(
          "mx-auto mb-2 transition-colors",
          isDragging ? "text-blue-500" : "text-slate-400" // 拖拽中变色
        )}
      />

      {/* 提示文字 */}
      <p className="text-sm text-slate-500">
        拖拽文件到此处，或
        <span className="text-blue-600 underline ml-1">点击选择</span>
      </p>

      {/* 支持格式提示 */}
      <p className="text-xs text-slate-400 mt-1">
        支持 PDF 格式
      </p>
    </div>
  )
}
