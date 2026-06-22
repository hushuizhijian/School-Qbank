/**
 * ImageResourceLibrary — 试卷图片资源库
 *
 * 功能：常驻展示试卷目录下所有图片资源（含未匹配题目的孤儿图片），
 *       严格保留所有图片，仅做"引用"关系管理（非破坏性）。
 *       支持按"全部/已匹配/未匹配"筛选、按归属题目筛选、点击替换到当前选中题目。
 * 输入参数：
 *   paperId: string — 试卷 ID
 *   selectedQuestionId: string | null — 当前选中的题目 ID（用于替换）
 *   selectedQuestionNo: number | null — 当前选中题号（用于显示）
 *   onReplaceToQuestion: (imagePath: string) => void — 点击图片回调（用于替换）
 *   onImagePreview?: (imagePath: string) => void — 双击图片预览回调
 * 返回值：JSX 图片资源库组件
 * 使用场景：PaperSplitPage 左侧分题方案区域下方的常驻图片库
 */
import { useState, useEffect, useMemo } from "react"
import { Image as ImageIcon, Filter, Search, AlertCircle, Check, Maximize2 } from "lucide-react"
import { cn } from "@/utils/cn"
import { getPaperImages, type PaperImageItem } from "@/api/papers"
import { useSSEStore } from "@/stores/sseStore"

/** 组件属性 */
interface ImageResourceLibraryProps {
  /** 试卷 ID */
  paperId: string
  /** 当前选中的题目 ID（用于替换） */
  selectedQuestionId: string | null
  /** 当前选中题号（用于显示） */
  selectedQuestionNo: number | null
  /** 点击图片回调：把图片资源应用到当前选中题目 */
  onReplaceToQuestion: (imagePath: string) => void
  /** 双击图片预览回调（可选） */
  onImagePreview?: (imagePath: string) => void
  /** 刷新触发器（外部改变时刷新列表） */
  refreshKey?: number
}

/** 筛选模式 */
type FilterMode = "all" | "matched" | "orphan" | "by-question"

/**
 * 图片资源库组件
 * 采用 grid 网格布局展示所有图片，hover 显示元信息和操作按钮
 */
