/**
 * 作业列表页 — 微型页面卡片列表
 *
 * 功能：展示当前用户的所有作业（组卷），支持新建、搜索、单删/批删
 * 路由：/homework
 *
 * 改造点（图二需求）：
 *  1. 列表渲染：组好的卷子以微型页面卡片形式展示
 *  2. 卡片内容：复用 PaperPreview 缩放渲染（前端方案，零后端改动）
 *  3. 卡片下方：显示试卷标题名称
 *  4. 点击交互：点击卡片进入对应作业的工作台二次编辑
 *  5. 导航稳定性：阶段1已修复（MainLayout Outlet key + useEffect cleanup）
 *  6. 加载/错误兜底：API 失败时给出明确提示
 *  7. 阶段8：批量删除（右侧"批量删除"按钮 + 多选模式 + 复选框）
 */
import { useState, useEffect, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Search, Loader2, FileText, Trash2, CheckSquare, Square, X } from "lucide-react"
import {
  getHomeworks, createHomework, deleteHomework, batchDeleteHomeworks,
} from "@/api/homework"
import type { Homework, HomeworkPageConfig } from "@/types/homework"
import { toast } from "sonner"
import PaperPreview from "@/components/compose/PaperPreview"

/** 卡片缩放因子：列表中每张卡片按 ~0.16 比例缩放（视觉上的"微型"页面） */
const CARD_SCALE = 0.16

/**
 * 计算卡片预览所需尺寸
 * 输入参数：paperSize - A3 / A4
 * 返回值：{ previewWidth, previewMinHeight }
 */
function getCardSize(paperSize: "A3" | "A4") {
  const w = paperSize === "A3" ? 297 : 210
  const h = paperSize === "A3" ? 420 : 297
  return {
    previewWidth: w * CARD_SCALE * 3.78,
    previewMinHeight: h * CARD_SCALE * 3.78,
  }
}

/**
 * 微型页面卡片组件（图二需求 + 阶段8批量删除）
 *
 * 功能：渲染一个作业的"微型预览卡片"
 *  - 上半部分：复用 PaperPreview 缩放渲染（readOnly=true 禁用交互）
 *  - 下半部分：显示试卷标题、操作按钮（编辑/删除）
 *  - 点击卡片：进入对应作业的工作台（选择模式下"勾选/取消"）
 *  - 阶段8：选择模式下右上角显示复选框，选中时高亮边框
 *
 * 输入参数：homework / selectMode / selected / onToggleSelect
 * 返回值：卡片节点
 */
