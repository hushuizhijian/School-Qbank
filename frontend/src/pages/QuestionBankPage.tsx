/**
 * 题库中心页面 — 三栏布局
 *
 * 功能：题库管理首页，左侧知识树 + 顶筛选栏 + 两列完整渲染的题目列表
 * 布局：左240px知识树筛选 + 顶筛选栏 + 两列题目区（点击题目弹出编辑弹窗）
 * 路由：/ （默认首页）
 *
 * 改造点：
 *  1. 右侧题目区从 1-3 列响应式改造为固定 2 列布局
 *  2. 题目卡片从简略预览改造为完整内容渲染（含图片强制展开、解析、选项、知识点）
 *  3. 点击任意题目主体 → 弹出 QuestionEditModal 进行二次编辑并保存
 *  4. 顶部批量操作栏：勾选后展示"组卷篮子"+"批量删除"两个按钮
 *     - 组卷篮子：创建空白作业 → 逐题加入 → 跳转组卷工作台
 *     - 批量删除：弹窗确认 → 调用后端批量删除接口 → 刷新列表
 */
import { useState, useEffect, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { getQuestions, batchBankImport, batchDeleteQuestions } from "@/api/questions"
import { createHomework, addHomeworkQuestion } from "@/api/homework"
import type { Question } from "@/types/question"
import KnowledgeTreePanel from "@/components/knowledge/KnowledgeTreePanel"
import FilterBar from "@/components/common/FilterBar"
import QuestionItem from "@/components/question/QuestionItem"
import QuestionEditModal from "@/components/question/QuestionEditModal"
import Pagination from "@/components/common/Pagination"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import { useBatchSelect } from "@/hooks/useBatchSelect"
import { useDebounce } from "@/hooks/useDebounce"
import { PenLine } from "lucide-react"
import { toast } from "sonner"

/* ========== 快捷筛选标签定义 ========== */

const quickFilters = [
  { key: "all", label: "全部" },
  { key: "has_figure", label: "带图" },
  { key: "has_formula", label: "有公式" },
  { key: "has_table", label: "有表格" },
  { key: "is_favorite", label: "收藏" },
]

/* ========== 确认弹窗操作类型 ========== */

/** 待确认的操作类型 */
type ConfirmAction =
  | { type: "batch-delete" } // 批量删除
  | { type: "single-delete"; id: string } // 单个删除

/* ========== 主组件 ========== */

export default function QuestionBankPage() {
  // 路由跳转
  const navigate = useNavigate()
  // 题目列表
  const [questions, setQuestions] = useState<Question[]>([])
  // 总题数
  const [total, setTotal] = useState(0)
  // 当前页码
  const [page, setPage] = useState(1)
  // 每页条数
  const [pageSize, setPageSize] = useState(20)
  // 搜索关键词
  const [keyword, setKeyword] = useState("")
  // 防抖后的搜索关键词
  const debouncedKeyword = useDebounce(keyword, 300)
  // 加载状态
  const [loading, setLoading] = useState(false)
  // 知识点筛选
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<string[]>([])
  // 快捷筛选
  const [activeQuickFilter, setActiveQuickFilter] = useState("all")
  // 高级筛选
  const [grade, setGrade] = useState<string | undefined>(undefined)
  const [questionType, setQuestionType] = useState<string | undefined>(undefined)
  const [difficulty, setDifficulty] = useState<string | undefined>(undefined)

  // 确认弹窗状态
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null) // 待确认操作

  // 编辑弹窗：当前被编辑的题目（null 表示关闭）
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null)

  // 批量选择 Hook
  const {
    selectedIds,
    isSelected,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    selectedCount,
    isAllSelected,
  } = useBatchSelect<Question>(questions, (q) => q.id)

  /* ========== 筛选条件变化检测（避免双重请求） ========== */

  // 上一次筛选条件的引用，用于检测变化
  const prevFiltersRef = useRef({
    debouncedKeyword,
    selectedKnowledgeIds,
    activeQuickFilter,
    grade,
    questionType,
    difficulty,
  })

  // 加载题目列表
  const loadQuestions = useCallback(async (resetPage = false) => {
    setLoading(true)
    try {
      const currentPage = resetPage ? 1 : page
      const params: Record<string, unknown> = {
        page: currentPage,
        page_size: pageSize,
        keyword: debouncedKeyword || undefined,
        in_bank_only: true,
        knowledge_point_ids: selectedKnowledgeIds.length > 0 ? selectedKnowledgeIds.join(",") : undefined,
        grade: grade || undefined,
        question_type: questionType || undefined,
        difficulty: difficulty || undefined,
      }

      // 快捷筛选参数
      if (activeQuickFilter === "has_figure") params.has_figure = true
      if (activeQuickFilter === "has_formula") params.has_formula = true
      if (activeQuickFilter === "has_table") params.has_table = true

      const data = await getQuestions(params)
      setQuestions(data.items)
      setTotal(data.total)
      // 如果当前页没有数据且不是第一页，回退到上一页
      if (data.items.length === 0 && currentPage > 1) {
        setPage(currentPage - 1)
      }
    } catch (err) {
      console.error("加载题目失败:", err)
      toast.error("加载题目失败")
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedKeyword, selectedKnowledgeIds, activeQuickFilter, grade, questionType, difficulty])

  // 筛选条件变化时：检测变化并决定是否重置页码
  useEffect(() => {
    const prev = prevFiltersRef.current
    const current = { debouncedKeyword, selectedKnowledgeIds, activeQuickFilter, grade, questionType, difficulty }

    const filtersChanged =
      prev.debouncedKeyword !== current.debouncedKeyword ||
      prev.selectedKnowledgeIds !== current.selectedKnowledgeIds ||
      prev.activeQuickFilter !== current.activeQuickFilter ||
      prev.grade !== current.grade ||
      prev.questionType !== current.questionType ||
      prev.difficulty !== current.difficulty

    prevFiltersRef.current = current

    if (filtersChanged) {
      setPage(1)
      loadQuestions(true)
    }
  }, [debouncedKeyword, selectedKnowledgeIds, activeQuickFilter, grade, questionType, difficulty, loadQuestions])

  // 组件挂载时：执行首次加载（确保默认显示已入库题目）
  const initialLoadDoneRef = useRef(false)
  useEffect(() => {
    if (initialLoadDoneRef.current) return
    initialLoadDoneRef.current = true
    void loadQuestions(true)                         // 首次加载已入库题目
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 快捷筛选点击
  const handleQuickFilter = (key: string) => {
    setActiveQuickFilter(key)
  }

  /* ========== 批量操作 ========== */

  /**
   * 组卷篮子
   *
   * 功能：勾选题目 → 创建空白作业 → 逐题加入 → 跳转组卷工作台
   * 输入参数：无
   * 返回值：无
   * 使用场景：题库页"组卷篮子"按钮（替代原"批量入库"）
   */
  const handleBatchBankImport = async () => {
    // 防御：未勾选任何题目时直接返回
    if (selectedCount === 0) {
      toast.info("请先勾选要加入组卷篮子的题目")
      return
    }
    const ids = Array.from(selectedIds)
    let createdHomeworkId: string | null = null
    try {
      // 1. 创建空白作业（默认 A4 纸张，可在组卷页切换）
      const hw = await createHomework({
        title: "未命名作业",
        page_config: { paper_size: "A4" },
      })
      createdHomeworkId = hw.id
      // 2. 逐题加入作业（后端未提供批量加入接口，逐个调用保证成功反馈）
      let okCount = 0
      for (const qid of ids) {
        try {
          await addHomeworkQuestion(hw.id, qid, 5)
          okCount += 1
        } catch (err) {
          console.warn("加入题目失败:", qid, err)
        }
      }
      if (okCount === 0) {
        toast.error("组卷篮子加入失败，请重试")
        return
      }
      toast.success(`已加入 ${okCount} 题到组卷篮子`)
      clearSelection()
      // 3. 跳转组卷工作台
      navigate(`/homework/${hw.id}/compose`)
    } catch (err) {
      console.error("组卷篮子失败:", err)
      toast.error("组卷篮子失败，请重试")
      // 失败但已创建作业：跳转到组卷页让用户重试
      if (createdHomeworkId) {
        navigate(`/homework/${createdHomeworkId}/compose`)
      }
    }
  }

  /**
   * 批量删除确认
   *
   * 功能：用户确认后调用后端批量删除接口，刷新题目列表
   * 输入参数：无
   * 返回值：无
   * 修复点：原代码点击后页面崩溃（API 数据格式错误），现已修正
   */
  const handleBatchDeleteConfirm = async () => {
    try {
      const ids = Array.from(selectedIds)
      const res = await batchDeleteQuestions(ids)
      const deleted = res?.deleted ?? ids.length
      toast.success(`已删除 ${deleted} 道题`)
      clearSelection()
      loadQuestions()
    } catch (err) {
      console.error("批量删除失败:", err)
      toast.error("批量删除失败，请重试")
    } finally {
      setConfirmAction(null)
    }
  }

  /**
   * 单个删除确认
   *
   * 功能：用户确认后调用后端批量删除接口（单 ID），刷新题目列表
   * 输入参数：无
   * 返回值：无
   */
  const handleSingleDeleteConfirm = async () => {
    if (!confirmAction || confirmAction.type !== "single-delete") return
    try {
      const res = await batchDeleteQuestions([confirmAction.id])
      const deleted = res?.deleted ?? 1
      toast.success(`已删除 ${deleted} 道题`)
      loadQuestions()
    } catch (err) {
      console.error("删除失败:", err)
      toast.error("删除失败，请重试")
    } finally {
      setConfirmAction(null)
    }
  }

  /** 确认弹窗：根据操作类型执行对应回调 */
  const handleConfirmOk = () => {
    if (!confirmAction) return
    if (confirmAction.type === "batch-delete") {
      handleBatchDeleteConfirm()
    } else if (confirmAction.type === "single-delete") {
      handleSingleDeleteConfirm()
    }
  }

  /**
   * 批量操作按钮配置
   *
   * 功能：勾选题目后展示两个操作入口
   *   - 组卷篮子：创建草稿并跳转
   *   - 批量删除：弹窗确认后删除
   */
  const batchActions = [
    {
      label: "组卷篮子",
      icon: null,
      onClick: handleBatchBankImport,
      variant: "default" as const,
    },
    {
      label: "批量删除",
      icon: null,
      onClick: () => setConfirmAction({ type: "batch-delete" }),
      variant: "danger" as const,
    },
  ]

  /* ========== 分页处理 ========== */

  // 页码变化回调
  const handlePageChange = (newPage: number) => {
    setPage(newPage) // 更新页码
  }

  // 每页条数变化回调
  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize) // 更新每页条数
    setPage(1) // 重置到第一页
  }

  /* ========== 编辑弹窗交互 ========== */

  /**
   * 打开编辑弹窗
   *
   * 功能：点击题目主体时调用，复制当前题目数据作为编辑草稿
   * 输入参数：question - 被点击的题目
   * 返回值：无
   */
  const handleOpenEdit = useCallback((question: Question) => {
    setEditingQuestion(question)
  }, [])

  /**
   * 关闭编辑弹窗
   *
   * 功能：弹窗关闭时清空状态
   * 返回值：无
   */
  const handleCloseEdit = useCallback(() => {
    setEditingQuestion(null)
  }, [])

  /**
   * 保存成功回调
   *
   * 功能：弹窗内保存成功后，更新本地列表中对应题目的数据
   * 输入参数：updated - 后端返回的最新题目
   * 返回值：无
   */
  const handleQuestionSaved = useCallback((updated: Question) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === updated.id ? { ...q, ...updated } : q)),
    )
  }, [])

  return (
    <div className="flex h-full">
      {/* 左栏：知识点树形筛选面板 */}
      <div className="w-[240px] border-r border-slate-200 bg-white overflow-y-auto shrink-0">
        <KnowledgeTreePanel
          selectedIds={selectedKnowledgeIds}
          onChange={setSelectedKnowledgeIds}
        />
      </div>

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部筛选栏 */}
        <FilterBar
          keyword={keyword}
          onKeywordChange={setKeyword}
          quickFilters={quickFilters.map((f) => ({
            key: f.key,
            label: f.label,
            active: activeQuickFilter === f.key,
          }))}
          onQuickFilter={handleQuickFilter}
          selectedCount={selectedCount}
          batchActions={batchActions}
          total={total}
          grade={grade}
          onGradeChange={setGrade}
          questionType={questionType}
          onQuestionTypeChange={setQuestionType}
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
        />

        {/* 全选操作栏 */}
        {questions.length > 0 && (
          <div className="bg-white border-b border-slate-100 px-6 py-2 flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={isAllSelected}
                onChange={toggleSelectAll}
                className="rounded border-slate-300"
              />
              全选
            </label>
            {selectedCount > 0 && (
              <span className="text-sm text-blue-600">
                已选 {selectedCount} 题
              </span>
            )}
            <span className="text-xs text-slate-400 ml-auto">
              点击任意题目可进行二次编辑
            </span>
          </div>
        )}

        {/* 题目两列布局区 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            /* 骨架屏占位动画 — 4张卡片模拟加载状态 */
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 animate-pulse">
                  {/* 头部条 — 模拟标签区 */}
                  <div className="flex gap-2 mb-3">
                    <div className="h-5 w-16 bg-slate-200 rounded" />
                    <div className="h-5 w-12 bg-slate-200 rounded" />
                  </div>
                  {/* 文本条 — 模拟题干预览 */}
                  <div className="space-y-2 mb-4">
                    <div className="h-4 w-full bg-slate-200 rounded" />
                    <div className="h-4 w-4/5 bg-slate-200 rounded" />
                    <div className="h-4 w-3/5 bg-slate-200 rounded" />
                  </div>
                  {/* 底部条 — 模拟操作按钮 */}
                  <div className="flex gap-2">
                    <div className="h-8 w-16 bg-slate-200 rounded" />
                    <div className="h-8 w-16 bg-slate-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : questions.length === 0 ? (
            <div className="text-center text-slate-400 py-12">
              <PenLine size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg mb-2">题库暂无题目</p>
              <p className="text-sm">请先上传试卷进行智能解析</p>
            </div>
          ) : (
            /* 固定两列布局：等宽列 + 行高由内容自适应（CSS Grid 默认行为） */
            <div className="grid grid-cols-2 gap-4 items-stretch">
              {questions.map((q) => (
                <QuestionItem
                  key={q.id}
                  question={q}
                  selected={isSelected(q.id)}
                  onSelect={(id) => toggleSelect(id)}
                  onClick={handleOpenEdit}
                  onDelete={(id) => {
                    setConfirmAction({ type: "single-delete", id }) // 打开确认弹窗
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* 分页器（使用 Pagination 组件 + 每页条数选择器） */}
        {total > 0 && (
          <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
            {/* 左侧：每页条数选择器 */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">每页</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))} // 切换每页条数
                className="text-sm border border-slate-200 rounded px-2 py-1 bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <span className="text-sm text-slate-500">条</span>
            </div>

            {/* 右侧：分页导航 */}
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onChange={handlePageChange}
            />
          </div>
        )}
      </div>

      {/* 确认弹窗（删除操作） */}
      <ConfirmDialog
        open={confirmAction !== null} // 有待确认操作时显示
        title={confirmAction?.type === "batch-delete" ? "批量删除确认" : "删除确认"}
        message={
          confirmAction?.type === "batch-delete"
            ? `确定要删除选中的 ${selectedCount} 道题吗？此操作不可撤销。`
            : "确定要删除这道题吗？此操作不可撤销。"
        }
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmOk} // 确认执行删除
        onCancel={() => setConfirmAction(null)} // 取消关闭弹窗
        variant="danger" // 危险操作样式
      />

      {/* 编辑弹窗：点击题目主体时打开 */}
      <QuestionEditModal
        open={editingQuestion !== null}
        question={editingQuestion}
        onClose={handleCloseEdit}
        onSaved={handleQuestionSaved}
      />
    </div>
  )
}
