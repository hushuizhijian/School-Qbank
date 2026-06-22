/**
 * QuestionImageEditor — 题目图片编辑器（V2 优化版：空白框+库点击填入）
 *
 * 功能：管理单道题目的所有图片，提供：
 *       1. 增：点击"新增图片"按钮 → 在当前题目下动态生成空白图片框
 *       2. 删：仅删除题目与图片的关联（磁盘文件保留 — 非破坏性）
 *       3. 替：通过父组件 fillRequest 填入指定空白槽位（图片库点击联动）
 *       4. 多图分隔：每张图片独立显示在独立卡片中（含空白占位）
 *       5. 缩放：集成 ZoomableImage 组件，支持鼠标滚轮 + 拖拽
 *
 * 数据结构约定（与父组件约定）：
 *   - 已填图片：{ path: "/data/papers/.../xxx.jpg", type: "figure" }
 *   - 空白占位：{ path: "", type: "blank" }（用于等待图片库点击填入）
 *   - 一旦父组件填入 path，则空白槽位变成正常图片
 *
 * 输入参数：
 *   images: QuestionImageValue[] — 当前题目关联的图片列表（含空白槽位）
 *   onChange: (images) => void — 图片列表变更回调
 *   onPickFromLibrary?: () => void — 触发"从资源库选择"回调（由父组件聚焦资源库）
 *   pendingBlankIndex?: number | null — 受控的当前激活空白槽位索引
 *   onPendingBlankChange?: (idx) => void — 激活槽位变更回调
 *   fillRequest?: { blankIndex, imagePath } | null — 父组件下达的填入指令
 *   onFillConsumed?: () => void — 填入完成后通知父组件清除请求
 *   maxHeight?: string — 图片区域最大高度
 * 返回值：JSX 题目图片编辑器
 * 使用场景：分题页 / 校对页的单题图片管理
 */
import { useState, useRef, useEffect } from "react"
import { ImageIcon, Trash2, Library, Plus, ZoomIn, Move, X, ImagePlus } from "lucide-react"
import { cn } from "@/utils/cn"
import ZoomableImage from "@/components/common/ZoomableImage"
import { toast } from "sonner"

/** 题目图片数据结构（支持对象和字符串两种格式） */
export type QuestionImageValue = string | { path?: string; url?: string; type?: string; description?: string; name?: string }

/** 空白槽位标记 */
const BLANK_TYPE = "blank"

/** 父组件下达的填入指令 */
export interface ImageFillRequest {
  blankIndex: number
  imagePath: string
}

/** 组件属性 */
interface QuestionImageEditorProps {
  /** 当前图片列表（含空白槽位） */
  images: QuestionImageValue[]
  /** 变更回调（add/remove/replace 都会触发） */
  onChange: (images: QuestionImageValue[]) => void
  /** "从资源库选择"触发回调：点击后由父组件聚焦资源库 */
  onPickFromLibrary?: () => void
  /** 受控的当前激活空白槽位索引（来自父组件） */
  pendingBlankIndex?: number | null
  /** 激活槽位变更回调 */
  onPendingBlankChange?: (idx: number | null) => void
  /** 父组件下达的填入指令：父组件图片库点击后置入本组件消费 */
  fillRequest?: ImageFillRequest | null
  /** 填入完成后通知父组件清除 fillRequest */
  onFillConsumed?: () => void
  /** 是否紧凑模式（分题页用紧凑模式） */
  compact?: boolean
  /** 排版：单列 / 双列 / 自动 */
  layoutMode?: "single" | "double" | "auto"
}

/** 归一化图片为 URL 字符串 */
function toUrl(img: QuestionImageValue): string {
  if (typeof img === "string") return img
  return img.path || img.url || ""
}

/** 归一化图片为对象 */
function toObject(img: QuestionImageValue): { path: string; type?: string; description?: string } {
  if (typeof img === "string") return { path: img, type: "figure" }
  return {
    path: img.path || img.url || "",
    type: img.type || "figure",
    description: img.description,
  }
}

