/**
 * 作业组卷页 — 三栏布局 + 实时画布预览
 *
 * 功能：完整的组卷工作台，支持：
 *   1. 纸张格式切换（A3 双列 / A4 单列），实时重排画布
 *   2. 左侧题库管理：搜索 + 知识点筛选 + 单列题目列表，单击或拖拽添加
 *   3. 中间画布：A4 单列 / A3 双列拖拽排序，题目排版与字号实时预览
 *   4. 右侧格式设置：页眉文字、LOGO 上传、试卷标题、学科/年级、
 *      页脚、姓名班级、水印（文字/透明度/角度/字号）、题目正文字号
 *   5. 顶部操作栏：保存（自动保存）、导出 PDF（A3/A4 自适应）
 * 布局：上 56px 工具栏 + 下 左 320 / 中 flex / 右 340 网格
 * 路由：/homework/compose/new（新建）/ /homework/:id/compose（编辑）
 *
 * 改造点：
 *   - 左侧"题库"列：使用 PreviewRenderer 渲染完整题干（WYSIWYG），
 *     缩小字号与图片，确保题目内容根据列宽自适应
 *   - 左侧"题库"列点击：稳定事件回调，避免重复触发与页面刷新
 *   - 画布：确保标题/页眉/水印/页脚在画布中正确显示
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useParams, useNavigate } from "react-router-dom"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ArrowLeft, Save, FileDown, Trash2, GripVertical,
  Search, BookOpen, X, Upload, Image as ImageIcon,
  Type, Settings2, FileText, ChevronDown, ChevronRight,
  Library, Bookmark, BookmarkPlus, Eye, EyeOff,
  Check,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/utils/cn"
import {
  createHomework,
  getHomework,
  updateHomework,
  addHomeworkQuestion,
  removeHomeworkQuestion,
  updateHomeworkQuestions,
  setHomeworkQuestionScore,
} from "@/api/homework"
import { getQuestions } from "@/api/questions"
import { getKnowledgeTree } from "@/api/knowledge"
import {
  getPaperTemplates,
  createPaperTemplate,
  deletePaperTemplate,
  applyPaperTemplate,
  type PaperTemplate,
} from "@/api/paperTemplates"
import type { Question } from "@/types/question"
import type { KnowledgePoint } from "@/types/knowledge"
import type { Homework, HomeworkQuestionItem, HomeworkPageConfig } from "@/types/homework"
import { exportCanvasToPdf } from "@/utils/pdfExport"
import client from "@/api/client"
import PreviewRenderer from "@/components/question/PreviewRenderer"
import SmartQuestionImage from "@/components/common/SmartQuestionImage"
import PaperPreview from "@/components/compose/PaperPreview"
import PaginationPreview from "@/components/compose/PaginationPreview"
import LayerPanel, {
  applyLayerAction,
  type LayerAction,
  type LayerId,
} from "@/components/compose/LayerPanel"

/* ========== 常量 ========== */

/** 题型中文标签（与 PDF 导出保持一致，6 种标准 + 兼容旧 key） */
const TYPE_LABEL: Record<string, string> = {
  // 6 种标准
  choice: "选择",
  fill_blank: "填空",
  true_false: "判断",
  calculation: "计算",
  operation: "操作",
  application: "解决问题",
  // 兼容旧 key
  single: "选择",
  multi: "选择",
  fill: "填空",
  judge: "判断",
  calc: "计算",
  general: "解决问题",
}

/** 题型颜色（6 种标准 + 兼容旧 key） */
const TYPE_COLORS: Record<string, string> = {
  // 6 种标准
  choice: "bg-blue-100 text-blue-700",
  fill_blank: "bg-cyan-100 text-cyan-700",
  true_false: "bg-amber-100 text-amber-700",
  calculation: "bg-green-100 text-green-700",
  operation: "bg-purple-100 text-purple-700",
  application: "bg-indigo-100 text-indigo-700",
  // 兼容旧 key
  single: "bg-blue-100 text-blue-700",
  multi: "bg-indigo-100 text-indigo-700",
  fill: "bg-cyan-100 text-cyan-700",
  judge: "bg-amber-100 text-amber-700",
  general: "bg-slate-100 text-slate-700",
}

/** 纸张选项 */
const PAPER_OPTIONS: { value: "A3" | "A4"; label: string; desc: string; size: string }[] = [
  { value: "A4", label: "A4 — 校本作业", desc: "单列排版，适合校内日常作业", size: "210×297mm" },
  { value: "A3", label: "A3 — 标准试卷", desc: "双列排版，适合标准考试试卷", size: "297×420mm" },
]

/** 默认 page_config */
const DEFAULT_PAGE_CONFIG: HomeworkPageConfig = {
  paper_size: "A4",
  header_text: "",
  header_font_size: 10,
  footer_text: "第 {page} 页 / 共 N 页",
  footer_font_size: 9,
  watermark_text: "",
  watermark_opacity: 0.08,
  watermark_angle: -30,
  watermark_size: 56,
  logo_url: "",
  logo_width: 18,
  question_font_size: 11,
  title_font_size: 20,
  // 需求（图层化）：标题位置已改造为独立可拖拽图层（title_box），不再使用偏移量字段
  info_font_size: 10,
  show_subject_grade: true,
  show_name_class: true,
}

/* ========== 工具函数 ========== */

/**
 * 从 HTML / LaTeX 文本中提取纯文本预览（前 60 字）
 *
 * 功能：去除 HTML 标签、KaTeX 公式标记，输出可读简短文本
 * 输入参数：text - 原始题干
 * 返回值：≤60 字的纯文本预览
 * 使用场景：左侧题库列表、画布中题目的紧凑展示
 */
function buildPreview(text: string, maxLen = 60): string {
  if (!text) return ""
  let t = text
  // 去除 <img> 标签但保留 alt
  t = t.replace(/<img[^>]*alt="([^"]*)"[^>]*\/?>/gi, "[图:$1]")
  t = t.replace(/<img[^>]*\/?>/gi, "[图]")
  // 去除 KaTeX 公式 ($$...$$)
  t = t.replace(/\$\$[\s\S]*?\$\$/g, "[公式]")
  t = t.replace(/\$[^$]*\$/g, "[公式]")
  // 去除 HTML 标签
  t = t.replace(/<[^>]+>/g, "")
  // 解码常见实体
  t = t.replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
  // 去除多余空白
  t = t.replace(/\s+/g, " ").trim()
  if (t.length > maxLen) t = t.slice(0, maxLen) + "…"
  return t
}

/**
 * 把 HomeworkQuestionItem[] 与 Question 合并成画布用的题目项
 *
 * 输入参数：items - 后端返回的 homework_questions；questionMap - 缓存的题目详情；
 *          blankLinesMap - 来自 page_config.blank_lines 的 hq_id → 留白行数映射
 * 返回值：{ hqId, question, score, sortOrder, blankLines } 列表
 * 使用场景：组卷页加载/刷新画布
 */
function mergeQuestions(
  items: HomeworkQuestionItem[],
  questionMap: Record<string, Question>,
  blankLinesMap: Record<string, number> = {},
) {
  return items
    .map((it) => {
      const q = questionMap[it.question_id]
      if (!q) return null
      return {
        hqId: it.id,
        question: q,
        score: it.score,
        sortOrder: it.sort_order,
        blankLines: blankLinesMap[it.id] ?? 0,
      }
    })
    .filter(
      (it): it is { hqId: string; question: Question; score: number; sortOrder: number; blankLines: number } =>
        it !== null,
    )
}

/* ========== 左侧：题库面板 ========== */

/**
 * 左侧题库管理面板
 *
 * 功能：搜索 + 知识点筛选（多级树） + 已入库题目单列列表
 *       单击题目 → 画布追加；拖拽题目 → 画布插入到指定位置
 *       题干使用 PreviewRenderer 渲染，呈现所见即所得效果
 * 输入参数：
 *   - selectedIds: 已加入画布的题目 id 集合
 *   - onAdd: 点击 / 拖拽添加的回调
 *   - refreshKey: 外部强制刷新计数（仅在外部数据需要重置时变更）
 * 返回值：React 节点
 *
 * 修复点：
 *   - 渲染：使用 PreviewRenderer 替代 buildPreview，保留 HTML 标签与 LaTeX
 *   - 字号/图片：缩小字号（11px）与图片宽度（max-w-[140px]），自适应列宽
 *   - 点击：使用 useCallback 稳定的 onAdd 引用，避免重渲染闪烁
 *   - refreshKey 默认值为 0，且不会因为 canvasItems 变化而自动变更多次
 */
