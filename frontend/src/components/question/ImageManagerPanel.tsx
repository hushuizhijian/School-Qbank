/**
 * ImageManagerPanel — 题图管理面板
 *
 * 功能：校对工作台中栏的题图管理，支持拖拽上传、排版模式切换、预览和操作
 * 输入参数：
 *   questionId: string — 当前题目ID
 *   images: QuestionImage[] — 当前题目关联的图片列表
 *   onImagesChange: (images: QuestionImage[]) => void — 图片列表变更回调
 *   layoutMode?: 'auto' | 'single' | 'double' — 排版模式
 * 返回值：JSX 题图管理面板组件
 * 使用场景：校对工作台中栏的题图管理区域
 */
import { useState, useRef, useCallback } from "react"
import { ImageIcon, Upload, Trash2, RotateCw, X } from "lucide-react"
import { cn } from "@/utils/cn"
import client from "@/api/client"

/** 题图数据接口 */
export interface QuestionImage {
  /** 图片唯一标识 */
  id: string
  /** 图片URL地址 */
  url: string
  /** 图片名称（可选） */
  name?: string
  /** 排序序号（可选） */
  sort_order?: number
}

/** 组件属性接口 */
interface ImageManagerPanelProps {
  /** 当前题目ID */
  questionId: string
  /** 当前题目关联的图片列表 */
  images: QuestionImage[]
  /** 图片列表变更回调 */
  onImagesChange: (images: QuestionImage[]) => void
  /** 排版模式：自动/单列/双列 */
  layoutMode?: "auto" | "single" | "double"
}

/** 排版模式配置项 */
const LAYOUT_MODES = [
  { key: "auto" as const, label: "自动" },   // 自动排版
  { key: "single" as const, label: "单列" }, // 单列排版
  { key: "double" as const, label: "双列" }, // 双列排版
]

/** 支持的图片格式 */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"]

/** 单文件大小上限：5MB */
const MAX_FILE_SIZE = 5 * 1024 * 1024

/** 网格背景样式 — CSS grid pattern */
const GRID_BG_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #f1f5f9 1px, transparent 1px), linear-gradient(#f1f5f9 1px, transparent 1px)",
  backgroundSize: "20px 20px",
}

/**
 * 上传图片文件到后端
 * 功能：将 File 对象通过 FormData 上传，返回图片 URL
 * 输入参数：file — 待上传的图片文件
 * 返回值：图片在服务器上的 URL 字符串
 * 修复点：
 *   1. 原调用 /api/upload/image（后端未注册该子路径 → 404 Not Found）
 *      改为 /api/upload 并通过 category=image 分类存储
 *   2. 显式声明 Content-Type=multipart/form-data；否则 axios 默认
 *      Content-Type=application/json，FormData 会被序列化成 JSON 字符串，
 *      后端拿不到 file 字段 → body.file: Field required
 */
const uploadImage = async (file: File): Promise<string> => {
  const formData = new FormData() // 构建 FormData
  formData.append("file", file) // 添加文件字段
  formData.append("category", "image") // 图片分类
  const res = await client.post("/api/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" }, // 覆盖默认 JSON 头
  })
  return res.data.url // 返回图片地址
}

/**
 * 题目 images 字段 → QuestionImage[]
 * 功能：将 Question.images 转为本组件所需格式
 *       兼容两种后端格式：
 *       - string[]: 纯 URL 字符串数组
 *       - {path, type}[]: 对象格式（后端 _extract_question_images 产出）
 * 输入参数：images — 图片数据（字符串数组或对象数组）
 * 返回值：QuestionImage 数组
 */
export const toQuestionImages = (images: unknown[]): QuestionImage[] => {
  if (!images || !Array.isArray(images)) return [] // 空值/非数组兜底
  return images.reduce<QuestionImage[]>((acc, item, index) => {
    if (typeof item === "string") {
      acc.push({
        id: `img_${index}_${item.slice(-8)}`, // 末 8 位做稳定 id
        url: item, // URL 原样使用
        sort_order: index, // 排序号
      })
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown> // 对象格式
      const url = String(obj.path || obj.url || "") // 优先取 path，其次 url
      if (url) {
        acc.push({
          id: `img_${index}_${url.slice(-8)}`,
          url,
          sort_order: index,
        })
      }
    }
    return acc
  }, [])
}

/**
 * QuestionImage[] → string[]
 * 功能：将本组件输出转回 URL 字符串数组（与后端 images 字段一致）
 * 输入参数：questionImages — QuestionImage 数组
 * 返回值：URL 字符串数组
 */
export const toStringImages = (questionImages: QuestionImage[]): string[] => {
  return questionImages.map((img) => img.url) // 提取 URL
}

/**
 * 生成唯一ID
 * 功能：基于时间戳和随机数生成简单唯一标识
 * 返回值：唯一ID字符串
 */