function HomeworkCard({
  homework,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: {
  homework: Homework
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const navigate = useNavigate()
  // 计算卡片尺寸
  const paperSize = (homework.page_config?.paper_size as "A3" | "A4") || "A4"
  const { previewWidth, previewMinHeight } = getCardSize(paperSize)
  // 派生 page_config（合并默认值）
  const pageConfig: HomeworkPageConfig = {
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
    info_font_size: 10,
    show_subject_grade: true,
    show_name_class: true,
    ...(homework.page_config || {}),
  }

  /**
   * 点击卡片：选择模式下"勾选/取消"，浏览模式下"进入工作台"
   * 输入参数：无
   * 返回值：无
   */
  const handleClick = () => {
    if (selectMode) {
      onToggleSelect?.(homework.id)
      return
    }
    navigate(`/homework/${homework.id}/compose`)
  }

  /**
   * 复选框点击：阻止冒泡，避免触发卡片 onClick
   * 输入参数：e - 鼠标事件
   * 返回值：无
   */
  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleSelect?.(homework.id)
  }

  /**
   * 删除作业（浏览模式下）
   * 输入参数：e - 鼠标事件
   * 返回值：无
   */
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation() // 阻止冒泡到卡片 onClick
    if (!window.confirm(`确定删除「${homework.title || "（未命名）"}」？此操作不可撤销。`)) return
    try {
      await deleteHomework(homework.id)
      toast.success("作业已删除")
      // 通知父组件刷新
      window.dispatchEvent(new CustomEvent("homework:deleted"))
    } catch (err) {
      console.error("删除作业失败:", err)
      toast.error("删除作业失败")
    }
  }

  return (
    <div
      onClick={handleClick}
      className={[
        "group relative bg-white border rounded-lg overflow-hidden transition-all cursor-pointer",
        selected
          ? "border-blue-500 ring-2 ring-blue-200 shadow-md"
          : "border-slate-200 hover:border-blue-400 hover:shadow-lg",
      ].join(" ")}
      title={selectMode ? (selected ? "取消选中" : "选中此作业") : "点击进入工作台"}
    >
      {/* 选择模式：右上角复选框 */}
      {selectMode && (
        <button
          onClick={handleCheckboxClick}
          className="absolute top-2 right-2 z-10 p-1 rounded bg-white/90 shadow hover:bg-white transition-colors"
          title={selected ? "取消选中" : "选中此作业"}
        >
          {selected ? (
            <CheckSquare size={18} className="text-blue-600" />
          ) : (
            <Square size={18} className="text-slate-400" />
          )}
        </button>
      )}

      {/* 上半部分：缩略预览（白底+缩放） */}
      <div
        className="flex items-center justify-center bg-slate-50 p-2"
        style={{ minHeight: `${previewMinHeight + 16}px` }}
      >
        <div
          style={{
            transform: `scale(1)`,
            transformOrigin: "center",
            // 限制外层尺寸，避免某些元素溢出影响卡片高度
            pointerEvents: "none",
          }}
        >
          <PaperPreview
            paperSize={paperSize}
            pageConfig={pageConfig}
            homework={homework}
            fontSizes={{
              title: 20,
              info: 10,
              question: 11,
              header: 10,
              footer: 9,
              watermark: 56,
            }}
            scale={CARD_SCALE}
            displayWidth={previewWidth}
            displayHeight={previewMinHeight}
            readOnly={true}
          />
        </div>
      </div>
      {/* 下半部分：标题 + 状态 + 操作 */}
      <div className="px-3 py-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <FileText size={12} className="text-slate-400 shrink-0" />
          <div
            className="text-[13px] font-medium text-slate-800 truncate flex-1"
            title={homework.title || "（未命名）"}
          >
            {homework.title || "（未命名）"}
          </div>
          {/* 浏览模式下：单条删除按钮；选择模式下隐藏 */}
          {!selectMode && (
            <button
              onClick={handleDelete}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-red-500"
              title="删除此作业"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
          <span>{homework.subject || "—"}</span>
          <span>·</span>
          <span>{homework.grade || "—"}</span>
          <span>·</span>
          <span>{homework.questions?.length || 0} 题</span>
          <span
            className={
              homework.status === "published"
                ? "ml-auto px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 text-[10px]"
                : "ml-auto px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 text-[10px]"
            }
          >
            {homework.status === "published" ? "已发布" : "草稿"}
          </span>
        </div>
      </div>
    </div>
  )
}

export default function HomeworkListPage() {
  // 路由跳转
  const navigate = useNavigate()
  // 搜索关键词
  const [keyword, setKeyword] = useState("")
  // 作业列表
  const [homeworks, setHomeworks] = useState<Homework[]>([])
  // 总数
  const [total, setTotal] = useState(0)
  // 加载状态
  const [loading, setLoading] = useState(false)
  // 新建作业 loading
  const [creating, setCreating] = useState(false)
  // 阶段8：批量选择模式
  const [selectMode, setSelectMode] = useState(false)
  // 阶段8：选中的作业 id 集合
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // 阶段8：批量删除中
  const [batchDeleting, setBatchDeleting] = useState(false)

  /**
   * 加载作业列表
   *
   * 功能：调用后端接口拉取当前用户所有作业
   * 输入参数：无
   * 返回值：无
   * 修复点：增加加载/错误兜底，API 失败时不留空白页
   */
  const loadHomeworks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getHomeworks({ page: 1, page_size: 50 })  // 后端 list_homework 上限 50
      setHomeworks(res.homework || [])
      setTotal(res.total || 0)
    } catch (err) {
      // 兜底：API 失败时给出明确错误信息，避免"页面空白"
      console.error("加载作业列表失败:", err)
      toast.error("加载作业列表失败，请刷新重试")
      setHomeworks([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  // 首次加载
  useEffect(() => {
    void loadHomeworks()
  }, [loadHomeworks])

  // 监听删除事件，刷新列表
  useEffect(() => {
    const handler = () => void loadHomeworks()
    window.addEventListener("homework:deleted", handler)
    return () => window.removeEventListener("homework:deleted", handler)
  }, [loadHomeworks])

  /**
   * 新建作业
   *
   * 功能：创建空白作业草稿并跳转到组卷页（由组卷页引导选择纸张）
   * 输入参数：无
   * 返回值：无
   * 修复点：原"新建作业"按钮无 onClick，点击无任何反应
   */
  const handleCreateHomework = async () => {
    if (creating) return
    setCreating(true)
    try {
      // 创建空白作业（默认 A4），组卷页会根据 id !== "new" 跳过纸张选择弹窗
      // 由用户在组卷页通过右侧"纸张格式"切换
      const hw = await createHomework({
        title: "未命名作业",
        page_config: { paper_size: "A4" },
      })
      toast.success("已新建作业，正在进入组卷工作台...")
      navigate(`/homework/${hw.id}/compose`)
    } catch (err) {
      console.error("新建作业失败:", err)
      toast.error("新建作业失败，请重试")
    } finally {
      setCreating(false)
    }
  }

  /**
   * 阶段8：进入批量选择模式
   *
   * 功能：把"批量删除"按钮从"进入选择模式"切换为"选择模式下显示已选数"
   * 输入参数：无
   * 返回值：无
   */
  const handleEnterSelectMode = () => {
    setSelectMode(true)
    setSelectedIds(new Set())
  }

  /**
   * 阶段8：取消选择模式
   *
   * 功能：退出批量删除选择状态，清空已选 id
   * 输入参数：无
   * 返回值：无
   */
  const handleCancelSelect = () => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  /**
   * 阶段8：勾选/取消勾选单个作业
   *
   * 功能：切换某张卡片的选中状态
   * 输入参数：id - 作业 id
   * 返回值：无
   */
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  /**
   * 阶段8：全选/取消全选
   *
   * 功能：选择模式下一键全选/取消全选当前可见的作业
   * 输入参数：无
   * 返回值：无
   */
  const handleToggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map((hw) => hw.id)))
    }
  }

  /**
   * 阶段8：执行批量删除
   *
   * 功能：选择模式 + 有选中项时，点击"删除 (N)"执行批量删除
   * 输入参数：无
   * 返回值：无
   * 设计：连续两次点击同一按钮：
   *  1. 第一次：进入选择模式
   *  2. 第二次（未勾选）：toast 提示"请先选择作业"，不执行任何操作
   *  3. 第二次（已勾选 N 项）：确认弹窗 → 调后端批量删除
   */
  const handleBatchDelete = async () => {
    if (!selectMode) {
      // 第一次点击：进入选择模式
      handleEnterSelectMode()
      return
    }
    if (selectedIds.size === 0) {
      // 第二次点击但没勾选：无操作（满足"连续两次点击无操作"）
      toast.info("请先勾选要删除的作业")
      return
    }
    if (!window.confirm(
      `确定删除已选中的 ${selectedIds.size} 个作业？此操作不可撤销。`
    )) {
      return
    }
    setBatchDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      const res = await batchDeleteHomeworks(ids)
      toast.success(res.message || `已删除 ${res.deleted} 个作业`)
      // 退出选择模式 + 刷新列表
      handleCancelSelect()
      await loadHomeworks()
    } catch (err) {
      console.error("批量删除失败:", err)
      toast.error("批量删除失败")
    } finally {
      setBatchDeleting(false)
    }
  }

  /**
   * 过滤后的作业列表
   * 输入参数：homeworks, keyword
   * 返回值：按标题过滤的作业数组
   */
  const filtered = useMemo(
    () => homeworks.filter((hw) =>
      !keyword.trim() || (hw.title || "").toLowerCase().includes(keyword.trim().toLowerCase()),
    ),
    [homeworks, keyword],
  )

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏 */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-white">
        {selectMode ? (
          // 选择模式
          <>
            <h2 className="text-base font-semibold text-slate-800">批量删除</h2>
            <span className="text-xs text-slate-500">
              已选 <span className="text-blue-600 font-medium">{selectedIds.size}</span> / {filtered.length} 个
            </span>
            <div className="flex-1" />
            <button
              onClick={handleToggleSelectAll}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              {selectedIds.size === filtered.length && filtered.length > 0
                ? <CheckSquare size={14} className="text-blue-600" />
                : <Square size={14} className="text-slate-400" />}
              {selectedIds.size === filtered.length && filtered.length > 0 ? "取消全选" : "全选"}
            </button>
            <button
              onClick={handleCancelSelect}
              className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
            >
              <X size={14} />
              取消
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0 || batchDeleting}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {batchDeleting
                ? <Loader2 size={14} className="animate-spin" />
                : <Trash2 size={14} />}
              删除 ({selectedIds.size})
            </button>
          </>
        ) : (
          // 浏览模式
          <>
            <h2 className="text-base font-semibold text-slate-800">作业列表</h2>
            <span className="text-xs text-slate-400">共 {total} 条</span>
            <div className="flex-1" />
            <div className="relative w-64">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜索作业..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleBatchDelete}
              disabled={filtered.length === 0}
              className="flex items-center gap-1 px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
              title="进入批量删除模式"
            >
              <Trash2 size={14} />
              批量删除
            </button>
            <button
              onClick={handleCreateHomework}
              disabled={creating}
              className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              新建作业
            </button>
          </>
        )}
      </div>

      {/* 卡片网格区域 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
            <Loader2 size={20} className="animate-spin inline-block mr-2" />
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm">
            <FileText size={32} className="mb-2 text-slate-300" />
            <div>暂无作业数据，点击「新建作业」开始组卷</div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {filtered.map((hw) => (
              <HomeworkCard
                key={hw.id}
                homework={hw}
                selectMode={selectMode}
                selected={selectedIds.has(hw.id)}
                onToggleSelect={handleToggleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