/** 判断是否为空白槽位 */
function isBlank(img: QuestionImageValue): boolean {
  if (typeof img === "string") return !img
  return !img.path && !img.url
}

/**
 * 题目图片编辑器
 * 提供增/删/替/分隔/缩放 完整功能集
 * V2 优化：取消本地文件选择器，新增图片=创建空白框；图片库点击=填入空白框
 */
export default function QuestionImageEditor({
  images,
  onChange,
  onPickFromLibrary,
  pendingBlankIndex,
  onPendingBlankChange,
  fillRequest,
  onFillConsumed,
  compact = false,
  layoutMode = "auto",
}: QuestionImageEditorProps) {
  // 错误信息
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  // 当前激活的空白槽位索引（受控：来自父组件时优先使用）
  const activeBlankIndex = pendingBlankIndex !== undefined ? pendingBlankIndex : null
  // 用于在 fillRequest 变化时去重
  const lastFillTokenRef = useRef<string | null>(null)

  /** 网格列数（无图或单张时单列） */
  const cols = layoutMode === "single" ? 1 : layoutMode === "double" ? 2 : (images.length <= 1 ? 1 : 2)

  /**
   * 通知父组件激活槽位变更
   * - 若父组件未提供 onPendingBlankChange，则仅维持当前显示
   */
  const setActive = (idx: number | null) => {
    if (onPendingBlankChange) onPendingBlankChange(idx)
  }

  /**
   * 新增空白图片框
   * - 取消本地文件选择器（V2 优化）
   * - 在图片列表末尾追加一个空白槽位
   * - 自动高亮新槽位，引导用户去左侧图片库选择
   */
  const handleAddBlank = () => {
    const baseList = images.map(toObject)
    const newList = [...baseList, { path: "", type: BLANK_TYPE }]
    onChange(newList)
    // 高亮新空白槽位（通知父组件）
    setActive(newList.length - 1)
  }

  /**
   * 消费父组件下达的 fillRequest
   * - 把指定 blankIndex 处的空白槽位替换为 imagePath
   * - 消费完成后通知父组件清除（避免 React 18 严格模式双调用）
   */
  useEffect(() => {
    if (!fillRequest) return
    const token = `${fillRequest.blankIndex}|${fillRequest.imagePath}`
    if (lastFillTokenRef.current === token) return
    lastFillTokenRef.current = token

    const { blankIndex, imagePath } = fillRequest
    if (blankIndex < 0 || blankIndex >= images.length) {
      toast.warning("空白槽位已失效，请重新创建")
      if (onFillConsumed) onFillConsumed()
      return
    }
    const target = images[blankIndex]
    if (!isBlank(target)) {
      toast.warning("该位置已有图片，请先点击「新增图片」创建空白框")
      if (onFillConsumed) onFillConsumed()
      return
    }
    // 避免重复添加同一张图
    const exists = images.some((img) => toUrl(img) === imagePath)
    if (exists) {
      toast.info("该图片已存在")
      if (onFillConsumed) onFillConsumed()
      return
    }
    const newList = images.map((img, i) => {
      if (i !== blankIndex) return toObject(img)
      return { path: imagePath, type: "figure" }
    })
    onChange(newList)
    setActive(null)
    toast.success("图片已填入")
    if (onFillConsumed) onFillConsumed()
    // 仅依赖 fillRequest：避免 images/onChange 引用变化时重复消费同一指令
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillRequest])

  /**
   * 删除指定索引的图片/空白槽位
   * 非破坏性 — 仅解除关联，磁盘文件保留
   */
  const handleRemove = (index: number) => {
    const next = images.filter((_, i) => i !== index)
    onChange(next)
    if (activeBlankIndex === index) {
      setActive(null)
    } else if (activeBlankIndex !== null && activeBlankIndex > index) {
      setActive(activeBlankIndex - 1)
    }
    toast.success("已移除（磁盘文件保留）")
  }

  /**
   * 点击空白槽位 → 高亮该槽位为"等待填入"状态
   * 父组件可监听此状态以高亮显示
   */
  const handleBlankClick = (index: number) => {
    setActive(index)
    if (onPickFromLibrary) {
      // 通知父组件：现在期望从图片库获取图片
      onPickFromLibrary()
    }
  }

  return (
    <div className="space-y-1.5">
      {/* 工具栏 */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={handleAddBlank}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          title="在当前题目下新增空白图片框，然后到左侧图片库点击图片填入"
        >
          <Plus size={11} />
          新增图片
        </button>
        {onPickFromLibrary && (
          <button
            onClick={onPickFromLibrary}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
            title="聚焦到左侧图片资源库"
          >
            <Library size={11} />
            去资源库选
          </button>
        )}
        {images.length > 0 && (
          <span className="text-[10px] text-slate-400 ml-1 flex items-center gap-1">
            <ZoomIn size={9} />
            <Move size={9} />
            滚轮缩放 / 拖拽平移
          </span>
        )}
      </div>

      {/* 错误提示 */}
      {errorMsg && (
        <div className="px-2 py-1 bg-red-50 border border-red-200 rounded text-xs text-red-600 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}>
            <X size={10} />
          </button>
        </div>
      )}

      {/* 图片网格 */}
      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-16 bg-slate-50 border border-dashed border-slate-200 rounded text-slate-300 text-xs">
          <ImageIcon size={20} className="mb-0.5 opacity-50" />
          <span>暂无图片</span>
          <span className="text-[10px] mt-0.5">点击"新增图片"创建空白框</span>
        </div>
      ) : (
        <div
          className={cn("grid gap-2", compact ? "gap-1.5" : "gap-2")}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {images.map((img, idx) => {
            const url = toUrl(img)
            const blank = isBlank(img)
            const isActive = activeBlankIndex === idx
            return (
              <div
                key={`${url || "blank"}-${idx}`}
                className={cn(
                  "relative group rounded-lg border bg-white overflow-hidden shadow-sm hover:shadow transition-all",
                  blank
                    ? isActive
                      ? "border-blue-500 ring-2 ring-blue-400 border-dashed"
                      : "border-dashed border-slate-300"
                    : "border-slate-200",
                )}
              >
                {/* 序号标识 */}
                <div
                  className={cn(
                    "absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-[10px] font-medium",
                    blank
                      ? "bg-amber-500 text-white"
                      : "bg-black/60 text-white",
                  )}
                >
                  {blank ? `待选 ${idx + 1}` : `图 ${idx + 1}`}
                </div>

                {/* 空白占位 或 可缩放图片 */}
                {blank ? (
                  <button
                    onClick={() => handleBlankClick(idx)}
                    className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-blue-500 hover:bg-blue-50/30 transition-colors"
                    style={{ minHeight: compact ? "112px" : "160px" }}
                    title="点击此框，然后到左侧图片资源库选择图片"
                  >
                    <ImagePlus size={compact ? 20 : 28} className="mb-1 opacity-60" />
                    <span className="text-[10px]">点击此处</span>
                    <span className="text-[10px]">到左侧图片库选图</span>
                  </button>
                ) : (
                  <div className={cn("w-full bg-slate-50", compact ? "h-28" : "h-40")}>
                    <ZoomableImage
                      src={url}
                      alt={`图片${idx + 1}`}
                      showToolbar={!compact}
                    />
                  </div>
                )}

                {/* 操作按钮（hover 显示） */}
                <div className="absolute bottom-1 right-1 z-10 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleRemove(idx)}
                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-red-500 text-white hover:bg-red-600"
                    title="移除（磁盘文件保留）"
                  >
                    <Trash2 size={9} />
                    移除
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 底部提示 */}
      {images.length > 0 && (
        <p className="text-[10px] text-slate-400 px-1">
          💡 操作流程：点击"新增图片"创建空白框 → 点击空白框或"去资源库选" → 在左侧图片库点击图片自动填入
        </p>
      )}
    </div>
  )
}