const generateId = (): string => {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` // 时间戳+随机串
}

/**
 * 校验文件是否为支持的图片格式
 * 功能：检查文件 MIME 类型和大小
 * 输入参数：file — 待校验的文件
 * 返回值：校验结果和错误信息
 */
const validateFile = (file: File): { valid: boolean; error?: string } => {
  if (!ACCEPTED_TYPES.includes(file.type)) { // 格式校验
    return { valid: false, error: `不支持的格式: ${file.name}` }
  }
  if (file.size > MAX_FILE_SIZE) { // 大小校验
    return { valid: false, error: `文件超过5MB: ${file.name}` }
  }
  return { valid: true } // 校验通过
}

/** 题图管理面板组件 */
export default function ImageManagerPanel({
  questionId,
  images,
  onImagesChange,
  layoutMode = "auto",
}: ImageManagerPanelProps) {
  // 当前排版模式
  const [currentLayout, setCurrentLayout] = useState<"auto" | "single" | "double">(layoutMode)
  // 拖拽悬停状态
  const [dragOver, setDragOver] = useState(false)
  // 上传进度百分比（0~100）
  const [uploadProgress, setUploadProgress] = useState(0)
  // 上传中状态标记
  const [uploading, setUploading] = useState(false)
  // 错误提示信息
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // 当前选中的图片ID（用于操作按钮）
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  // 每张图片的旋转角度记录
  const [rotations, setRotations] = useState<Record<string, number>>({})
  // 隐藏的文件输入框引用
  const fileInputRef = useRef<HTMLInputElement>(null)

  /**
   * 处理文件上传
   * 功能：校验文件 → 上传 → 将新图片添加到列表
   * 输入参数：files — 用户选择的文件列表
   */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files) // 转为数组
    const validFiles: File[] = [] // 有效文件列表
    const errors: string[] = [] // 错误信息列表

    // 逐个校验文件
    for (const file of fileArray) {
      const result = validateFile(file) // 校验单个文件
      if (result.valid) {
        validFiles.push(file) // 加入有效列表
      } else if (result.error) {
        errors.push(result.error) // 收集错误
      }
    }

    // 显示校验错误
    if (errors.length > 0) {
      setErrorMsg(errors.join("; ")) // 合并错误信息
      setTimeout(() => setErrorMsg(null), 3000) // 3秒后自动清除
    }

    if (validFiles.length === 0) return // 没有有效文件则跳过

    setUploading(true) // 标记上传中
    setUploadProgress(0) // 重置进度

    try {
      const newImages: QuestionImage[] = [] // 新上传的图片列表
      const total = validFiles.length // 总文件数

      // 逐个上传，更新进度
      for (let i = 0; i < total; i++) {
        const url = await uploadImage(validFiles[i]) // 上传单个文件
        newImages.push({
          id: generateId(), // 生成唯一ID
          url, // 图片URL
          name: validFiles[i].name, // 文件名
          sort_order: images.length + i, // 排序序号
        })
        setUploadProgress(Math.round(((i + 1) / total) * 100)) // 更新进度
      }

      // 合并到现有图片列表
      onImagesChange([...images, ...newImages]) // 触发变更回调
    } catch (error) {
      console.error("图片上传失败:", error) // 上传失败日志
      setErrorMsg("图片上传失败，请重试") // 提示用户
      setTimeout(() => setErrorMsg(null), 3000) // 3秒后自动清除
    } finally {
      setUploading(false) // 取消上传中状态
      setUploadProgress(0) // 重置进度
    }
  }, [images, onImagesChange])

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
   * 点击上传区域
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
    e.target.value = "" // 重置input，允许重复选择同一文件
  }

  /**
   * 删除选中图片
   * 功能：从列表中移除当前选中的图片
   */
  const handleDelete = () => {
    if (!selectedImageId) return // 未选中则跳过
    const newImages = images.filter((img) => img.id !== selectedImageId) // 过滤掉目标图片
    onImagesChange(newImages) // 触发变更回调
    // 清理旋转记录
    const newRotations = { ...rotations }
    delete newRotations[selectedImageId] // 移除旋转记录
    setRotations(newRotations)
    setSelectedImageId(null) // 清除选中状态
  }

  /**
   * 旋转选中图片
   * 功能：将选中图片顺时针旋转90°（视觉旋转，更新sort_order）
   */
  const handleRotate = () => {
    if (!selectedImageId) return // 未选中则跳过
    const currentRotation = rotations[selectedImageId] || 0 // 当前旋转角度
    const nextRotation = (currentRotation + 90) % 360 // 顺时针加90°
    setRotations({
      ...rotations,
      [selectedImageId]: nextRotation, // 更新旋转状态
    })
  }

  /**
   * 点击图片缩略图
   * 功能：选中/取消选中图片
   * 输入参数：imageId — 被点击的图片ID
   */
  const handleImageClick = (imageId: string) => {
    setSelectedImageId(selectedImageId === imageId ? null : imageId) // 切换选中状态
  }

  /**
   * 删除单张图片（缩略图上的删除按钮）
   * 功能：从列表中移除指定图片
   * 输入参数：imageId — 待删除图片的ID
   */
  const handleDeleteImage = (imageId: string) => {
    const newImages = images.filter((img) => img.id !== imageId) // 过滤掉目标图片
    onImagesChange(newImages) // 触发变更回调
    // 清理旋转记录
    const newRotations = { ...rotations }
    delete newRotations[imageId] // 移除旋转记录
    setRotations(newRotations)
    // 如果删除的是选中图片，清除选中状态
    if (selectedImageId === imageId) {
      setSelectedImageId(null)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col">

      {/* 标题栏 */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2 shrink-0">
        <ImageIcon size={14} className="text-slate-400" /> {/* 题图图标 */}
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">题图管理</span>
        {uploading && (
          <span className="text-xs text-blue-500 ml-auto">上传中 {uploadProgress}%</span> // 上传进度提示
        )}
      </div>

      {/* 拖拽上传区域 */}
      <div
        className={cn(
          "mx-3 mt-3 mb-2 border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
          dragOver
            ? "border-blue-400 bg-blue-50" // 拖拽悬停高亮
            : "border-slate-300 bg-slate-50/50 hover:border-slate-400" // 默认样式
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClickUpload}
      >
        <Upload size={20} className="mx-auto mb-1 text-slate-400" /> {/* 上传图标 */}
        <p className="text-xs text-slate-500">拖拽图片到此处</p>
        <p className="text-xs text-slate-400">或点击选择图片</p>
        <p className="text-xs text-slate-300 mt-1">支持 JPG/PNG/GIF/WebP，单文件≤5MB</p>

        {/* 隐藏的文件输入框 */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="mx-3 mb-2 px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-600">
          {errorMsg}
        </div>
      )}

      {/* 排版模式切换 */}
      <div className="mx-3 mb-2 flex items-center gap-2">
        <span className="text-xs text-slate-500 shrink-0">排版模式:</span>
        <div className="flex gap-1">
          {LAYOUT_MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setCurrentLayout(mode.key)} // 切换排版模式
              className={cn(
                "px-2 py-1 text-xs rounded transition-colors", // 基础样式
                currentLayout === mode.key
                  ? "bg-blue-500 text-white" // 激活状态
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200" // 非激活状态
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* 分隔线 */}
      <div className="mx-3 border-t border-slate-100" />

      {/* 预览区域 — 网格背景 */}
      <div
        className="mx-3 my-2 rounded-lg border border-slate-200 min-h-[120px] p-2 overflow-y-auto"
        style={GRID_BG_STYLE} // 网格背景样式
      >
        {images.length === 0 ? (
          /* 无图片时的占位提示 */
          <div className="flex flex-col items-center justify-center h-[100px] text-slate-300">
            <ImageIcon size={28} /> {/* 占位图标 */}
            <span className="text-xs mt-1">暂无题图</span>
          </div>
        ) : (
          /* 图片缩略图列表 */
          <div className={cn(
            "grid gap-2",
            currentLayout === "single" ? "grid-cols-1" : // 单列
            currentLayout === "double" ? "grid-cols-2" : // 双列
            "grid-cols-2" // 自动模式默认双列
          )}>
            {images.map((img) => {
              const rotation = rotations[img.id] || 0 // 获取旋转角度
              const isSelected = selectedImageId === img.id // 是否选中

              return (
                <div
                  key={img.id}
                  className={cn(
                    "relative group rounded border overflow-hidden bg-white cursor-pointer transition-all",
                    isSelected
                      ? "ring-2 ring-blue-500 border-blue-500" // 选中状态
                      : "border-slate-200 hover:border-slate-300" // 默认状态
                  )}
                  onClick={() => handleImageClick(img.id)} // 点击选中
                >
                  {/* 图片缩略图 */}
                  <img
                    src={img.url}
                    alt={img.name || "题图"}
                    className="w-full h-20 object-cover"
                    style={{ transform: `rotate(${rotation}deg)` }} // 应用旋转
                  />

                  {/* 悬停删除按钮 */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id) }} // 阻止冒泡，删除图片
                    className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                    title="删除图片"
                  >
                    <X size={10} />
                  </button>

                  {/* 图片名称（截断显示） */}
                  {img.name && (
                    <div className="px-1 py-0.5 text-xs text-slate-400 truncate bg-white/80">
                      {img.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 图片操作按钮（仅在有图片时显示） */}
      {images.length > 0 && (
        <div className="mx-3 mb-3 flex gap-2">
          {/* 删除按钮 */}
          <button
            type="button"
            onClick={handleDelete}
            disabled={!selectedImageId} // 未选中时禁用
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
              selectedImageId
                ? "bg-red-50 text-red-600 hover:bg-red-100" // 可用状态
                : "bg-slate-50 text-slate-300 cursor-not-allowed" // 禁用状态
            )}
            title="删除选中图片"
          >
            <Trash2 size={12} /> {/* 删除图标 */}
            删除
          </button>

          {/* 旋转按钮 */}
          <button
            type="button"
            onClick={handleRotate}
            disabled={!selectedImageId} // 未选中时禁用
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
              selectedImageId
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100" // 可用状态
                : "bg-slate-50 text-slate-300 cursor-not-allowed" // 禁用状态
            )}
            title="旋转90°"
          >
            <RotateCw size={12} /> {/* 旋转图标 */}
            旋转
          </button>
        </div>
      )}
    </div>
  )
}
