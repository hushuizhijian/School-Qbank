/**
 * FigureUploader — 图表上传区
 *
 * 功能：题目的图片管理，支持粘贴/拖拽/点击三种上传方式，以及删除、旋转、预览
 * 输入参数：
 *   images: string[] — 当前题目关联的图片URL列表
 *   onChange: (images: string[]) => void — 图片列表变更回调
 *   readOnly?: boolean — 是否只读模式
 * 返回值：JSX 图表上传组件
 * 使用场景：校对工作台右栏的图表编辑区域
 */
import { useState, useRef, useCallback } from "react"
import { Camera, Upload, Clipboard, RotateCw, X, ZoomIn } from "lucide-react"
import { cn } from "@/utils/cn"
import client from "@/api/client"

/** 组件属性接口 */
interface FigureUploaderProps {
  /** 当前题目关联的图片URL列表 */
  images: string[]
  /** 图片列表变更回调 */
  onChange: (images: string[]) => void
  /** 是否只读模式 */
  readOnly?: boolean
}

/** 单张图片的旋转状态记录 */
interface ImageState {
  /** 旋转角度，0/90/180/270 */
  rotation: number
}

/**
 * 上传图片文件到后端
 * 功能：将 File 对象通过 FormData 上传，返回图片 URL
 * 输入参数：file — 待上传的图片文件
 * 返回值：图片在服务器上的 URL 字符串
 */
const uploadImage = async (file: File): Promise<string> => {
  const formData = new FormData() // 构建 FormData
  formData.append("file", file) // 添加文件字段
  const res = await client.post("/api/upload/image", formData) // 发送上传请求
  return res.data.url // 返回图片地址
}

/**
 * 判断文件是否为图片类型
 * 功能：检查文件的 MIME 类型是否以 image/ 开头
 * 输入参数：file — 待检查的文件
 * 返回值：是否为图片
 */
const isImageFile = (file: File): boolean => {
  return file.type.startsWith("image/") // 判断 MIME 前缀
}