function QuestionBankPanel({
  selectedIds,
  onAdd,
  refreshKey,
}: {
  selectedIds: Set<string>
  onAdd: (q: Question) => void
  refreshKey: number
}) {
  /* ---------- 状态 ---------- */

  // 题目列表（分页加载）
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  // 已选知识点 ID 列表
  const [kpIds, setKpIds] = useState<string[]>([])
  // 知识点树
  const [kpTree, setKpTree] = useState<KnowledgePoint[]>([])
  // 知识点筛选区域展开
  const [kpOpen, setKpOpen] = useState(true)
  // 滚动容器 ref
  const scrollRef = useRef<HTMLDivElement>(null)

  /* ---------- 加载知识点树 ---------- */

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await getKnowledgeTree()
        if (active) setKpTree(res.tree || [])
      } catch (err) {
        console.error("加载知识点树失败:", err)
      }
    })()
    return () => { active = false }
  }, [])

  /* ---------- 加载题目列表 ---------- */

  const loadPage = useCallback(
    async (pageNum: number, reset = false) => {
      setLoading(true)
      try {
        const params: Record<string, unknown> = {
          page: pageNum,
          page_size: 30,
          in_bank_only: true,
        }
        if (keyword.trim()) params.keyword = keyword.trim()
        if (kpIds.length > 0) params.knowledge_point_ids = kpIds.join(",")
        const res = await getQuestions(params)
        if (reset) {
          setQuestions(res.items)
        } else {
          setQuestions((prev) => [...prev, ...res.items])
        }
        setTotal(res.total)
        setHasMore(res.items.length === 30 && pageNum * 30 < res.total)
        setPage(pageNum)
      } catch (err) {
        console.error("加载题库失败:", err)
        toast.error("加载题库失败")
      } finally {
        setLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyword, kpIds, refreshKey],
  )

  // 搜索 / 知识点变化时重置
  useEffect(() => {
    queueMicrotask(() => {
      void loadPage(1, true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, kpIds, refreshKey])

  /* ---------- 滚动加载 ---------- */

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el || loading || !hasMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      loadPage(page + 1, false)
    }
  }

  /* ---------- 知识点树展开状态 ---------- */

  // 展开状态：知识点 id → bool
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  /** 切换展开 */
  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  /** 切换知识点选中 */
  const toggleKp = (kp: KnowledgePoint, checked: boolean) => {
    if (checked) {
      setKpIds((prev) => Array.from(new Set([...prev, kp.id])))
    } else {
      setKpIds((prev) => prev.filter((id) => id !== kp.id))
    }
  }

  // 构造树
  const treeRoots = useMemo(() => {
    const map = new Map<string, KnowledgePoint & { children: KnowledgePoint[] }>()
    kpTree.forEach((k) => map.set(k.id, { ...k, children: [] }))
    const roots: (KnowledgePoint & { children: KnowledgePoint[] })[] = []
    kpTree.forEach((k) => {
      const node = map.get(k.id)!
      if (k.parent_id && map.has(k.parent_id)) {
        map.get(k.parent_id)!.children.push(node)
      } else {
        roots.push(node)
      }
    })
    return roots
  }, [kpTree])

  /* ---------- 稳定的点击处理（避免重复触发与闪烁） ---------- */

  /**
   * 稳定的点击处理函数
   * 输入参数：q - 题目对象
   * 返回值：无（调用外部 onAdd 回调）
   * 修复点：原代码直接用箭头函数 onClick={() => onAdd(q)}，每次渲染都创建新函数
   *        可能导致 React 的 onClick 引用变化引发不必要的重渲染甚至页面跳动
   *        现改为稳定的 handler 引用
   */
  const handleItemClick = useCallback(
    (q: Question) => {
      // 防御：未选择纸张格式时不响应点击
      if (!q) return
      onAdd(q)
    },
    [onAdd],
  )

  /* ---------- 渲染知识点树节点 ---------- */

  const renderKpNode = (
    node: KnowledgePoint & { children: KnowledgePoint[] },
    level: number,
  ): React.ReactNode => {
    const isOpen = expanded[node.id] ?? level < 2
    const isChecked = kpIds.includes(node.id)
    const hasChildren = node.children && node.children.length > 0
    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-1 py-1 px-1 rounded hover:bg-slate-50 cursor-pointer text-sm",
            isChecked && "bg-blue-50 text-blue-700",
          )}
          style={{ paddingLeft: `${level * 12 + 4}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="shrink-0 text-slate-400 hover:text-slate-600"
            >
              {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          ) : (
            <span className="w-3" />
          )}
          <label className="flex-1 flex items-center gap-1.5 min-w-0 cursor-pointer">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(e) => toggleKp(node, e.target.checked)}
              className="w-3 h-3 accent-blue-600 shrink-0"
            />
            <span className="truncate" title={node.name}>{node.name}</span>
          </label>
        </div>
        {isOpen && hasChildren && (
          <div>
            {node.children.map((c) => renderKpNode(c as KnowledgePoint & { children: KnowledgePoint[] }, level + 1))}
          </div>
        )}
      </div>
    )
  }

  /* ---------- 渲染 ---------- */

  return (
    <div className="flex flex-col h-full">
      {/* 顶部标题 + 搜索 */}
      <div className="p-3 border-b border-slate-200 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Library size={14} />
          题库
          <span className="ml-auto text-[11px] font-normal text-slate-400">
            {total} 题
          </span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索题干关键词..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 知识点筛选（可折叠） */}
      <div className="border-b border-slate-200 shrink-0">
        <button
          onClick={() => setKpOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {kpOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <BookOpen size={12} />
          知识点筛选
          {kpIds.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-600 text-[10px]">
              {kpIds.length}
            </span>
          )}
          {kpIds.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setKpIds([]) }}
              className="ml-auto text-slate-400 hover:text-red-500"
              title="清空筛选"
            >
              <X size={12} />
            </button>
          )}
        </button>
        {kpOpen && (
          <div className="px-2 pb-2 max-h-[200px] overflow-y-auto">
            {treeRoots.length === 0 ? (
              <div className="text-[11px] text-slate-400 py-2 text-center">加载中...</div>
            ) : (
              treeRoots.map((r) => renderKpNode(r, 0))
            )}
          </div>
        )}
      </div>

      {/* 题目列表（单列） — WYSIWYG 渲染：缩小字号、压缩图片、保留 LaTeX/HTML */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 space-y-1.5"
      >
        {questions.length === 0 && !loading && (
          <div className="text-center text-slate-400 text-xs py-8">
            {keyword || kpIds.length > 0 ? "未找到匹配的题目" : "题库为空"}
          </div>
        )}
        {questions.map((q) => {
          const inCanvas = selectedIds.has(q.id)
          return (
            <div
              key={q.id}
              // 关键修复：仅可拖拽 + 点击，移除 onKeyDown（避免与画布中键盘快捷键冲突）
              // 移除 role="button"/tabIndex 防止浏览器对子元素（链接/图片）聚焦时回车重复触发
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", q.id)
                e.dataTransfer.effectAllowed = "copy"
              }}
              onClick={(e) => {
                // 阻止冒泡：避免某些子元素（链接、a 标签）的默认行为触发页面跳转
                e.preventDefault()
                e.stopPropagation()
                // 限制：左列点击只触发"添加题目"，不触发任何其他操作
                handleItemClick(q)
              }}
              className={cn(
                "group px-2.5 py-2 rounded-md border bg-white cursor-pointer transition-all select-none",
                "hover:border-blue-400 hover:shadow-sm",
                inCanvas ? "border-blue-300 bg-blue-50/50" : "border-slate-200",
              )}
              title={inCanvas ? "已加入画布（再次点击可重复添加）" : "点击或拖拽到画布添加"}
            >
              <div className="flex items-center gap-1.5 text-[10px] mb-1">
                <span className={cn(
                  "inline-block px-1.5 py-0.5 rounded font-medium",
                  TYPE_COLORS[q.question_type] || TYPE_COLORS.general,
                )}>
                  {TYPE_LABEL[q.question_type] || q.question_type || "未分类"}
                </span>
                <span className="text-slate-400 ml-auto shrink-0">#{q.id.slice(-4)}</span>
              </div>
              {/* 题干：WYSIWYG 渲染（保留 HTML/LaTeX），缩小字号让内容更紧凑 */}
              <div
                className="text-slate-700 leading-snug pointer-events-none"
                style={{
                  fontSize: "11px",
                  lineHeight: 1.4,
                  // 限制最大高度为 5 行，超出滚动（避免过长时撑爆列）
                  maxHeight: "5.6em",
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 5,
                  WebkitBoxOrient: "vertical",
                }}
              >
                <div
                  className="[&_.katex]:text-[11px] [&_.katex-display]:my-0.5 [&_p]:my-0.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_img]:max-w-full [&_img]:max-h-[80px] [&_img]:w-auto [&_table]:text-[10px] [&_a]:pointer-events-none"
                >
                  {q.stem?.trim() ? (
                    <PreviewRenderer content={q.stem} />
                  ) : (
                    <span className="italic text-slate-300 text-[11px]">（题干为空）</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                {q.knowledge_points && q.knowledge_points.length > 0 && (
                  <span className="truncate">{q.knowledge_points[0].name}</span>
                )}
                {q.has_figure && <ImageIcon size={10} />}
                {inCanvas && <span className="ml-auto text-blue-600">已加入</span>}
              </div>
            </div>
          )
        })}
        {loading && (
          <div className="text-center text-slate-400 text-xs py-3">加载中...</div>
        )}
        {!hasMore && questions.length > 0 && (
          <div className="text-center text-slate-300 text-[10px] py-2">— 已加载全部 —</div>
        )}
      </div>
    </div>
  )
}

/* ========== 画布中的可拖拽题目项 ========== */

/**
 * 画布中的单个题目项（需求 3 简化版）
 *
 * 功能：去掉「第 X 题 / 题型 / 分值」题头栏；左侧列内增加题号与拖拽柄；
 *       删除按钮悬浮在右上角（hover 显示）；选中题目时显示「下增一行」按钮；
 *       解答题不再硬塞 3 横线，改由用户点击「下增一行」手动添加。
 * 输入参数：index（题号）、hqId、question、score、fontSize、blankLines、
 *          selected、onSelect、onDelete、onScoreChange、onAddBlankLine、onRemoveBlankLine
 * 返回值：可拖拽节点
 */
function SortableCanvasItem({
  index,
  hqId,
  question,
  score,
  fontSize,
  scale,
  blankLines,
  selected,
  onSelect,
  onDelete,
  onScoreChange,
  onAddBlankLine,
  onRemoveBlankLine,
}: {
  index: number
  hqId: string
  question: Question
  score: number
  fontSize: number
  /** 需求（PDF 1:1 还原）：画布缩放因子，用于将配置字号转为物理像素字号 */
  scale: number
  /** 用户手动添加的留白行数（持久化在 page_config.blank_lines） */
  blankLines: number
  /** 是否被选中（用于显示下增一行按钮） */
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  onScoreChange: (s: number) => void
  onAddBlankLine: () => void
  onRemoveBlankLine: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: hqId,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={cn(
        "group relative bg-white border rounded-md mb-2 transition-all cursor-pointer",
        selected
          ? "border-blue-500 shadow-md ring-1 ring-blue-200"
          : isDragging
            ? "shadow-lg border-blue-400"
            : "border-slate-200 hover:border-slate-300",
      )}
    >
      {/* 悬浮工具条：右上角，hover 或选中时显示
         - 题型小标签（替代题头栏的「什么题」）
         - 分值输入框（替代题头栏的「分值」）
         - 删除按钮 */}
      <div
        className={cn(
          "absolute top-1 right-1 flex items-center gap-1.5 px-1.5 py-0.5 rounded z-10 transition-opacity",
          "bg-white/90 backdrop-blur-sm border border-slate-200",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={cn(
          "px-1.5 py-0.5 rounded text-[9px] font-medium",
          TYPE_COLORS[question.question_type] || TYPE_COLORS.general,
        )}>
          {TYPE_LABEL[question.question_type] || "解答题"}
        </span>
        <input
          type="number"
          value={score}
          min={0}
          onChange={(e) => onScoreChange(Number(e.target.value) || 0)}
          onClick={(e) => e.stopPropagation()}
          className="w-10 px-1 py-0 text-center border border-slate-200 rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-500"
          title="设置分值"
        />
        <span className="text-[10px] text-slate-400">分</span>
        <button
          onClick={onDelete}
          className="ml-0.5 p-0.5 text-slate-300 hover:text-red-500 rounded"
          title="从画布移除"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* 题干区：左列 = 拖拽柄 + 题号，主体 = 题干 + 选项 + 图片 */}
      <div className="px-3 py-2 flex items-start gap-1.5">
        {/* 左列：拖拽柄 + 题号（位于第一行左列） */}
        <div className="flex flex-col items-center gap-0.5 shrink-0 select-none">
          <button
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing p-0.5"
            title="拖拽排序"
          >
            <GripVertical size={12} />
          </button>
          <span
            className="text-[13px] font-semibold text-slate-700 leading-tight"
            style={{ minWidth: "1.4em", textAlign: "center" }}
          >
            {index + 1}.
          </span>
        </div>
        {/* 主体：题干 + 选项 + 图片
            需求（PDF 1:1 还原）：画布字号 = 配置值 / scale，
            与后端字号 = 配置值 × 0.75 / scale 等效（推导见 PaperPreview.tsx） */}
        <div
          className="flex-1 min-w-0 prose prose-sm max-w-none text-slate-800 leading-relaxed [&_.katex-display]:my-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_img]:max-w-full"
          style={{ fontSize: `${fontSize / scale}px` }}
        >
          <PreviewRenderer content={question.stem || ""} />
          {question.options && Array.isArray(question.options) && question.options.length > 0 && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 not-prose">
              {((question.options as unknown[]) || []).map((opt, idx) => {
                let label = String.fromCharCode(65 + idx)
                let content = ""
                if (typeof opt === "string") {
                  content = opt
                } else if (opt && typeof opt === "object") {
                  const obj = opt as Record<string, unknown>
                  if (obj.label) label = String(obj.label)
                  content = String(obj.content || obj.text || "")
                }
                return (
                  <div key={idx} className="flex items-start gap-1 min-w-0">
                    <span className="font-medium text-slate-500 shrink-0">{label}.</span>
                    <span className="flex-1 min-w-0 break-words">{content}</span>
                  </div>
                )
              })}
            </div>
          )}
          {/* 配图（缩略） */}
          {question.images && question.images.length > 0 && (
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 not-prose">
              {(question.images as unknown[]).slice(0, 4).map((img, idx) => {
                const rawPath = typeof img === "string"
                  ? img
                  : (img as Record<string, unknown>)?.path || (img as Record<string, unknown>)?.url || ""
                return (
                  <SmartQuestionImage
                    key={`${question.id}-${idx}`}
                    questionId={question.id}
                    imageIndex={idx}
                    rawPath={String(rawPath)}
                    alt={`题目图片 ${idx + 1}`}
                    className="w-full h-16 rounded border border-slate-100 bg-slate-50"
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 用户手动添加的留白行（blankLines）— 替代原"解答题三横线"硬塞设计 */}
      {blankLines > 0 && (
        <div className="px-3 pb-2 pl-9 space-y-2">
          {Array.from({ length: blankLines }).map((_, i) => (
            <div key={i} className="border-b border-slate-300 h-4" />
          ))}
        </div>
      )}

      {/* 选中时：下增一行 / 减少一行 按钮（秀米风格） */}
      {selected && (
        <div
          className="px-3 pb-2 pl-9 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onAddBlankLine}
            className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 flex items-center gap-1"
            title="在题目下方插入一个空白作答行"
          >
            + 下增一行
          </button>
          {blankLines > 0 && (
            <button
              onClick={onRemoveBlankLine}
              className="text-[11px] px-2 py-0.5 bg-slate-50 text-slate-500 rounded hover:bg-slate-100"
              title="移除最后一个空白行"
            >
              − 减少一行
            </button>
          )}
          {blankLines > 0 && (
            <span className="text-[10px] text-slate-400">已添加 {blankLines} 行留白</span>
          )}
        </div>
      )}
    </div>
  )
}

/* ========== 中间：画布区域（实时预览） ========== */

/**
 * 中间画布区域
 *
 * 功能：实时渲染试卷画布，支持 A4 单列 / A3 双列切换
 *       拖拽排序、点击删除、改分值；接收外部拖入添加；
 *       画布最下方展示格式范例列表（需求 7）。
 * 输入参数：homework、合并后的题目项、page_config、回调函数、范例数据
 * 返回值：画布节点
 */
function ComposeCanvas({
  homework,
  items,
  pageConfig,
  paperSize,
  onReorder,
  onDelete,
  onScoreChange,
  onDropQuestion,
  onClearCanvas,
  onFieldChange,
  onAddBlankLine,
  onRemoveBlankLine,
  templates,
  showTemplates,
  onToggleTemplates,
  onApplyTemplate,
  onDeleteTemplate,
  selectedLayerId,
  onSelectLayer,
}: {
  homework: Homework
  items: { hqId: string; question: Question; score: number; sortOrder: number; blankLines: number }[]
  pageConfig: HomeworkPageConfig
  paperSize: "A3" | "A4"
  onReorder: (newItems: { hqId: string; question: Question; score: number; sortOrder: number; blankLines: number }[]) => void
  onDelete: (hqId: string) => void
  onScoreChange: (hqId: string, score: number) => void
  onDropQuestion: (questionId: string) => void
  onClearCanvas: () => void
  onFieldChange: (field: "page_config_field", value: { key: keyof HomeworkPageConfig; value: unknown }) => void
  /** 需求 3：选中题目 → 题目下方追加一个留白行 */
  onAddBlankLine: (hqId: string) => void
  /** 需求 3：移除题目最后一行留白 */
  onRemoveBlankLine: (hqId: string) => void
  /** 需求 7：范例列表相关（显示在画布最下方） */
  templates: PaperTemplate[]
  showTemplates: boolean
  onToggleTemplates: () => void
  onApplyTemplate: (templateId: string) => void
  onDeleteTemplate: (templateId: string) => void
  /** 需求（图层）：当前选中的图层（用于画布高亮） */
  selectedLayerId?: LayerId | null
  /** 需求（图层）：选中图层回调 */
  onSelectLayer?: (id: LayerId | null) => void
}) {
  // DnD 状态
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dropHintIndex, setDropHintIndex] = useState<number | null>(null) // 拖拽放置提示位置
  // 需求 3：当前选中的题目（点击后显示"下增一行"按钮）；点击画布空白处取消选中
  const [selectedHqId, setSelectedHqId] = useState<string | null>(null)
  // 需求（分页预览）：是否启用"分页预览"模式
  // 关闭时 = 单页 PaperPreview（沿用现有逻辑）
  // 开启时 = 多页 PaginationPreview（垂直堆叠 A4 页面）
  const [paginationMode, setPaginationMode] = useState(false)

  /* ---------- 拖拽处理 ---------- */

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }

  const handleDragOver = (e: { over: { id: string | number } | null }) => {
    if (!e.over) {
      setDropHintIndex(null)
      return
    }
    const overIdx = items.findIndex((it) => it.hqId === String(e.over!.id))
    if (overIdx >= 0) setDropHintIndex(overIdx)
  }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null)
    setDropHintIndex(null)
    if (!e.over) return
    const oldIndex = items.findIndex((it) => it.hqId === String(e.active.id))
    const newIndex = items.findIndex((it) => it.hqId === String(e.over!.id))
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      onReorder(arrayMove(items, oldIndex, newIndex))
    }
  }

  const handleDragCancel = () => {
    setActiveId(null)
    setDropHintIndex(null)
  }

  /* ---------- 接收 HTML5 外部拖拽（从题库拖入） ---------- */

  const handleHtml5DragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("text/plain")) {
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
    }
  }

  const handleHtml5Drop = (e: React.DragEvent) => {
    e.preventDefault()
    const questionId = e.dataTransfer.getData("text/plain")
    if (questionId) onDropQuestion(questionId)
  }

  /* ---------- 派生：纸张画布样式 ---------- */

  // A4 / A3 物理毫米尺寸（与 PDF 服务 _A3_WIDTH/_A4_WIDTH 保持一致）
  const pageWidthMm = paperSize === "A3" ? 297 : 210
  const pageHeightMm = paperSize === "A3" ? 420 : 297
  // 视口内按 0.6-0.9 倍缩放（A3 大尺寸需更紧凑）— 仅控制屏幕显示大小
  // 需求（PDF 1:1 还原）：物理尺寸由 mm × 3.78 决定（1mm ≈ 3.7795 px @ 96dpi），
  //   屏幕显示尺寸 = 物理尺寸 × scale；box 坐标以物理像素为单位
  const scale = paperSize === "A3" ? 0.6 : 0.78
  const displayWidth = pageWidthMm * 3.78 * scale   // 屏幕显示宽度
  const displayHeight = pageHeightMm * 3.78 * scale // 屏幕显示高度

  const questionFontSize = pageConfig.question_font_size ?? 11
  const titleFontSize = pageConfig.title_font_size ?? 20
  const infoFontSize = pageConfig.info_font_size ?? 10
  const headerFontSize = pageConfig.header_font_size ?? 10
  const footerFontSize = pageConfig.footer_font_size ?? 9
  const watermarkSize = pageConfig.watermark_size ?? 56

  /* ---------- 渲染 ---------- */

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* 画布顶部信息条 */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
        <span className="text-xs text-slate-500">
          共 <strong className="text-slate-800">{items.length}</strong> 题，
          总分 <strong className="text-slate-800">{items.reduce((s, it) => s + (it.score || 0), 0)}</strong> 分
        </span>
        <span className="text-xs text-slate-400">
          · 预览字号 {questionFontSize}px · {paperSize} {paperSize === "A3" ? "双列" : "单列"}
        </span>
        {/* 需求（分页预览）：分页预览模式切换按钮 */}
        <button
          onClick={() => setPaginationMode((v) => !v)}
          className={cn(
            "ml-2 flex items-center gap-1 px-2 py-0.5 text-[11px] rounded transition-colors",
            paginationMode
              ? "bg-blue-100 text-blue-700 font-medium"
              : "text-slate-500 hover:bg-slate-100",
          )}
          title={paginationMode ? "切换到单页画布" : "切换到分页预览（显示完整 A4 分页效果）"}
        >
          <FileText size={11} />
          {paginationMode ? "分页预览" : "单页画布"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {items.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm("确定清空画布？此操作不会删除题库中的题目。")) {
                  onClearCanvas()
                }
              }}
              className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1"
            >
              <Trash2 size={12} /> 清空
            </button>
          )}
        </div>
      </div>

      {/* 画布滚动区 — 始终显示纸张结构（标题/页眉/水印），仅内容区域随题目变化。
          需求 7：画布最下方展示格式范例列表（滚动到画布底部可见）
          需求 1（画布优化）：把画布与格式范例放在同一个宽度容器内，
          使两者左边缘对齐、宽度一致，格式范例的显示区域与 A4 画布的宽度相同 */}
      <div
        className="flex-1 overflow-auto p-6"
        onDragOver={handleHtml5DragOver}
        onDrop={handleHtml5Drop}
      >
        {/* 固定宽度容器：让画布与下方格式范例严格左对齐、宽度一致 */}
        <div
          className="flex flex-col items-center gap-4 min-h-full"
          style={{ width: "100%" }}
        >
          {/* 内部容器宽度 = 画布显示宽度，让画布和格式范例左边缘对齐 */}
          <div
            className="flex flex-col gap-4"
            style={{ width: `${displayWidth}px` }}
          >
          {/* 需求（分页预览）：开启时 = 多页分页预览；关闭时 = 单页 PaperPreview
              单页模式仍支持拖拽排序、分页调整、图层拖动等所有交互
              分页预览模式提供完整分页效果，便于预览导出 PDF 的真实效果 */}
          {paginationMode ? (
            <PaginationPreview
              paperSize={paperSize}
              pageConfig={pageConfig}
              homework={homework}
              items={items.map((it) => ({ hqId: it.hqId, question: it.question, score: it.score, blankLines: it.blankLines }))}
              fontSizes={{
                title: titleFontSize,
                info: infoFontSize,
                question: questionFontSize,
                header: headerFontSize,
                footer: footerFontSize,
                watermark: watermarkSize,
              }}
              scale={scale}
              previewWidth={displayWidth}
              previewMinHeight={displayHeight}
            />
          ) : paperSize === "A3" ? (
            <PaperPreview
              paperSize="A3"
              pageConfig={pageConfig}
              homework={homework}
              fontSizes={{
                title: titleFontSize,
                info: infoFontSize,
                question: questionFontSize,
                header: headerFontSize,
                footer: footerFontSize,
                watermark: watermarkSize,
              }}
              scale={scale}
              displayWidth={displayWidth}
              displayHeight={displayHeight}
              onFieldChange={onFieldChange}
            >
              {items.length === 0 ? (
                <CanvasEmptyHint paperSize="A3" />
              ) : (
                <A3TwoColumnLayout
                  items={items}
                  dropHintIndex={dropHintIndex}
                  selectedHqId={selectedHqId}
                  onSelect={setSelectedHqId}
                  onDelete={onDelete}
                  onScoreChange={onScoreChange}
                  onAddBlankLine={onAddBlankLine}
                  onRemoveBlankLine={onRemoveBlankLine}
                  questionFontSize={questionFontSize}
                />
              )}
            </PaperPreview>
          ) : (
            <PaperPreview
              paperSize="A4"
              pageConfig={pageConfig}
              homework={homework}
              fontSizes={{
                title: titleFontSize,
                info: infoFontSize,
                question: questionFontSize,
                header: headerFontSize,
                footer: footerFontSize,
                watermark: watermarkSize,
              }}
              scale={scale}
              displayWidth={displayWidth}
              displayHeight={displayHeight}
              onFieldChange={onFieldChange}
            >
              {items.length === 0 ? (
                <CanvasEmptyHint paperSize="A4" />
              ) : (
                <div className="px-2">
                  {items.map((it, idx) => (
                    <SortableCanvasItem
                      key={it.hqId}
                      index={idx}
                      hqId={it.hqId}
                      question={it.question}
                      score={it.score}
                      fontSize={questionFontSize}
                      scale={scale}
                      blankLines={it.blankLines}
                      selected={selectedHqId === it.hqId}
                      onSelect={() => setSelectedHqId(it.hqId)}
                      onDelete={() => onDelete(it.hqId)}
                      onScoreChange={(s) => onScoreChange(it.hqId, s)}
                      onAddBlankLine={() => onAddBlankLine(it.hqId)}
                      onRemoveBlankLine={() => onRemoveBlankLine(it.hqId)}
                    />
                  ))}
                </div>
              )}
            </PaperPreview>
          )}

          {/* 需求 7：格式范例列表 — 位于画布最下方，纸张之外独立显示
              需求 1（画布优化）：宽度与画布纸张保持一致，左边缘与画布对齐 */}
          <div className="mt-2">
            <TemplateStrip
              templates={templates}
              show={showTemplates}
              onToggleShow={onToggleTemplates}
              onApply={onApplyTemplate}
              onDelete={onDeleteTemplate}
            />
          </div>
          </div>
        </div>
        {/* 拖拽逻辑：仅在有题目时才包裹 DndContext（避免空状态下的拖拽噪音） */}
        {items.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={items.map((it) => it.hqId)}
              strategy={verticalListSortingStrategy}
            >
              <div style={{ display: "none" }} aria-hidden />
            </SortableContext>
            <DragOverlay>
              {activeId ? (
                <div className="opacity-80 shadow-2xl rounded-md">
                  {(() => {
                    const it = items.find((i) => i.hqId === activeId)
                    if (!it) return null
                    return (
                      <div className="px-3 py-2 bg-white border border-blue-400 rounded-md text-xs">
                        <div className="flex items-center gap-1.5">
                          <GripVertical size={12} />
                          <span className="font-semibold text-slate-600">第 {items.indexOf(it) + 1} 题</span>
                          <span className="text-slate-400 truncate">{buildPreview(it.question.stem, 30)}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  )
}

/* ========== 画布空状态提示 ========== */

/**
 * 画布空状态提示组件
 *
 * 功能：当画布中没有题目时，在 PaperPreview 内部居中显示提示
 *       引导用户从左侧题库点击或拖拽添加题目
 * 输入参数：paperSize - 当前纸张格式 "A3" | "A4"，影响提示文字
 * 返回值：提示节点
 * 使用场景：HomeworkComposePage 中间画布无题目时
 */
function CanvasEmptyHint({ paperSize }: { paperSize: "A3" | "A4" }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 select-none">
      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
        <FileText size={28} className="text-blue-400" />
      </div>
      <div className="text-base font-semibold text-slate-700 mb-1.5">
        画布暂无题目
      </div>
      <div className="text-xs text-slate-500 leading-relaxed max-w-[300px]">
        从左侧「题库」列表中<strong className="text-blue-600 mx-0.5">点击题目</strong>添加，或<strong className="text-blue-600 mx-0.5">拖拽</strong>到此处插入。
        <br />
        当前纸张：{paperSize} {paperSize === "A3" ? "双列" : "单列"}，可在右侧"纸张格式"切换。
      </div>
    </div>
  )
}


/* ========== 右侧：格式设置面板 ========== */

/**
 * 右侧格式设置面板
 *
 * 功能：完整的试卷格式设置：纸张、页眉、LOGO、标题、学科年级、
 *       页脚、姓名班级、水印、题目正文字号
 * 输入参数：homework、page_config、字段变更回调
 * 返回值：面板节点
 */
function FormatPanel({
  homework,
  pageConfig,
  onFieldChange,
  onLogoUpload,
  selectedLayerId,
  onSelectLayer,
}: {
  homework: Homework
  pageConfig: HomeworkPageConfig
  onFieldChange: (field: keyof Homework | "page_config_field", value: unknown) => void
  onLogoUpload: (file: File) => void
  /** 当前选中的图层（与画布联动） */
  selectedLayerId?: LayerId | null
  /** 选中图层回调 */
  onSelectLayer?: (id: LayerId | null) => void
}) {
  // 需求 5：格式设置各分组默认全部折叠（用户点击展开），减少首屏噪音
  // 需求 4：纸张格式已移至顶部工具栏，此处不再展示
  // 需求（画布优化）：页脚分组已移除，不再保留 openFooter 状态
  // 需求（图层）：图层分组默认展开，因为它是 Photoshop 式交互的核心入口
  const [openHeader, setOpenHeader] = useState(false)
  const [openWatermark, setOpenWatermark] = useState(false)
  const [openFont, setOpenFont] = useState(false)
  const [openLayers, setOpenLayers] = useState(true)

  /**
   * 图层操作统一处理入口
   * 功能：调用 applyLayerAction 算出新 pageConfig，再走原有 onFieldChange 链路
   * 输入参数：action - 图层操作描述
   * 返回值：无
   */
  const handleLayerAction = useCallback(
    (action: LayerAction) => {
      const newConfig = applyLayerAction(pageConfig, action)
      // 找出与原 config 不同的字段，逐个 emit onFieldChange（避免覆盖其它字段）
      for (const k of Object.keys(newConfig) as (keyof HomeworkPageConfig)[]) {
        if (JSON.stringify(newConfig[k]) !== JSON.stringify(pageConfig[k])) {
          onFieldChange("page_config_field", { key: k, value: newConfig[k] })
        }
      }
    },
    [pageConfig, onFieldChange],
  )

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 标题 */}
      <div className="p-3 border-b border-slate-200 flex items-center gap-1.5 text-sm font-semibold text-slate-700 shrink-0">
        <Settings2 size={14} />
        格式设置
      </div>

      {/* 试卷标题与学科年级 */}
      <div className="p-3 border-b border-slate-200 space-y-2">
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">试卷标题</label>
          <input
            type="text"
            value={homework.title}
            onChange={(e) => onFieldChange("title", e.target.value)}
            placeholder="输入试卷标题"
            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">学科</label>
            <input
              type="text"
              value={homework.subject || ""}
              onChange={(e) => onFieldChange("subject", e.target.value)}
              placeholder="如：数学"
              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-1">年级</label>
            <input
              type="text"
              value={homework.grade || ""}
              onChange={(e) => onFieldChange("grade", e.target.value)}
              placeholder="如：六年级"
              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        {/* 需求（图层化）：原"标题位置偏移"滑块已移除 — 标题现在是独立可拖拽图层，
            在画布上自由拖动即可调整位置，无需单独的滑块控件。 */}
      </div>

      {/* 需求 4：纸张格式已从右栏移走，放在顶部工具栏（试卷标题右侧） */}

      {/* 页眉设置 */}
      <div className="border-b border-slate-200">
        <button
          onClick={() => setOpenHeader((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {openHeader ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Type size={12} />
          页眉 / LOGO
        </button>
        {openHeader && (
          <div className="px-3 pb-3 space-y-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">页眉文字</label>
              <input
                type="text"
                value={pageConfig.header_text || ""}
                onChange={(e) => onFieldChange("page_config_field", { key: "header_text", value: e.target.value })}
                placeholder="如：XX 学校 2024 学年期末考试"
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">页眉字号 {pageConfig.header_font_size ?? 10}px</label>
              <input
                type="range"
                min={8}
                max={16}
                value={pageConfig.header_font_size ?? 10}
                onChange={(e) => onFieldChange("page_config_field", { key: "header_font_size", value: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">LOGO 图片</label>
              <label className="flex items-center gap-2 px-2.5 py-1.5 border border-dashed border-slate-300 rounded-md cursor-pointer hover:border-blue-400 hover:bg-blue-50/30">
                {pageConfig.logo_url ? (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <img
                      src={pageConfig.logo_url}
                      alt="logo"
                      className="h-6 w-auto object-contain shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                    />
                    <span className="text-[11px] text-slate-500 truncate flex-1">已上传</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        onFieldChange("page_config_field", { key: "logo_url", value: "" })
                      }}
                      className="text-slate-400 hover:text-red-500 shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload size={14} className="text-slate-400" />
                    <span className="text-[11px] text-slate-500">点击上传 LOGO（PNG / JPG）</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) onLogoUpload(f)
                      }}
                    />
                  </>
                )}
              </label>
              {pageConfig.logo_url && (
                <div className="mt-1.5">
                  <label className="block text-[11px] text-slate-500 mb-1">宽度 {pageConfig.logo_width ?? 18}mm</label>
                  <input
                    type="range"
                    min={8}
                    max={50}
                    value={pageConfig.logo_width ?? 18}
                    onChange={(e) => onFieldChange("page_config_field", { key: "logo_width", value: Number(e.target.value) })}
                    className="w-full accent-blue-600"
                  />
                </div>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={pageConfig.show_subject_grade ?? true}
                onChange={(e) => onFieldChange("page_config_field", { key: "show_subject_grade", value: e.target.checked })}
                className="accent-blue-600"
              />
              页眉右侧显示学科 / 年级
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
              <input
                type="checkbox"
                checked={pageConfig.show_name_class ?? true}
                onChange={(e) => onFieldChange("page_config_field", { key: "show_name_class", value: e.target.checked })}
                className="accent-blue-600"
              />
              标题下显示"姓名 / 班级 / 得分"
            </label>
          </div>
        )}
      </div>

      {/* 页脚设置 — 需求（画布优化）：已移除页脚分组，不再提供页脚相关配置 */}

      {/* 需求（图层）：Photoshop 式图层面板
         - 列出所有图层（页眉/Logo/水印/标题）
         - 支持显示/隐藏、锁定/解锁、置顶/置底、上移/下移、重置位置
         - 选中与画布联动 */}
      <div className="border-b border-slate-200">
        <button
          onClick={() => setOpenLayers((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {openLayers ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          图层管理（Photoshop 式）
        </button>
        {openLayers && (
          <div className="px-3 pb-3">
            <LayerPanel
              pageConfig={pageConfig}
              onLayerAction={handleLayerAction}
              selectedLayerId={selectedLayerId ?? null}
              onSelectLayer={onSelectLayer}
            />
          </div>
        )}
      </div>

      {/* 水印设置 */}
      <div className="border-b border-slate-200">
        <button
          onClick={() => setOpenWatermark((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {openWatermark ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <ImageIcon size={12} />
          水印
        </button>
        {openWatermark && (
          <div className="px-3 pb-3 space-y-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">水印文字</label>
              <input
                type="text"
                value={pageConfig.watermark_text || ""}
                onChange={(e) => onFieldChange("page_config_field", { key: "watermark_text", value: e.target.value })}
                placeholder="如：内部资料 禁止外传"
                className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">水印字号 {pageConfig.watermark_size ?? 56}px</label>
              <input
                type="range"
                min={20}
                max={120}
                value={pageConfig.watermark_size ?? 56}
                onChange={(e) => onFieldChange("page_config_field", { key: "watermark_size", value: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">透明度 {Math.round((pageConfig.watermark_opacity ?? 0.08) * 100)}%</label>
              <input
                type="range"
                min={1}
                max={50}
                value={Math.round((pageConfig.watermark_opacity ?? 0.08) * 100)}
                onChange={(e) => onFieldChange("page_config_field", { key: "watermark_opacity", value: Number(e.target.value) / 100 })}
                className="w-full accent-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">旋转角度 {pageConfig.watermark_angle ?? -30}°</label>
              <input
                type="range"
                min={-90}
                max={90}
                value={pageConfig.watermark_angle ?? -30}
                onChange={(e) => onFieldChange("page_config_field", { key: "watermark_angle", value: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>
          </div>
        )}
      </div>

      {/* 字体大小 */}
      <div className="border-b border-slate-200">
        <button
          onClick={() => setOpenFont((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {openFont ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Type size={12} />
          字体大小
        </button>
        {openFont && (
          <div className="px-3 pb-3 space-y-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">题目正文 {pageConfig.question_font_size ?? 11}px</label>
              <input
                type="range"
                min={9}
                max={16}
                value={pageConfig.question_font_size ?? 11}
                onChange={(e) => onFieldChange("page_config_field", { key: "question_font_size", value: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">试卷标题 {pageConfig.title_font_size ?? 20}px</label>
              <input
                type="range"
                min={14}
                max={32}
                value={pageConfig.title_font_size ?? 20}
                onChange={(e) => onFieldChange("page_config_field", { key: "title_font_size", value: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">信息栏 {pageConfig.info_font_size ?? 10}px</label>
              <input
                type="range"
                min={8}
                max={14}
                value={pageConfig.info_font_size ?? 10}
                onChange={(e) => onFieldChange("page_config_field", { key: "info_font_size", value: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </div>
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="p-3 text-[11px] text-slate-400 leading-relaxed">
        所有格式设置实时预览，导出 PDF 时严格应用。纸张格式变更后画布自动重排（A4 单列 / A3 双列）。
      </div>
    </div>
  )
}

/* ========== 主页面：HomeworkComposePage ========== */

export default function HomeworkComposePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  /* ---------- 核心状态 ---------- */

  // 当前作业（null 表示未加载）
  const [homework, setHomework] = useState<Homework | null>(null)
  // 画布中的题目（合并 HomeworkQuestionItem + Question 详情 + 留白行数）
  const [canvasItems, setCanvasItems] = useState<{ hqId: string; question: Question; score: number; sortOrder: number; blankLines: number }[]>([])
  // 题目详情缓存
  const [questionMap, setQuestionMap] = useState<Record<string, Question>>({})
  // 加载 / 保存状态
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  // 自动保存计时器
  const saveTimer = useRef<number | null>(null)
  // 当前作业 ID（new 时为空）
  const [homeworkId, setHomeworkId] = useState<string | null>(id && id !== "new" ? id : null)
  // 纸张格式选择弹窗（仅新建时显示，懒初始化避免 effect 内 setState）
  const [showPaperPicker, setShowPaperPicker] = useState(() => id === "new" || !id)
  // 画布题目的最新引用（用 ref 避免 handleAddQuestion 频繁重建）
  // 解决：连点两次题目时两次 handleAddQuestion 看到的 canvasItems 都是旧值，导致重复添加
  const canvasItemsRef = useRef<typeof canvasItems>([])
  // 需求 3：page_config 的最新引用，给下增一行等回调读取最新 blank_lines，避免闭包到旧值
  const canvasPageConfigRef = useRef<HomeworkPageConfig | null>(null)
  // 正在添加的题目 ID 集合（in-flight 状态，防御并发的重复点击）
  const addingIdsRef = useRef<Set<string>>(new Set())
  // 试卷范例列表（阶段6：范例功能）
  const [templates, setTemplates] = useState<PaperTemplate[]>([])
  // 范例列表的显示/隐藏（需求 7：默认展开，让用户进入组卷页就能看到画布下方的范例）
  const [showTemplates, setShowTemplates] = useState(true)
  // "保存为范例"弹窗
  const [showTemplateSaveDialog, setShowTemplateSaveDialog] = useState(false)
  const [templateSaveName, setTemplateSaveName] = useState("")
  // 需求（图层）：当前选中的图层（与画布右栏图层面板联动）
  // 选中后画布中对应元素显示蓝色边框，图层列表高亮
  const [selectedLayerId, setSelectedLayerId] = useState<LayerId | null>(null)

  /* ---------- 数据加载（必须在 useEffect 之前定义） ---------- */

  /**
   * 批量加载 homework 中所有题目的详情
   * 输入参数：items - homework 中的 HomeworkQuestionItem 列表
   * 返回值：questionId → Question 映射
   */
  const loadQuestionsDetail = useCallback(async (items: HomeworkQuestionItem[]): Promise<Record<string, Question>> => {
    const ids = Array.from(new Set(items.map((i) => i.question_id)))
    if (ids.length === 0) return {}
    // 后端没有按 ID 批量查的接口，逐个查（实际接口支持 get by id）
    const results: Record<string, Question> = {}
    await Promise.all(
      ids.map(async (qid) => {
        try {
          const res = await client.get<Question>(`/api/questions/${qid}`)
          results[qid] = res.data
        } catch (err) {
          console.warn("加载题目失败:", qid, err)
        }
      }),
    )
    return results
  }, [])

  /** 加载已存在的作业 */
  const loadExisting = useCallback(async (targetId: string) => {
    setLoading(true)
    try {
      const hw = await getHomework(targetId)
      setHomework(hw)
      setHomeworkId(hw.id)
      // 加载题目详情（单个题目失败不影响其他题目）
      const questions = await loadQuestionsDetail(hw.questions)
      // 从 page_config 读出每题的留白行数（key: hq_id）
      const blankLinesMap = (hw.page_config as { blank_lines?: Record<string, number> } | null)?.blank_lines || {}
      setCanvasItems(mergeQuestions(hw.questions, questions, blankLinesMap))
    } catch (err) {
      // 强化：失败时不再直接跳 /homework，避免「页面丢失」
      // 1) 提示明确错误
      // 2) 让用户选择「返回列表」（toast action）
      console.error("加载作业失败:", err)
      toast.error("加载作业失败，请重试或返回列表", {
        action: {
          label: "返回列表",
          onClick: () => navigate("/homework"),
        },
      })
    } finally {
      setLoading(false)
    }
  }, [navigate, loadQuestionsDetail])

  /* ---------- 范例（阶段6）---------- */

  /**
   * 加载当前用户的范例列表
   * 输入参数：无
   * 返回值：无
   * 使用场景：进入组卷工作台、刷新列表时
   */
  const loadTemplates = useCallback(async () => {
    try {
      const res = await getPaperTemplates()
      setTemplates(res.templates || [])
    } catch (err) {
      console.error("加载范例失败:", err)
    }
  }, [])

  /**
   * 把当前作业的格式信息保存为命名范例
   * 输入参数：name - 范例名称
   * 返回值：无
   * 关键点：仅保存 page_config，不保存任何题目内容
   */
  const handleSaveAsTemplate = useCallback(async (name: string) => {
    if (!homework) {
      toast.error("作业未加载，无法保存范例")
      return
    }
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("请输入范例名称")
      return
    }
    try {
      const created = await createPaperTemplate({
        name: trimmed,
        page_config: (homework.page_config as Record<string, unknown>) || {},
      })
      setTemplates((prev) => [created, ...prev])
      toast.success("已保存为范例", { description: trimmed })
      setShowTemplateSaveDialog(false)
      setTemplateSaveName("")
    } catch (err) {
      console.error("保存范例失败:", err)
      toast.error("保存范例失败")
    }
  }, [homework])

  /**
   * 删除指定范例
   * 输入参数：templateId - 范例 ID
   * 返回值：无
   * 使用场景：范例列表中的"删除"按钮
   */
  const handleDeleteTemplate = useCallback(async (templateId: string) => {
    if (!window.confirm("确定删除该范例？此操作不可撤销。")) return
    try {
      await deletePaperTemplate(templateId)
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      toast.success("范例已删除")
    } catch (err) {
      console.error("删除范例失败:", err)
      toast.error("删除范例失败")
    }
  }, [])

  /**
   * 把范例的格式信息一键导入到当前作业
   * 输入参数：templateId - 范例 ID
   * 返回值：无
   * 关键点：只更新 page_config，**不影响**当前作业的题目
   */
  const handleApplyTemplate = useCallback(async (templateId: string) => {
    if (!homeworkId) {
      toast.error("作业未加载，无法应用范例")
      return
    }
    try {
      await applyPaperTemplate(templateId, homeworkId)
      // 重新拉取 homework 以更新本地 page_config
      const hw = await getHomework(homeworkId)
      setHomework(hw)
      toast.success("已应用范例到当前作业")
    } catch (err) {
      console.error("应用范例失败:", err)
      toast.error("应用范例失败")
    }
  }, [homeworkId])

  /* ---------- 初始化作业：URL 含具体 ID 时自动加载 ---------- */

  // 依赖项加入 id：路由参数变化时重新加载作业，避免出现"A 的画布显示 B 的数据"
  // 卸载时清理自动保存计时器，避免组件已卸载仍触发 setState
  useEffect(() => {
    // 加载范例列表（任何路由下都要加载，下方列表展示用）
    queueMicrotask(() => {
      void loadTemplates()
    })
    if (id && id !== "new") {
      // 异步包装避免 lint 误报
      queueMicrotask(() => {
        void loadExisting(id)
      })
    }
    return () => {
      // 卸载时清理 pending 的自动保存计时器，防止卸载后 setState
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  /* ---------- 切换纸张格式弹窗回调 ---------- */

  const handlePickPaperSize = useCallback(async (paperSize: "A3" | "A4") => {
    setShowPaperPicker(false)
    try {
      const hw = await createHomework({
        title: "",
        page_config: { ...DEFAULT_PAGE_CONFIG, paper_size: paperSize },
      })
      setHomework(hw)
      setHomeworkId(hw.id)
      setLoading(false)
      // 替换 URL，保留返回/前进能力
      window.history.replaceState(null, "", `/homework/${hw.id}/compose`)
    } catch (err) {
      console.error("创建作业失败:", err)
      toast.error("创建作业失败")
    }
  }, [])

  /* ---------- 字段变更 → 触发自动保存 ---------- */

  /**
   * 保存当前作业到后端
   * 输入参数：silent - true 时不显示 toast
   * 返回值：无
   */
  const handleSave = useCallback(async (silent = false) => {
    if (!homeworkId || !homework) return
    setSaving(true)
    try {
      await updateHomework(homeworkId, {
        title: homework.title,
        subject: homework.subject,
        grade: homework.grade,
        page_config: homework.page_config,
      })
      if (!silent) toast.success("已保存")
    } catch (err) {
      console.error("保存失败:", err)
      if (!silent) toast.error("保存失败")
    } finally {
      setSaving(false)
    }
  }, [homeworkId, homework])

  /**
   * 字段变更统一入口：同时更新本地 state + 触发防抖自动保存
   * 输入参数：field - 顶层字段名 或 "page_config_field"（嵌套）；value - 新值
   * 返回值：无
   */
  const handleFieldChange = useCallback(
    (field: keyof Homework | "page_config_field", value: unknown) => {
      setHomework((prev) => {
        if (!prev) return prev
        if (field === "page_config_field") {
          const { key, value: v } = value as { key: keyof HomeworkPageConfig; value: unknown }
          const newCfg = { ...(prev.page_config || {}), [key]: v }
          return { ...prev, page_config: newCfg as HomeworkPageConfig }
        }
        return { ...prev, [field]: value }
      })
      // 触发防抖自动保存
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        void handleSave(true)
      }, 800)
    },
    [handleSave],
  )

  /** 切换纸张格式（立刻切换画布布局 + 自动保存） */
  const handlePaperSizeChange = useCallback((size: "A3" | "A4") => {
    handleFieldChange("page_config_field", { key: "paper_size", value: size })
  }, [handleFieldChange])

  /* ---------- 题目增删改 ---------- */

  /** 添加题目到画布（点击或拖拽触发）
   *
   * 关键修复点：
   *  1. 用 addingIdsRef（Set）做 in-flight 跟踪，连点同一题第二次时直接拦截，
   *     避免两次 addHomeworkQuestion 竞争导致后端重复落库
   *  2. 用 canvasItemsRef 读取最新画布状态，不再把 canvasItems 列入 useCallback 依赖，
   *     避免 onAdd 引用随画布变化而频繁变化
   *  3. 从 updated.questions 反查匹配 question.id 的 hq，不再用末尾元素（防止后端
   *     排序差异或并发写入导致 hqId 取错）
   *  4. 入参只接受 question 对象，不接受 questionId 字符串，让调用方语义更清晰
   */
  const handleAddQuestion = useCallback(async (question: Question) => {
    if (!homeworkId) {
      toast.error("请先选择纸张格式")
      return
    }
    if (!question?.id) {
      console.warn("handleAddQuestion: question 为空或无 id")
      return
    }
    // 1. 防止重复添加：已存在或正在添加中
    if (canvasItemsRef.current.some((it) => it.question.id === question.id)) {
      toast.info("该题已在画布中")
      return
    }
    if (addingIdsRef.current.has(question.id)) {
      return // 静默忽略：正在添加中
    }
    addingIdsRef.current.add(question.id)
    try {
      const updated = await addHomeworkQuestion(homeworkId, question.id, 5)
      setHomework(updated)
      setQuestionMap((prev) => ({ ...prev, [question.id]: question }))
      // 2. 从 updated 中找到本次新增的 hq：用 question_id 匹配
      const newHq = (updated.questions || []).find((it) => it.question_id === question.id)
      if (!newHq) {
        // 后端未返回新题（理论上不应该），刷新整页
        console.warn("添加题目后端未返回新题明细")
        return
      }
      setCanvasItems((prev) => [
        ...prev,
        { hqId: newHq.id, question, score: newHq.score, sortOrder: newHq.sort_order, blankLines: 0 },
      ])
      toast.success("已添加到画布", { duration: 1000 })
    } catch (err) {
      console.error("添加题目失败:", err)
      toast.error("添加题目失败")
    } finally {
      addingIdsRef.current.delete(question.id)
    }
  }, [homeworkId])

  /** 拖拽接收（HTML5 外部）
   *
   * 注意：拖拽添加也走 handleAddQuestion，自动复用 in-flight 防御与 hqId 反查逻辑
   */
  const handleDropQuestion = useCallback((questionId: string) => {
    if (questionMap[questionId]) {
      void handleAddQuestion(questionMap[questionId])
    }
  }, [questionMap, handleAddQuestion])

  /** 删除题目 */
  const handleDeleteQuestion = useCallback(async (hqId: string) => {
    if (!homeworkId) return
    try {
      await removeHomeworkQuestion(homeworkId, hqId)
      setCanvasItems((prev) => prev.filter((it) => it.hqId !== hqId))
    } catch (err) {
      console.error("删除题目失败:", err)
      toast.error("删除题目失败")
    }
  }, [homeworkId])

  /** 改分值 */
  const handleScoreChange = useCallback(async (hqId: string, score: number) => {
    if (!homeworkId) return
    // 乐观更新
    setCanvasItems((prev) => prev.map((it) => it.hqId === hqId ? { ...it, score } : it))
    try {
      await setHomeworkQuestionScore(homeworkId, hqId, score)
    } catch (err) {
      console.error("改分失败:", err)
      toast.error("改分失败")
    }
  }, [homeworkId])

  /* ---------- 需求 3：下增一行 / 减少一行（持久化到 page_config.blank_lines） ---------- */

  /**
   * 把指定题目的新留白行数同步到 page_config.blank_lines
   * 功能：在 setCanvasItems 之后调用，从 canvasItemsRef 读取最新值
   *       （canvasItemsRef 在 useEffect 中同步，因此 queueMicrotask 后必然已更新）
   * 输入参数：无
   * 返回值：无
   */
  const syncBlankLinesToConfig = useCallback(() => {
    const cur = canvasItemsRef.current
    const blankMap: Record<string, number> = {}
    for (const it of cur) {
      if (it.blankLines > 0) blankMap[it.hqId] = it.blankLines
    }
    handleFieldChange("page_config_field", {
      key: "blank_lines" as keyof HomeworkPageConfig,
      value: blankMap,
    })
  }, [handleFieldChange])

  /**
   * 增加指定题目的留白行数
   * 输入参数：hqId - 作业-题目关联 ID
   * 返回值：无
   * 使用场景：画布中点击题目 → 选中 → 点击「+ 下增一行」按钮
   * 实现：先更新 canvasItems，再通过 microtask 在 canvasItemsRef 同步后写入 page_config
   */
  const handleAddBlankLine = useCallback((hqId: string) => {
    setCanvasItems((prev) =>
      prev.map((it) => (it.hqId === hqId ? { ...it, blankLines: it.blankLines + 1 } : it)),
    )
    queueMicrotask(syncBlankLinesToConfig)
  }, [syncBlankLinesToConfig])

  /**
   * 减少指定题目的留白行数（不会小于 0）
   * 输入参数：hqId
   * 返回值：无
   * 使用场景：「− 减少一行」按钮
   */
  const handleRemoveBlankLine = useCallback((hqId: string) => {
    setCanvasItems((prev) =>
      prev.map((it) => (it.hqId === hqId ? { ...it, blankLines: Math.max(0, it.blankLines - 1) } : it)),
    )
    queueMicrotask(syncBlankLinesToConfig)
  }, [syncBlankLinesToConfig])

  /** 重排序（拖拽完成） */
  const handleReorder = useCallback(async (newItems: typeof canvasItems) => {
    setCanvasItems(newItems)
    if (!homeworkId) return
    try {
      await updateHomeworkQuestions(homeworkId, newItems.map((it) => it.hqId))
    } catch (err) {
      console.error("排序失败:", err)
      toast.error("排序失败")
    }
  }, [homeworkId])

  /** 清空画布 */
  const handleClearCanvas = useCallback(async () => {
    if (!homeworkId) return
    for (const it of [...canvasItems]) {
      try {
        await removeHomeworkQuestion(homeworkId, it.hqId)
      } catch (err) {
        console.error("清空失败:", err)
      }
    }
    setCanvasItems([])
    toast.success("画布已清空")
  }, [homeworkId, canvasItems])

  /* ---------- LOGO 上传 ---------- */

  const handleLogoUpload = useCallback(async (file: File) => {
    if (!homeworkId) return
    const form = new FormData()
    form.append("file", file)
    form.append("category", "logo")
    try {
      const res = await client.post<{ url: string; filename: string; path: string }>("/api/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      handleFieldChange("page_config_field", { key: "logo_url", value: res.data.url })
      toast.success("LOGO 上传成功")
    } catch (err) {
      console.error("LOGO 上传失败:", err)
      toast.error("LOGO 上传失败")
    }
  }, [homeworkId, handleFieldChange])

  /* ---------- 导出 PDF（所见即所得） ---------- */

  // 当前纸张大小（必须在 handleExportPDF 之前声明，避免 TDZ 错误）
  const paperSize: "A3" | "A4" = homework?.page_config?.paper_size || "A4"
  // 画布缩放因子（与 A3TwoColumnLayout 中的 scale 保持一致）
  const scale = paperSize === "A3" ? 0.6 : 0.78

  const handleExportPDF = useCallback(async () => {
    if (!homeworkId) return
    setExporting(true)
    try {
      // 先保存再导出，确保最新配置生效
      await handleSave(true)

      // 查找所有标记为 pdf-export-target 的 DOM 元素
      // PaperPreview：单页模式，一个元素
      // PaginationPreview：多页模式，每个页面一个元素
      const targets = document.querySelectorAll<HTMLElement>("[data-pdf-export-target]")
      if (targets.length === 0) {
        toast.error("未找到可导出的画布内容")
        return
      }

      // 自动检测画布缩放模式：
      // PaperPreview 使用 CSS transform: scale()，需要传实际 scale 值
      // PaginationPreview 不使用 CSS transform，传 1
      // 通过检测第一个元素的 transform 样式来判断
      let effectiveScale = scale
      const firstTarget = targets[0]
      const computedTransform = window.getComputedStyle(firstTarget).transform
      if (computedTransform && computedTransform !== "none") {
        // 元素有 CSS transform，属于 PaperPreview 模式，使用实际 scale
        effectiveScale = scale
      } else {
        // 元素没有 CSS transform，属于 PaginationPreview 模式，传 1
        effectiveScale = 1
      }

      await exportCanvasToPdf(
        Array.from(targets),
        paperSize,
        effectiveScale,
        homework?.title || "试卷",
      )
      toast.success("PDF 已生成并下载")
    } catch (err) {
      console.error("导出 PDF 失败:", err)
      toast.error("导出 PDF 失败")
    } finally {
      setExporting(false)
    }
  }, [homeworkId, handleSave, homework, paperSize, scale])

  /* ---------- 派生 ---------- */

  // 同步 canvasItems 到 ref，供 handleAddQuestion / handleDropQuestion 读取最新值
  // 避免 useCallback 把 canvasItems 加进依赖导致 onAdd 引用频繁变化
  useEffect(() => {
    canvasItemsRef.current = canvasItems
  }, [canvasItems])

  // 当前选中的题目 ID 集合
  const selectedIds = useMemo(() => new Set(canvasItems.map((it) => it.question.id)), [canvasItems])
  // 页面配置（用 useMemo 稳定引用，避免 useEffect 依赖项每次 render 变化）
  const pageConfig: HomeworkPageConfig = useMemo(
    () => ({ ...DEFAULT_PAGE_CONFIG, ...(homework?.page_config || {}) }),
    [homework?.page_config],
  )

  // 同步 pageConfig 到 ref，给下增一行 / 减少一行 等回调读取最新 blank_lines
  useEffect(() => {
    canvasPageConfigRef.current = pageConfig
  }, [pageConfig])

  /* ---------- 渲染：纸张选择弹窗 ---------- */

  if (showPaperPicker) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 h-12 flex items-center border-b border-slate-200 bg-white shrink-0">
          <button
            onClick={() => navigate("/homework")}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600"
          >
            <ArrowLeft size={16} />
            返回
          </button>
          <h1 className="ml-3 text-base font-semibold text-slate-800">新建组卷</h1>
        </div>
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-8 w-[480px]">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">选择试卷纸张格式</h2>
            <p className="text-sm text-slate-500 mb-5">选好格式后，画布布局将自动适配（A4 单列 / A3 双列）</p>
            <div className="space-y-3">
              {PAPER_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => handlePickPaperSize(p.value)}
                  className="w-full flex items-center gap-3 p-4 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/30 transition-colors text-left"
                >
                  <div className="w-12 h-14 border-2 border-slate-300 rounded shrink-0 flex items-center justify-center bg-slate-50"
                    style={{ aspectRatio: p.value === "A3" ? "297/420" : "210/297" }}
                  >
                    {p.value === "A3" ? (
                      <div className="flex gap-0.5 w-8 h-10">
                        <div className="flex-1 border-r border-slate-400" />
                        <div className="flex-1" />
                      </div>
                    ) : (
                      <div className="w-6 h-10" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-slate-800">{p.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{p.desc}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">尺寸：{p.size}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ---------- 渲染：主页面 ---------- */

  if (loading || !homework) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏 */}
      <div className="h-14 px-4 flex items-center gap-3 border-b border-slate-200 bg-white shrink-0">
        <button
          onClick={() => navigate("/homework")}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600"
        >
          <ArrowLeft size={16} />
          返回
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <input
          type="text"
          value={homework.title}
          onChange={(e) => handleFieldChange("title", e.target.value)}
          placeholder="输入试卷标题"
          className="text-base font-semibold text-slate-800 bg-transparent border-none focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1.5 py-0.5 min-w-[200px] max-w-[400px]"
        />
        {/* 需求 4：纸张格式选择器放在试卷标题右侧（顶部工具栏），独立紧凑分组 */}
        <div className="flex items-center gap-1 ml-2 px-1.5 py-0.5 border border-slate-200 rounded-md bg-white">
          <FileText size={13} className="text-slate-400" />
          {PAPER_OPTIONS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePaperSizeChange(p.value)}
              className={cn(
                "px-2 py-0.5 text-xs rounded transition-colors",
                paperSize === p.value
                  ? "bg-blue-600 text-white font-medium"
                  : "text-slate-600 hover:bg-slate-100",
              )}
              title={p.desc}
            >
              {p.value}
            </button>
          ))}
          <span className="text-[10px] text-slate-400 ml-1">
            {paperSize === "A3" ? "双列" : "单列"}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* 范例按钮 — 阶段6：在"保存"按钮左侧，"保存"按钮负责保存当前作业，
              "范例"按钮负责把当前作业的格式信息保存为命名范例（不含题目） */}
          <button
            onClick={() => {
              // 预填默认名：试卷标题 + " 范例"
              setTemplateSaveName(
                homework.title ? `${homework.title} 范例` : "我的格式范例",
              )
              setShowTemplateSaveDialog(true)
            }}
            disabled={!homeworkId}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
            title="把当前试卷格式（页眉/Logo/水印等）保存为命名范例，下次可一键导入"
          >
            <BookmarkPlus size={14} />
            范例
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "保存中..." : "保存"}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="flex items-center gap-1 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <FileDown size={14} />
            {exporting ? "导出中..." : "导出 PDF"}
          </button>
        </div>
      </div>

      {/* "保存为范例"弹窗 */}
      {showTemplateSaveDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={() => setShowTemplateSaveDialog(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-slate-200 w-[420px] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-800 mb-1">保存为范例</h3>
            <p className="text-xs text-slate-500 mb-3">
              仅保存当前试卷的格式信息（纸张/页眉/Logo/水印/页脚/字号等），不保存任何题目。
            </p>
            <label className="block text-[11px] text-slate-500 mb-1">范例名称</label>
            <input
              type="text"
              value={templateSaveName}
              onChange={(e) => setTemplateSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSaveAsTemplate(templateSaveName)
              }}
              autoFocus
              placeholder="如：期末考试 A4 标准版式"
              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowTemplateSaveDialog(false)
                  setTemplateSaveName("")
                }}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-md hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={() => void handleSaveAsTemplate(templateSaveName)}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 三栏主体 */}
      <div className="flex-1 grid grid-cols-[320px_1fr_340px] overflow-hidden">
        {/* 左栏：题库面板 — refreshKey 保持为 0，避免因画布变化而频繁重新拉取列表 */}
        <div className="border-r border-slate-200 bg-white overflow-hidden">
          <QuestionBankPanel
            selectedIds={selectedIds}
            onAdd={handleAddQuestion}
            refreshKey={0}
          />
        </div>

        {/* 中栏：画布（需求 7：范例列表在画布最下方） */}
        <ComposeCanvas
          homework={homework}
          items={canvasItems}
          pageConfig={pageConfig}
          paperSize={paperSize}
          onReorder={handleReorder}
          onDelete={handleDeleteQuestion}
          onScoreChange={handleScoreChange}
          onDropQuestion={handleDropQuestion}
          onClearCanvas={handleClearCanvas}
          onFieldChange={handleFieldChange}
          onAddBlankLine={handleAddBlankLine}
          onRemoveBlankLine={handleRemoveBlankLine}
          templates={templates}
          showTemplates={showTemplates}
          onToggleTemplates={() => setShowTemplates((v) => !v)}
          onApplyTemplate={handleApplyTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          selectedLayerId={selectedLayerId}
          onSelectLayer={setSelectedLayerId}
        />

        {/* 右栏：格式设置 */}
        <div className="border-l border-slate-200 bg-white overflow-hidden">
          <FormatPanel
            homework={homework}
            pageConfig={pageConfig}
            onFieldChange={handleFieldChange}
            onLogoUpload={handleLogoUpload}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
          />
        </div>
      </div>

      {/* 需求 7：格式范例列表已从页面底部移到画布最下方（ComposeCanvas 内部渲染） */}
    </div>
  )
}

/* ========== A3 双列布局组件 ========== */

/**
 * A3 双列布局组件
 *
 * 功能：将题目严格平均分配到两列（按奇偶交替，列宽相同、列内高度尽量均衡）
 *       接收拖拽放置提示并高亮对应位置
 * 输入参数：items、dropHintIndex、回调函数
 * 返回值：A3 双列布局节点
 */
function A3TwoColumnLayout({
  items,
  dropHintIndex,
  selectedHqId,
  onSelect,
  onDelete,
  onScoreChange,
  onAddBlankLine,
  onRemoveBlankLine,
  questionFontSize,
}: {
  items: { hqId: string; question: Question; score: number; sortOrder: number; blankLines: number }[]
  dropHintIndex: number | null
  selectedHqId: string | null
  onSelect: (hqId: string) => void
  onDelete: (hqId: string) => void
  onScoreChange: (hqId: string, s: number) => void
  onAddBlankLine: (hqId: string) => void
  onRemoveBlankLine: (hqId: string) => void
  questionFontSize: number
}) {
  // 局部计算缩放因子（与父组件保持一致）
  const scale = 0.6
  // 严格平均分配：按奇偶交替
  // - 第 1、3、5... 题放左列；第 2、4、6... 题放右列
  // - 列宽严格相等（flex-1），保证双列宽度相同
  // - 左列排序时优先填满，再排右列（按题号顺序：1,2,3,4 → 左1,右1,左2,右2）
  const leftItems: typeof items = []
  const rightItems: typeof items = []
  items.forEach((it, idx) => {
    if (idx % 2 === 0) {
      // 偶数索引 0,2,4... → 左列（题号 1,3,5...）
      leftItems.push(it)
    } else {
      // 奇数索引 1,3,5... → 右列（题号 2,4,6...）
      rightItems.push(it)
    }
  })

  return (
    <div className="flex gap-3">
      {/* 左列：宽度严格等于右列 */}
      <div className="flex-1 min-w-0">
        {leftItems.map((it, idx) => {
          // 左列第 idx 个，对应原题号 idx*2
          const realIdx = idx * 2
          return (
            <div key={it.hqId} className="relative">
              <SortableCanvasItem
                index={realIdx}
                hqId={it.hqId}
                question={it.question}
                score={it.score}
                fontSize={questionFontSize}
                scale={scale}
                blankLines={it.blankLines}
                selected={selectedHqId === it.hqId}
                onSelect={() => onSelect(it.hqId)}
                onDelete={() => onDelete(it.hqId)}
                onScoreChange={(s) => onScoreChange(it.hqId, s)}
                onAddBlankLine={() => onAddBlankLine(it.hqId)}
                onRemoveBlankLine={() => onRemoveBlankLine(it.hqId)}
              />
              {dropHintIndex === realIdx && (
                <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded" />
              )}
            </div>
          )
        })}
      </div>
      {/* 列间分隔线 */}
      <div className="w-px bg-slate-200 shrink-0" />
      {/* 右列：宽度严格等于左列 */}
      <div className="flex-1 min-w-0">
        {rightItems.map((it, idx) => {
          // 右列第 idx 个，对应原题号 idx*2+1
          const realIdx = idx * 2 + 1
          return (
            <div key={it.hqId} className="relative">
              <SortableCanvasItem
                index={realIdx}
                hqId={it.hqId}
                question={it.question}
                score={it.score}
                fontSize={questionFontSize}
                scale={scale}
                blankLines={it.blankLines}
                selected={selectedHqId === it.hqId}
                onSelect={() => onSelect(it.hqId)}
                onDelete={() => onDelete(it.hqId)}
                onScoreChange={(s) => onScoreChange(it.hqId, s)}
                onAddBlankLine={() => onAddBlankLine(it.hqId)}
                onRemoveBlankLine={() => onRemoveBlankLine(it.hqId)}
              />
              {dropHintIndex === realIdx && (
                <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ========== 格式范例列表条带 ========== */

/**
 * 格式范例列表条带（阶段6 + 需求 7）
 *
 * 功能：展示当前用户的格式范例
 *  - 显示/隐藏切换
 *  - 鼠标滚轮横向滚动
 *  - 单个范例的「应用 / 删除」操作
 *
 * 需求 7：默认显示在画布的最下方（滚动画布到底部可见）
 *  - variant="canvas"：画布底部样式，标题+列表带蓝色边线，与画布内容视觉融合
 *  - variant="page"：页面底部样式，标题栏+列表，与三栏网格齐平
 *
 * 输入参数：templates / show / onToggleShow / onApply / onDelete / variant
 * 返回值：列表条带节点
 */
function TemplateStrip({
  templates,
  show,
  onToggleShow,
  onApply,
  onDelete,
  variant = "canvas",
}: {
  templates: PaperTemplate[]
  show: boolean
  onToggleShow: () => void
  onApply: (templateId: string) => void
  onDelete: (templateId: string) => void
  /** 样式变体：canvas = 画布底部（默认），page = 页面底部 */
  variant?: "canvas" | "page"
}) {
  // 滚动容器 ref
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * 鼠标滚轮横向滚动
   * 功能：用户垂直滚轮时转化为列表的横向滚动
   * 输入参数：e - wheel 事件
   * 返回值：无
   */
  const handleWheel = (e: React.WheelEvent) => {
    const el = scrollRef.current
    if (!el) return
    // 仅在水平滚动有富余时接管 wheel
    if (el.scrollWidth > el.clientWidth) {
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
  }

  // 根据变体选择容器样式
  const containerClass =
    variant === "page"
      ? "border-t border-slate-200 bg-white shrink-0"
      : "border border-slate-200 rounded-lg bg-white shadow-sm shrink-0"

  return (
    <div className={containerClass}>
      {/* 标题栏：左侧标题 + 计数，右侧显示/隐藏切换 */}
      <div
        className={cn(
          "px-4 py-2 flex items-center gap-2",
          variant === "page" ? "border-b border-slate-100" : "border-b border-slate-100 rounded-t-lg bg-slate-50",
        )}
      >
        <Bookmark size={14} className="text-blue-500" />
        <span className="text-sm font-medium text-slate-700">格式范例</span>
        <span className="text-[11px] text-slate-400">· {templates.length} 个</span>
        <span className="text-[11px] text-blue-500">
          · 画布最下方
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          <span className="hidden sm:inline">鼠标滚轮可横向滚动</span>
          <button
            onClick={onToggleShow}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            title={show ? "隐藏范例列表" : "显示范例列表"}
          >
            {show ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      </div>
      {show && (
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="overflow-x-auto overflow-y-hidden px-4 py-3"
          style={{ scrollBehavior: "smooth" }}
        >
          {templates.length === 0 ? (
            <div className="text-center text-slate-400 text-xs py-6">
              暂无范例。点击工具栏「范例」按钮把当前试卷格式保存为命名范例。
            </div>
          ) : (
            <div className="flex gap-3 min-w-min">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="shrink-0 w-44 border border-slate-200 rounded-md p-2 bg-white hover:border-blue-400 transition-colors"
                >
                  {/* 范例名称 */}
                  <div
                    className="text-[12px] font-medium text-slate-800 truncate"
                    title={t.name}
                  >
                    {t.name}
                  </div>
                  {/* 范例说明（可选） */}
                  {t.description && (
                    <div
                      className="text-[10px] text-slate-400 mt-0.5 truncate"
                      title={t.description}
                    >
                      {t.description}
                    </div>
                  )}
                  {/* 格式快照：纸张 + 字体 + 是否有水印 */}
                  <div className="text-[10px] text-slate-400 mt-1.5 space-y-0.5">
                    <div>纸张：{t.page_config?.paper_size || "A4"}</div>
                    <div>字号：{t.page_config?.question_font_size ?? 11}px</div>
                    {t.page_config?.watermark_text && (
                      <div>水印：{t.page_config.watermark_text}</div>
                    )}
                  </div>
                  {/* 更新时间 */}
                  <div className="text-[10px] text-slate-300 mt-1">
                    {new Date(t.updated_at).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {/* 操作：应用 + 删除 */}
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      onClick={() => onApply(t.id)}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 text-[11px] bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                      title="把此范例的格式信息导入到当前作业"
                    >
                      <Check size={10} />
                      应用
                    </button>
                    <button
                      onClick={() => onDelete(t.id)}
                      className="p-1 text-slate-400 hover:text-red-500"
                      title="删除此范例"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
