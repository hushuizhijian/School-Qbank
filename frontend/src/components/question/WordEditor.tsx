/**
 * WordEditor — A4 富文本编辑器浮窗
 *
 * 功能：弹出 A4 大小（794×1123px）富文本编辑面板
 *       - 正文部分：contenteditable，支持文本输入
 *       - 图片部分：绝对定位浮层（z-index 高于文字）
 *         支持：拖拽移动 / 8 方向缩放 / 裁剪 / 上层叠加
 *       - 保存：把 { html, images } 写回题目 word_content 字段
 * 输入参数：见 WordEditorProps
 * 返回值：浮窗 React 节点
 * 使用场景：校对工作台"题目内容"组件右上角 word编辑 按钮触发
 *
 * 数据模型 word_content:
 *   {
 *     html: string,                              // 文本 HTML（不包含图片）
 *     images: Array<{
 *       id: string,                              // 图片唯一 id
 *       url: string,                             // 图片地址
 *       x: number, y: number,                    // 浮层定位（A4 内 px）
 *       w: number, h: number,                    // 显示宽高
 *       srcW: number, srcH: number,              // 原图宽高
 *       crop: { x: number, y: number, w: number, h: number }  // 裁剪框（原图坐标系）
 *     }>
 *   }
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { X, Image as ImageIcon, Save, Crop, Trash2, Upload, FileText, ChevronUp, ChevronDown } from "lucide-react"
import { toast } from "sonner"
import client from "@/api/client"

/* ========== 类型定义 ========== */

/** word_content JSON 结构 */
export interface WordContent {
  html: string
  images: WordImage[]
}

/** word_content 中的图片 */
export interface WordImage {
  id: string
  url: string
  x: number
  y: number
  w: number
  h: number
  srcW: number
  srcH: number
  crop: { x: number; y: number; w: number; h: number }
}

/** WordEditor Props */
interface WordEditorProps {
  /** 弹窗开关 */
  open: boolean
  /** 关闭弹窗（保存/取消都触发，区别在内部完成） */
  onClose: () => void
  /** 现有 word_content（首次打开时回填） */
  initialContent: WordContent | null
  /** 现有题目图片 URL 列表（首次打开且无 word_content 时作为初始图片源） */
  fallbackImageUrls: string[]
  /** 保存回调：把新内容写回题目 */
  onSave: (content: WordContent) => Promise<void> | void
  /** A4 像素尺寸（默认 794×1123 ≈ 210×297mm@96dpi） */
  pageWidth?: number
  pageHeight?: number
}

/* ========== 常量 ========== */

/** 默认 A4 像素尺寸 */
const DEFAULT_PAGE_WIDTH = 794
const DEFAULT_PAGE_HEIGHT = 1123

/** 图片最小尺寸 */
const MIN_IMAGE_SIZE = 40

/** 缩放控点：8 个方向 */
const HANDLE_POSITIONS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const
type HandlePos = (typeof HANDLE_POSITIONS)[number]

/* ========== 工具：稳定 id ========== */

/** 生成图片 id：用 crypto.randomUUID 退化到时间戳+随机数 */
function genImageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return "img_" + crypto.randomUUID()
  }
  return "img_" + Date.now() + "_" + Math.floor(Math.random() * 10000)
}

/* ========== 工具：上传图片 ========== */

/**
 * 上传图片到后端
 * 功能：复用项目已有的 /api/upload 接口（与 ImageManagerPanel 保持一致）
 * 输入参数：file — 待上传的 File 对象
 * 返回值：图片在服务器上的 URL
 */
async function uploadImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("category", "image")
  const res = await client.post("/api/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return res.data.url as string
}

/* ========== 工具：读取图片原始尺寸 ========== */

/**
 * 加载图片并返回原始尺寸
 * 功能：通过 Image 对象读取 URL 对应的真实宽高
 * 输入参数：url — 图片 URL
 * 返回值：Promise<{ w: number; h: number }> 原图宽高
 */
function loadImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => reject(new Error("图片加载失败"))
    img.src = url
  })
}

/* ========== 主组件 ========== */