export default function ImageResourceLibrary({
  paperId,
  selectedQuestionId,
  selectedQuestionNo,
  onReplaceToQuestion,
  onImagePreview,
  refreshKey,
}: ImageResourceLibraryProps) {
  // 全部图片列表
  const [allImages, setAllImages] = useState<PaperImageItem[]>([])
  // 加载状态
  const [loading, setLoading] = useState(false)
  // 加载错误
  const [error, setError] = useState<string | null>(null)
  // 筛选模式
  const [filter, setFilter] = useState<FilterMode>("all")
  // 关键词搜索
  const [keyword, setKeyword] = useState("")
  // 当前 hover 的图片路径
  const [hoverPath, setHoverPath] = useState<string | null>(null)
  const addGlobalLog = useSSEStore((s) => s.addLog)

  /** 加载图片列表 */
  const loadImages = async () => {
    if (!paperId) return
    setLoading(true)
    setError(null)
    try {
      const data = await getPaperImages(paperId)
      setAllImages(data.images || [])
    } catch (err) {
      console.error("加载图片资源失败:", err)
      setError("加载图片资源失败")
      addGlobalLog("加载图片资源失败", "err")
    } finally {
      setLoading(false)
    }
  }

  // 初始化 + 刷新触发：调用异步函数加载数据
  useEffect(() => {
    // 触发异步加载是 React 标准数据获取模式（外部系统 → 内部 state）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadImages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, refreshKey])

  /** 筛选后的图片列表 */
  const filteredImages = useMemo(() => {
    let list = allImages
    if (filter === "matched") {
      list = list.filter((img) => img.matched)
    } else if (filter === "orphan") {
      list = list.filter((img) => !img.matched)
    } else if (filter === "by-question" && selectedQuestionId) {
      list = list.filter((img) => img.matched_question_id === selectedQuestionId)
    }
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase()
      list = list.filter(
        (img) =>
          img.filename.toLowerCase().includes(kw) ||
          (img.matched_question_no != null &&
            String(img.matched_question_no).includes(kw)),
      )
    }
    return list
  }, [allImages, filter, keyword, selectedQuestionId])

  // 统计数据
  const stats = useMemo(() => {
    const matched = allImages.filter((i) => i.matched).length
    const orphan = allImages.length - matched
    return { total: allImages.length, matched, orphan }
  }, [allImages])

  /**
   * 处理图片点击
   * - 单击：触发替换到当前选中题目
   */
  const handleImageClick = (img: PaperImageItem) => {
    if (!selectedQuestionId) {
      addGlobalLog("请先选中一道题目", "warn")
      return
    }
    onReplaceToQuestion(img.path)
  }

  /**
   * 处理图片双击
   * - 双击：触发预览
   */
  const handleImageDoubleClick = (img: PaperImageItem) => {
    if (onImagePreview) {
      onImagePreview(img.path)
    }
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50/50 flex flex-col">
      {/* 标题栏 */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-slate-200 bg-white">
        <ImageIcon size={14} className="text-blue-500" />
        <span className="text-sm font-semibold text-slate-700">图片资源库</span>
        <span className="text-xs text-slate-400 ml-1">
          共 {stats.total} 张（已匹配 {stats.matched} / 未匹配 {stats.orphan}）
        </span>
        {selectedQuestionNo != null && (
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
            点击图片 → 替换到第 {selectedQuestionNo} 题
          </span>
        )}
      </div>

      {/* 筛选 + 搜索 */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-slate-100 bg-white">
        {/* 筛选按钮组 */}
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-slate-400" />
          {[
            { key: "all" as const, label: "全部" },
            { key: "matched" as const, label: "已匹配" },
            { key: "orphan" as const, label: "未匹配" },
            { key: "by-question" as const, label: "当前题" },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={cn(
                "px-1.5 py-0.5 text-xs rounded transition-colors",
                filter === opt.key
                  ? "bg-blue-500 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                opt.key === "by-question" && !selectedQuestionId && "opacity-40 cursor-not-allowed",
              )}
              disabled={opt.key === "by-question" && !selectedQuestionId}
              title={opt.key === "by-question" ? "先选中一道题目" : opt.label}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* 搜索框 */}
        <div className="flex-1 relative">
          <Search size={11} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按文件名/题号筛选"
            className="w-full pl-6 pr-2 py-0.5 text-xs border border-slate-200 rounded focus:border-blue-300 focus:outline-none"
          />
        </div>
      </div>

      {/* 内容区：图片网格（V3 双列布局） */}
      <div className="px-3 py-2 overflow-y-auto" style={{ height: '800px', display: 'flex', flexDirection: 'column', paddingTop: '8px', paddingBottom: '8px' }}>
        {loading ? (
          <div className="flex items-center justify-center h-24 text-xs text-slate-400">
            <span className="animate-pulse">加载中...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-24 text-xs text-red-500">
            <AlertCircle size={12} className="mr-1" />
            {error}
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-slate-300 text-xs">
            <ImageIcon size={20} className="mb-1 opacity-50" />
            <span>暂无图片资源</span>
            <span className="text-[10px] mt-1 text-slate-400">
              请确认试卷已解析完成（data/papers/{paperId.slice(0, 8)}.../images/）
            </span>
          </div>
        ) : (
          // V3 布局：双列响应式 grid
          // - 移动端（< md）：单列 1 张图，更大展示
          // - 平板及以上（≥ md）：双列展示
          // - 每张图保持正方形（aspect-square），缩略图清晰
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredImages.map((img) => (
              <div
                key={img.path}
                onClick={() => handleImageClick(img)}
                onDoubleClick={() => handleImageDoubleClick(img)}
                onMouseEnter={() => setHoverPath(img.path)}
                onMouseLeave={() => setHoverPath(null)}
                className={cn(
                  "relative group rounded border overflow-hidden bg-white cursor-pointer transition-all aspect-square",
                  "hover:border-blue-400 hover:shadow-md",
                  img.matched ? "border-slate-200" : "border-amber-300",
                  hoverPath === img.path && "ring-2 ring-blue-400",
                )}
                title={`${img.filename}（${img.matched ? `已匹配第 ${img.matched_question_no} 题` : "未匹配"}）`}
              >
                {/* 缩略图 */}
                <img
                  src={img.path}
                  alt={img.filename}
                  loading="lazy"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    const target = e.currentTarget
                    target.style.opacity = "0.2"
                  }}
                />

                {/* 匹配状态徽标 */}
                {img.matched ? (
                  <span
                    className="absolute top-0.5 left-0.5 flex items-center gap-0.5 px-1 py-0 text-[9px] rounded bg-emerald-500 text-white"
                    title={`已关联到第 ${img.matched_question_no} 题`}
                  >
                    <Check size={8} />
                    Q{img.matched_question_no}
                  </span>
                ) : (
                  <span
                    className="absolute top-0.5 left-0.5 px-1 py-0 text-[9px] rounded bg-amber-500 text-white"
                    title="未匹配到任何题目（孤儿图片）"
                  >
                    未匹配
                  </span>
                )}

                {/* hover 时显示的文件名 + 预览按钮 */}
                {hoverPath === img.path && (
                  <>
                    <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 text-white text-[9px] truncate">
                      {img.filename}
                    </div>
                    {onImagePreview && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onImagePreview(img.path)
                        }}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/50 text-white hover:bg-blue-500"
                        title="放大预览"
                      >
                        <Maximize2 size={10} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-4 py-1 border-t border-slate-100 text-[10px] text-slate-400 bg-white">
        💡 单击图片 → 替换到当前选中题目 · 双击 → 放大预览 · 所有图片均予以保留，不直接删除
      </div>
    </div>
  )
}