/** 图表上传区组件 */
export default function FigureUploader({ images, onChange, readOnly = false }: FigureUploaderProps) {
  // 每张图片的旋转状态，key 为图片 URL
  const [imageStates, setImageStates] = useState<Record<string, ImageState>>({})
  // 上传中的状态标记
  const [uploading, setUploading] = useState(false)
  // 拖拽悬停状态
  const [dragOver, setDragOver] = useState(false)
  // 预览图片 URL（null 表示关闭预览）
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  // 隐藏的文件输入框引用
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 容器 div 引用，用于监听粘贴事件
  const containerRef = useRef<HTMLDivElement>(null)

  /**
   * 处理文件上传
   * 功能：校验文件类型 → 上传 → 将 URL 添加到图片列表
   * 输入参数：files — 用户选择的文件列表
   */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (readOnly) return // 只读模式禁止上传

    const imageFiles = Array.from(files).filter(isImageFile) // 过滤出图片文件
    if (imageFiles.length === 0) return // 没有图片则跳过

    setUploading(true) // 标记上传中
    try {
      // 逐个上传图片
      const urls = await Promise.all(imageFiles.map(uploadImage))
      // 合并到现有图片列表
      const newImages = [...images, ...urls]
      onChange(newImages) // 触发变更回调
    } catch (error) {
      console.error("图片上传失败:", error) // 上传失败日志
      alert("图片上传失败，请重试") // 提示用户
    } finally {
      setUploading(false) // 取消上传中状态
    }
  }, [images, onChange, readOnly])

  /**
   * 粘贴事件处理
   * 功能：从剪贴板提取图片文件并上传
   * 输入参数：e — 剪贴板事件
   */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault() // 阻止默认粘贴行为
    const files = e.clipboardData.files // 获取剪贴板文件
    if (files.length > 0) {
      handleFiles(files) // 处理上传
    }
  }, [handleFiles])

  /**
   * 拖拽进入事件
   * 功能：标记拖拽悬停状态
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault() // 阻止默认行为以允许放置
    setDragOver(true) // 标记悬停
  }, [])

  /**
   * 拖拽离开事件
   * 功能：取消拖拽悬停状态
   */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault() // 阻止默认行为
    setDragOver(false) // 取消悬停
  }, [])

  /**
   * 拖拽放置事件
   * 功能：获取拖拽文件并上传
   */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault() // 阻止默认行为
    setDragOver(false) // 取消悬停
    const files = e.dataTransfer.files // 获取拖拽文件
    if (files.length > 0) {
      handleFiles(files) // 处理上传
    }
  }, [handleFiles])

  /**
   * 点击上传按钮
   * 功能：触发隐藏的文件输入框
   */
  const handleClickUpload = () => {
    fileInputRef.current?.click() // 触发文件选择
  }

  /**
   * 文件选择变更
   * 功能：处理用户通过文件选择器选中的文件
   */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files // 获取选中文件
    if (files && files.length > 0) {
      handleFiles(files) // 处理上传
    }
    // 重置 input 值，允许重复选择同一文件
    e.target.value = ""
  }

  /**
   * 删除图片
   * 功能：从列表中移除指定索引的图片
   * 输入参数：index — 待删除图片的索引
   */
  const handleDelete = (index: number) => {
    const url = images[index] // 获取待删除图片 URL
    const newImages = images.filter((_, i) => i !== index) // 过滤掉目标图片
    onChange(newImages) // 触发变更回调
    // 清理旋转状态
    if (url && imageStates[url]) {
      const newStates = { ...imageStates }
      delete newStates[url] // 移除旋转记录
      setImageStates(newStates)
    }
  }

  /**
   * 旋转图片
   * 功能：将指定图片顺时针旋转 90°
   * 输入参数：url — 图片 URL
   */
  const handleRotate = (url: string) => {
    const currentRotation = imageStates[url]?.rotation || 0 // 当前旋转角度
    const nextRotation = (currentRotation + 90) % 360 // 顺时针加 90°
    setImageStates({
      ...imageStates,
      [url]: { rotation: nextRotation }, // 更新旋转状态
    })
  }

  /**
   * 打开预览
   * 功能：点击图片放大查看
   */
  const handlePreview = (url: string) => {
    setPreviewUrl(url) // 设置预览图片
  }

  /**
   * 关闭预览
   * 功能：关闭图片预览弹窗
   */
  const handleClosePreview = () => {
    setPreviewUrl(null) // 清除预览
  }

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col"
      onPaste={handlePaste}
    >
      {/* 标题栏 */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
        <Camera size={14} className="text-slate-400" /> {/* 图表图标 */}
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">图表区</span>
        {uploading && (
          <span className="text-xs text-blue-500 ml-auto">上传中...</span> // 上传状态提示
        )}
      </div>

      {/* 上传区域（仅编辑模式显示） */}
      {!readOnly && (
        <div
          className={cn(
            "mx-3 mt-3 mb-2 border-2 border-dashed rounded-lg p-6 text-center transition-colors",
            dragOver
              ? "border-blue-400 bg-blue-50" // 拖拽悬停高亮
              : "border-slate-300 bg-slate-50/50 hover:border-slate-400" // 默认样式
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <p className="text-sm text-slate-500 mb-3">
            拖拽图片到此处
          </p>

          {/* 操作按钮组 */}
          <div className="flex items-center justify-center gap-2">
            {/* 点击上传按钮 */}
            <button
              type="button"
              onClick={handleClickUpload}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              disabled={uploading}
            >
              <Upload size={12} /> {/* 上传图标 */}
              点击上传
            </button>

            {/* 粘贴提示按钮（仅展示提示，实际通过 paste 事件触发） */}
            <button
              type="button"
              onClick={() => containerRef.current?.focus()}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors"
              title="在页面任意位置 Ctrl+V 粘贴图片"
            >
              <Clipboard size={12} /> {/* 粘贴图标 */}
              粘贴图片
            </button>
          </div>

          {/* 隐藏的文件输入框 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {/* 图片列表 */}
      {images.length > 0 && (
        <div className="px-3 pb-3 flex flex-wrap gap-3">
          {images.map((url, index) => {
            const rotation = imageStates[url]?.rotation || 0 // 获取旋转角度
            return (
              <div
                key={`${url}-${index}`}
                className="relative group rounded-lg border border-slate-200 overflow-hidden bg-slate-50"
                style={{ width: 120, height: 120 }} // 固定缩略图尺寸
              >
                {/* 图片缩略图 */}
                <img
                  src={url}
                  alt={`图表 ${index + 1}`}
                  className="w-full h-full object-cover cursor-pointer transition-transform"
                  style={{ transform: `rotate(${rotation}deg)` }} // 应用旋转
                  onClick={() => handlePreview(url)} // 点击预览
                />

                {/* 悬停操作按钮（仅编辑模式） */}
                {!readOnly && (
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* 旋转按钮 */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRotate(url) }}
                      className="p-1 rounded bg-white/90 shadow-sm hover:bg-white text-slate-500 hover:text-slate-700 transition-colors"
                      title="旋转 90°"
                    >
                      <RotateCw size={12} />
                    </button>

                    {/* 删除按钮 */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDelete(index) }}
                      className="p-1 rounded bg-white/90 shadow-sm hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                      title="删除图片"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {/* 只读模式下的预览按钮 */}
                {readOnly && (
                  <button
                    type="button"
                    onClick={() => handlePreview(url)}
                    className="absolute bottom-1 right-1 p-1 rounded bg-white/90 shadow-sm text-slate-400 hover:text-slate-600 transition-colors"
                    title="预览图片"
                  >
                    <ZoomIn size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 无图片时的空状态（编辑模式） */}
      {readOnly && images.length === 0 && (
        <div className="px-4 py-6 text-center text-sm text-slate-400">
          暂无图表
        </div>
      )}

      {/* 图片预览弹窗 */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8"
          onClick={handleClosePreview} // 点击遮罩关闭
        >
          <div className="relative max-w-[90vw] max-h-[90vh]">
            {/* 预览图片 */}
            <img
              src={previewUrl}
              alt="预览"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              style={{
                transform: `rotate(${imageStates[previewUrl]?.rotation || 0}deg)` // 保持旋转
              }}
              onClick={(e) => e.stopPropagation()} // 阻止点击图片关闭
            />

            {/* 关闭按钮 */}
            <button
              type="button"
              onClick={handleClosePreview}
              className="absolute -top-3 -right-3 p-2 rounded-full bg-white shadow-lg text-slate-600 hover:text-red-600 transition-colors"
              title="关闭预览"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