/**
 * WordEditor A4 编辑浮窗
 *
 * 实现要点：
 *   - 用 useRef 记录编辑器 DOM 节点，回填初始内容时只回填一次
 *   - 图片用独立 state 数组管理，渲染在 text-layer 之上的 image-layer
 *   - 单图片交互：mousedown 选中 → 拖动 / 8 方向缩放 / 裁剪
 *   - 保存时把 innerHTML 当作 html 字段，图片数组原样保留
 */
export default function WordEditor({
  open,
  onClose,
  initialContent,
  fallbackImageUrls,
  onSave,
  pageWidth = DEFAULT_PAGE_WIDTH,
  pageHeight = DEFAULT_PAGE_HEIGHT,
}: WordEditorProps) {
  // 文本内容：受控但兼容 contenteditable（onInput 同步）
  const [html, setHtml] = useState<string>("")
  // 图片列表
  const [images, setImages] = useState<WordImage[]>([])
  // 当前选中的图片 id
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 裁剪弹窗的目标图片 id
  const [croppingId, setCroppingId] = useState<string | null>(null)
  // 保存中
  const [saving, setSaving] = useState(false)
  // 标记是否已用初始内容回填（避免来回切换时重复覆盖）
  const initializedKey = useRef<string | null>(null)
  // 文本编辑器 DOM
  const editorRef = useRef<HTMLDivElement | null>(null)
  // 文件上传 input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  /* ========== 初始内容回填（每次打开/切换题目时执行一次） ========== */

  useEffect(() => {
    if (!open) return                                          // 关闭时跳过
    // 用 initialContent 的引用 + open 一起作为 key，确保每次开窗或换题只回填一次
    const key = (initialContent ? "init" : "empty") + "_" + String(open)
    if (initializedKey.current === key) return
    initializedKey.current = key
    // 写文本
    const initHtml = initialContent?.html || ""
    setHtml(initHtml)
    // 写图片：有 word_content 用 word_content；否则尝试用题目 images 兜底
    if (initialContent?.images && initialContent.images.length > 0) {
      setImages(initialContent.images)
    } else if (fallbackImageUrls.length > 0) {
      // 兜底：异步加载原始尺寸后生成图片项
      void (async () => {
        const items: WordImage[] = []
        for (const url of fallbackImageUrls) {
          try {
            const { w: srcW, h: srcH } = await loadImageSize(url)
            const displayW = Math.min(240, srcW)
            const displayH = (displayW / srcW) * srcH
            items.push({
              id: genImageId(),
              url,
              x: 24,
              y: 24 + items.length * (displayH + 12),
              w: displayW,
              h: displayH,
              srcW,
              srcH,
              crop: { x: 0, y: 0, w: srcW, h: srcH },
            })
          } catch {
            // 单张图加载失败不影响其他
          }
        }
        setImages(items)
      })()
    } else {
      setImages([])
    }
    setSelectedId(null)
  }, [open, initialContent, fallbackImageUrls])

  /* ========== 编辑器 DOM 同步 ========== */

  // 当 html 变化时，如果编辑器 DOM 与之不一致，强制同步（仅在初始化后不再覆盖）
  useEffect(() => {
    if (!open) return
    if (!editorRef.current) return
    if (editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html
    }
  }, [html, open])

  /* ========== 文本输入回调 ========== */

  /**
   * 处理文本编辑器输入
   * 功能：把当前 innerHTML 同步到 state
   */
  const handleEditorInput = useCallback(() => {
    if (!editorRef.current) return
    setHtml(editorRef.current.innerHTML)
  }, [])

  /* ========== 选中图片 ========== */

  /**
   * 选中指定图片
   * 功能：点击图片时选中
   */
  const handleSelectImage = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()                                        // 阻止冒泡到空白处
    setSelectedId(id)
  }, [])

  /**
   * 点击空白处取消选中
   */
  const handlePageClick = useCallback(() => {
    setSelectedId(null)
  }, [])

  /* ========== 图片操作：插入 / 删除 / 上移 / 下移 ========== */

  /**
   * 触发文件选择对话框
   */
  const handlePickImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  /**
   * 处理文件选择完成
   * 功能：上传后插入到图片层
   */
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""                                        // 重置 input，允许重复上传同一文件
    if (!file) return
    try {
      const url = await uploadImage(file)
      const { w: srcW, h: srcH } = await loadImageSize(url)
      const displayW = Math.min(240, srcW)
      const displayH = (displayW / srcW) * srcH
      const newImg: WordImage = {
        id: genImageId(),
        url,
        x: 40,
        y: 40,
        w: displayW,
        h: displayH,
        srcW,
        srcH,
        crop: { x: 0, y: 0, w: srcW, h: srcH },
      }
      setImages((prev) => [...prev, newImg])
      setSelectedId(newImg.id)
    } catch (err) {
      console.error("上传图片失败", err)
      toast.error("图片上传失败")
    }
  }, [])

  /**
   * 删除选中的图片
   */
  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return
    setImages((prev) => prev.filter((im) => im.id !== selectedId))
    setSelectedId(null)
  }, [selectedId])

  /**
   * 把选中图片上移一层
   */
  const handleBringUp = useCallback(() => {
    if (!selectedId) return
    setImages((prev) => {
      const idx = prev.findIndex((im) => im.id === selectedId)
      if (idx < 0 || idx >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
      return next
    })
  }, [selectedId])

  /**
   * 把选中图片下移一层
   */
  const handleSendDown = useCallback(() => {
    if (!selectedId) return
    setImages((prev) => {
      const idx = prev.findIndex((im) => im.id === selectedId)
      if (idx <= 0) return prev
      const next = [...prev]
      ;[next[idx], next[idx - 1]] = [next[idx - 1], next[idx]]
      return next
    })
  }, [selectedId])

  /* ========== 图片拖拽 / 缩放 逻辑 ========== */

  /**
   * 处理图片鼠标按下事件
   * 功能：根据点击的"控点"还是"图片本体"决定进入拖动还是缩放模式
   * 输入参数：e — 鼠标事件；id — 图片 id；handle — 控点方向（可选）
   */
  const handleImageMouseDown = useCallback((
    e: React.MouseEvent,
    id: string,
    handle?: HandlePos,
  ) => {
    e.preventDefault()                                         // 防止默认文本选中
    e.stopPropagation()                                        // 阻止冒泡
    setSelectedId(id)

    const img = images.find((im) => im.id === id)
    if (!img) return

    const startX = e.clientX
    const startY = e.clientY
    const startImg = { x: img.x, y: img.y, w: img.w, h: img.h }

    /**
     * 鼠标移动：根据模式更新图片位置 / 大小
     * 功能：拖动 → 改 x/y；缩放 → 改 w/h
     */
    const onMove = (mv: MouseEvent) => {
      const dx = mv.clientX - startX
      const dy = mv.clientY - startY
      setImages((prev) =>
        prev.map((im) => {
          if (im.id !== id) return im
          if (!handle) {
            // 整体拖动
            return { ...im, x: startImg.x + dx, y: startImg.y + dy }
          }
          // 缩放：以图片中心为锚点，按控点方向调整
          const newBox = resizeBox(startImg, handle, dx, dy)
          return {
            ...im,
            x: newBox.x,
            y: newBox.y,
            w: Math.max(MIN_IMAGE_SIZE, newBox.w),
            h: Math.max(MIN_IMAGE_SIZE, newBox.h),
          }
        }),
      )
    }

    /**
     * 鼠标松开：结束拖拽/缩放
     */
    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }, [images])

  /* ========== 裁剪弹窗 ========== */

  /**
   * 打开裁剪弹窗
   */
  const handleOpenCrop = useCallback(() => {
    if (!selectedId) return
    setCroppingId(selectedId)
  }, [selectedId])

  /**
   * 应用裁剪结果
   * 功能：把裁剪框坐标写回图片的 crop 字段，并把显示尺寸按比例缩放
   * 输入参数：imgId — 目标图片；crop — 裁剪框（原图坐标系）
   */
  const handleApplyCrop = useCallback((imgId: string, crop: { x: number; y: number; w: number; h: number }) => {
    setImages((prev) =>
      prev.map((im) => {
        if (im.id !== imgId) return im
        // 显示尺寸按裁剪后比例重新计算（保持原视场宽高比）
        const scale = im.w / im.srcW
        const newDisplayW = crop.w * scale
        const newDisplayH = crop.h * scale
        return {
          ...im,
          crop,
          w: Math.max(MIN_IMAGE_SIZE, newDisplayW),
          h: Math.max(MIN_IMAGE_SIZE, newDisplayH),
        }
      }),
    )
    setCroppingId(null)
  }, [])

  /* ========== 保存 / 取消 ========== */

  /**
   * 保存并关闭
   * 功能：把 { html, images } 写回 word_content
   */
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const content: WordContent = {
        html: editorRef.current?.innerHTML ?? html,
        images,
      }
      await onSave(content)
      toast.success("已保存 Word 版式")
      onClose()
    } catch (err) {
      console.error("保存失败", err)
      toast.error("保存失败")
    } finally {
      setSaving(false)
    }
  }, [html, images, onSave, onClose])

  /**
   * 取消：直接关闭，不写回
   */
  const handleCancel = useCallback(() => {
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55"
      onClick={handleCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: pageWidth + 80, maxWidth: "96vw", maxHeight: "96vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部工具栏 */}
        <WordEditorToolbar
          saving={saving}
          hasSelection={!!selectedId}
          onPickImage={handlePickImage}
          onOpenCrop={handleOpenCrop}
          onDelete={handleDeleteSelected}
          onBringUp={handleBringUp}
          onSendDown={handleSendDown}
          onSave={handleSave}
          onCancel={handleCancel}
        />

        {/* 隐藏的文件上传 input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 主体：A4 纸张（可滚动） */}
        <div className="flex-1 overflow-auto bg-slate-200 p-6 flex justify-center">
          <A4Page
            pageWidth={pageWidth}
            pageHeight={pageHeight}
            editorRef={editorRef}
            html={html}
            onInput={handleEditorInput}
            onPageClick={handlePageClick}
            images={images}
            selectedId={selectedId}
            onSelectImage={handleSelectImage}
            onImageMouseDown={handleImageMouseDown}
          />
        </div>

        {/* 底部状态条 */}
        <div className="px-4 py-2 text-xs text-slate-500 border-t border-slate-200 flex items-center justify-between bg-slate-50">
          <span>图片始终浮于文字之上 · 拖动移动 · 拖角缩放 · 选中后可裁剪/调序/删除</span>
          <span>A4 · {pageWidth} × {pageHeight}px</span>
        </div>
      </div>

      {/* 裁剪弹窗 */}
      {croppingId && (
        <CropModal
          image={images.find((im) => im.id === croppingId)!}
          onApply={(crop) => handleApplyCrop(croppingId, crop)}
          onCancel={() => setCroppingId(null)}
        />
      )}
    </div>
  )
}

/* ========== 工具：根据控点计算新 box ========== */

/**
 * 根据控点方向计算新 box
 * 功能：8 方向缩放共用函数，左/上/右/下任意一边都支持
 * 输入参数：start — 起始 {x,y,w,h}；handle — 控点方向；dx/dy — 鼠标位移
 * 返回值：新 {x,y,w,h}
 */
function resizeBox(
  start: { x: number; y: number; w: number; h: number },
  handle: HandlePos,
  dx: number,
  dy: number,
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = start
  if (handle.includes("e")) w = start.w + dx                  // 右边
  if (handle.includes("s")) h = start.h + dy                  // 下边
  if (handle.includes("w")) {                                 // 左边：宽增加且 x 减小
    w = start.w - dx
    x = start.x + dx
  }
  if (handle.includes("n")) {                                 // 上边：高增加且 y 减小
    h = start.h - dy
    y = start.y + dy
  }
  return { x, y, w, h }
}

/* ========== 子组件：工具栏 ========== */

/** 工具栏 Props */
interface WordEditorToolbarProps {
  saving: boolean
  hasSelection: boolean
  onPickImage: () => void
  onOpenCrop: () => void
  onDelete: () => void
  onBringUp: () => void
  onSendDown: () => void
  onSave: () => void
  onCancel: () => void
}

/**
 * 顶部工具栏
 * 功能：插入图片 / 裁剪 / 调序 / 删除 / 保存 / 取消
 */
function WordEditorToolbar({
  saving,
  hasSelection,
  onPickImage,
  onOpenCrop,
  onDelete,
  onBringUp,
  onSendDown,
  onSave,
  onCancel,
}: WordEditorToolbarProps) {
  return (
    <div className="h-12 px-4 flex items-center gap-2 border-b border-slate-200 bg-white shrink-0">
      <div className="flex items-center gap-1.5 text-slate-700">
        <FileText size={16} className="text-blue-600" />
        <span className="text-sm font-semibold">Word 编辑</span>
      </div>
      <div className="w-px h-5 bg-slate-200 mx-1" />
      <button
        onClick={onPickImage}
        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50"
        title="插入图片"
      >
        <ImageIcon size={14} /> 插入图片
      </button>
      <button
        onClick={onPickImage}
        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50"
        title="上传图片"
      >
        <Upload size={14} /> 上传
      </button>
      <div className="w-px h-5 bg-slate-200 mx-1" />
      <button
        onClick={onOpenCrop}
        disabled={!hasSelection}
        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        title="裁剪选中图片"
      >
        <Crop size={14} /> 裁剪
      </button>
      <button
        onClick={onBringUp}
        disabled={!hasSelection}
        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        title="上移一层"
      >
        <ChevronUp size={14} /> 上移
      </button>
      <button
        onClick={onSendDown}
        disabled={!hasSelection}
        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        title="下移一层"
      >
        <ChevronDown size={14} /> 下移
      </button>
      <button
        onClick={onDelete}
        disabled={!hasSelection}
        className="flex items-center gap-1 px-2.5 py-1 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
        title="删除选中图片"
      >
        <Trash2 size={14} /> 删除
      </button>
      <div className="flex-1" />
      <button
        onClick={onCancel}
        className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50"
        title="取消编辑"
      >
        <X size={14} /> 取消
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        title="保存并关闭"
      >
        <Save size={14} /> {saving ? "保存中..." : "保存"}
      </button>
    </div>
  )
}

/* ========== 子组件：A4 纸张 ========== */

/** A4 纸张 Props */
interface A4PageProps {
  pageWidth: number
  pageHeight: number
  editorRef: React.RefObject<HTMLDivElement | null>
  html: string
  onInput: () => void
  onPageClick: () => void
  images: WordImage[]
  selectedId: string | null
  onSelectImage: (id: string, e: React.MouseEvent) => void
  onImageMouseDown: (
    e: React.MouseEvent,
    id: string,
    handle?: HandlePos,
  ) => void
}

/**
 * A4 纸张：底层是文字编辑器，上层是绝对定位图片
 * 功能：图片始终 z-index 高于文字
 */
function A4Page({
  pageWidth,
  pageHeight,
  editorRef,
  html,
  onInput,
  onPageClick,
  images,
  selectedId,
  onSelectImage,
  onImageMouseDown,
}: A4PageProps) {
  return (
    <div
      className="relative bg-white shadow-md"
      style={{ width: pageWidth, height: pageHeight, minWidth: pageWidth }}
      onClick={onPageClick}
    >
      {/* 文字层（z-index 0） */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        className="absolute inset-0 p-12 outline-none text-slate-800 leading-relaxed"
        style={{
          fontSize: 16,
          minHeight: pageHeight - 96,
          zIndex: 1,
        }}
        // 把初始内容直接渲染，副作用会在 effect 中维持同步
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {/* 图片层（z-index 10，始终在文字之上） */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
        {images.map((im) => (
          <ImageNode
            key={im.id}
            image={im}
            selected={im.id === selectedId}
            onMouseDown={(e, h) => onImageMouseDown(e, im.id, h)}
            onClick={(e) => onSelectImage(im.id, e)}
          />
        ))}
      </div>
    </div>
  )
}

/* ========== 子组件：图片节点（带 8 控点 + 裁剪显示） ========== */

/** 图片节点 Props */
interface ImageNodeProps {
  image: WordImage
  selected: boolean
  onMouseDown: (e: React.MouseEvent, handle?: HandlePos) => void
  onClick: (e: React.MouseEvent) => void
}

/**
 * 单张图片节点
 * 功能：绝对定位 + 显示裁剪后区域 + 8 控点缩放
 * 备注：通过 background-image + background-position + background-size
 *   实现"裁剪框"映射到显示区域（避免修改原图）
 */
function ImageNode({ image, selected, onMouseDown, onClick }: ImageNodeProps) {
  // 裁剪框 → 显示框的缩放比例
  const scale = image.srcW > 0 ? image.w / image.srcW : 1
  // background-size 用 srcW × scale = 显示总宽
  const bgW = image.srcW * scale
  const bgH = image.srcH * scale
  // background-position 把裁剪框对齐到 (0,0)
  const bgX = -image.crop.x * scale
  const bgY = -image.crop.y * scale

  return (
    <div
      className="absolute select-none"
      style={{
        left: image.x,
        top: image.y,
        width: image.w,
        height: image.h,
        pointerEvents: "auto",
        cursor: "move",
        outline: selected ? "2px solid #2563eb" : "1px solid transparent",
      }}
      onMouseDown={(e) => onMouseDown(e)}
      onClick={onClick}
    >
      {/* 真正的图片：用 div + background-image，避开<img>自然尺寸影响裁剪计算 */}
      <div
        className="w-full h-full"
        style={{
          backgroundImage: `url(${image.url})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${bgW}px ${bgH}px`,
          backgroundPosition: `${bgX}px ${bgY}px`,
        }}
      />

      {/* 选中时的 8 个控点 */}
      {selected && (
        <>
          {HANDLE_POSITIONS.map((pos) => {
            const style: React.CSSProperties = {
              position: "absolute",
              width: 10,
              height: 10,
              background: "#2563eb",
              border: "2px solid #fff",
              borderRadius: 2,
              cursor: cursorForHandle(pos),
            }
            // 控点位置：四角 + 四边中点
            if (pos.includes("n")) style.top = -5
            if (pos.includes("s")) style.bottom = -5
            if (pos.includes("w")) style.left = -5
            if (pos.includes("e")) style.right = -5
            if (pos === "n" || pos === "s") {
              style.left = "50%"
              style.transform = "translateX(-50%)"
            }
            if (pos === "e" || pos === "w") {
              style.top = "50%"
              style.transform = "translateY(-50%)"
            }
            return (
              <div
                key={pos}
                style={style}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  onMouseDown(e, pos)
                }}
              />
            )
          })}
        </>
      )}
    </div>
  )
}

/** 控点 → 光标样式 */
function cursorForHandle(pos: HandlePos): string {
  switch (pos) {
    case "n":
    case "s":
      return "ns-resize"
    case "e":
    case "w":
      return "ew-resize"
    case "nw":
    case "se":
      return "nwse-resize"
    case "ne":
    case "sw":
      return "nesw-resize"
  }
}

/* ========== 子组件：裁剪弹窗 ========== */

/** 裁剪弹窗 Props */
interface CropModalProps {
  image: WordImage
  onApply: (crop: { x: number; y: number; w: number; h: number }) => void
  onCancel: () => void
}

/**
 * 裁剪弹窗
 * 功能：在原图上叠加可拖拽的选区矩形，选区坐标 = 原图坐标系
 * 操作：拖动改变位置；8 控点缩放
 */
function CropModal({ image, onApply, onCancel }: CropModalProps) {
  // 选区（原图坐标系）
  const [crop, setCrop] = useState(image.crop)
  // 容器 ref（用于坐标换算）
  const wrapRef = useRef<HTMLDivElement | null>(null)
  // 预览区域最大尺寸
  const MAX_W = 520
  const MAX_H = 520
  // 缩放比：原图 → 预览
  const fitScale = Math.min(MAX_W / image.srcW, MAX_H / image.srcH, 1)
  const dispW = image.srcW * fitScale
  const dispH = image.srcH * fitScale

  /**
   * 鼠标按下选区
   * 功能：拖动整体 / 8 控点缩放（逻辑与 ImageNode 共享 resizeBox 思路）
   */
  const onBoxMouseDown = useCallback((
    e: React.MouseEvent,
    handle?: HandlePos,
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startCrop = { ...crop }

    const onMove = (mv: MouseEvent) => {
      const dxDisp = mv.clientX - startX
      const dyDisp = mv.clientY - startY
      // 屏幕位移 → 原图像素位移
      const dx = dxDisp / fitScale
      const dy = dyDisp / fitScale
      setCrop((prev) => {
        if (!handle) {
          // 整体移动
          return {
            x: clamp(startCrop.x + dx, 0, image.srcW - startCrop.w),
            y: clamp(startCrop.y + dy, 0, image.srcH - startCrop.h),
            w: startCrop.w,
            h: startCrop.h,
          }
        }
        // 缩放
        const next = resizeBox(startCrop, handle, dx, dy)
        return {
          x: clamp(next.x, 0, image.srcW - MIN_IMAGE_SIZE / fitScale),
          y: clamp(next.y, 0, image.srcH - MIN_IMAGE_SIZE / fitScale),
          w: clamp(next.w, MIN_IMAGE_SIZE / fitScale, image.srcW - next.x),
          h: clamp(next.h, MIN_IMAGE_SIZE / fitScale, image.srcH - next.y),
        }
      })
    }

    const onUp = () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }, [crop, fitScale, image.srcW, image.srcH])

  // 选区在预览中的位置/尺寸
  const dispCropX = crop.x * fitScale
  const dispCropY = crop.y * fitScale
  const dispCropW = crop.w * fitScale
  const dispCropH = crop.h * fitScale

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl p-5 w-[600px] max-w-[94vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <Crop size={14} className="text-blue-600" /> 裁剪图片
          </h3>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>

        {/* 预览区 */}
        <div
          ref={wrapRef}
          className="relative mx-auto bg-slate-100 select-none"
          style={{ width: dispW, height: dispH, backgroundImage: `url(${image.url})`, backgroundSize: "100% 100%" }}
        >
          {/* 暗罩：选区外的部分 */}
          <div className="absolute inset-0 bg-black/55" />
          {/* 选区亮区：用 4 个边反向遮挡更简单 */}
          <div
            className="absolute"
            style={{
              left: dispCropX,
              top: dispCropY,
              width: dispCropW,
              height: dispCropH,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              cursor: "move",
            }}
            onMouseDown={(e) => onBoxMouseDown(e)}
          >
            {HANDLE_POSITIONS.map((pos) => {
              const style: React.CSSProperties = {
                position: "absolute",
                width: 10,
                height: 10,
                background: "#2563eb",
                border: "2px solid #fff",
                borderRadius: 2,
                cursor: cursorForHandle(pos),
              }
              if (pos.includes("n")) style.top = -5
              if (pos.includes("s")) style.bottom = -5
              if (pos.includes("w")) style.left = -5
              if (pos.includes("e")) style.right = -5
              if (pos === "n" || pos === "s") {
                style.left = "50%"
                style.transform = "translateX(-50%)"
              }
              if (pos === "e" || pos === "w") {
                style.top = "50%"
                style.transform = "translateY(-50%)"
              }
              return (
                <div
                  key={pos}
                  style={style}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    onBoxMouseDown(e, pos)
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* 操作栏 */}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={() => onApply(crop)}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            应用裁剪
          </button>
        </div>

        {/* 提示 */}
        <div className="mt-2 text-[11px] text-slate-400 text-center">
          选区原图坐标：x={Math.round(crop.x)}, y={Math.round(crop.y)}, w={Math.round(crop.w)}, h={Math.round(crop.h)}
        </div>
      </div>
    </div>
  )
}

/* ========== 工具：clamp ========== */

/**
 * 把数值夹在 [min, max] 之间
 */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}
