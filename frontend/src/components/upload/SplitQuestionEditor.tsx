/**
 * SplitQuestionEditor — 分题结果编辑器（content分题唯一方案）
 *
 * 功能：解析完成后在右侧展示分题结果，支持即时编辑、多选拖拽排序、图片强制全显示
 * 输入：questions 题目列表，paperId 试卷ID，onResplit 重新分题回调
 * 使用场景：PaperSplitPage 右侧分题结果区
 *
 * 二期优化（content分题唯一方案）：
 *  1. 移除切换分题方案 UI（仅 content分题）
 *  2. 图片强制全显示模式（默认展开所有有图题）
 *  3. 题干使用 PreviewRenderer 渲染（支持 Markdown 表格 / LaTeX 公式 / HTML）
 *  4. 表格题渲染优化（自定义 prose 容器样式）
 *
 * 三期优化（编辑与排序体验）：
 *  1. 即时编辑：题干区 contentEditable，点击即编辑，无需"编辑图标 → 文本框 → 保存"流程
 *  2. 自动保存：内容变更 debounce 800ms 后自动调用 PATCH 接口，无需手动保存
 *  3. 视觉反馈：保存中显示旋转图标、保存成功显示绿勾短暂提示
 *  4. 多选 checkbox：题目左侧加勾选框，支持批量选中
 *  5. 拖拽排序：基于 @dnd-kit/sortable，整行可拖动（含多选组批量移动）
 *  6. 拖拽视觉：拖动时高亮、放置位置指示、缩放阴影
 *
 * 四期优化（编辑功能增强 — 本次）：
 *  1. 题干预览/编辑双模式：默认预览模式保留表格、公式、图片；点击"编辑"切换到文本模式
 *  2. 多图分隔：每张图片独立卡片展示，支持独立增/删/替
 *  3. 图片编辑：集成 ZoomableImage，支持鼠标滚轮缩放 + 拖拽平移
 *  4. 选中题联动：与左栏图片资源库联动，单击图片资源库图片即可替换当前选中题图片
 *  5. 非破坏性管理：所有图片仅维护关联关系，不删除磁盘文件
 */
import { useState, useEffect, useMemo, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowRight, RotateCcw, GripVertical, Image as ImageIcon,
  Check, Loader2, Square, CheckSquare, Eye, Edit3, Library, ChevronDown, ChevronUp,
  Trash2, Plus, Save,
} from "lucide-react"
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, closestCenter, KeyboardSensor,
} from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/utils/cn"
import { updateQuestion, deleteQuestion } from "@/api/questions"
import type { Question } from "@/types/question"
import PreviewRenderer from "@/components/question/PreviewRenderer"
import QuestionImageEditor, { type QuestionImageValue } from "@/components/upload/QuestionImageEditor"
import ConfirmDialog from "@/components/common/ConfirmDialog"
import { toast } from "sonner"

/** 组件属性 */
interface SplitQuestionEditorProps {
  questions: Question[]                          // 题目列表
  paperId: string                               // 试卷ID
  splitLoading?: boolean                        // 分题加载中
  selectedQuestionId?: string | null            // 外部选中的题目ID（来自图片库）
  onSelectQuestion?: (id: string) => void       // 选中题目回调
  onResplit: () => void                         // 重新分题回调
  onQuestionsChange: (questions: Question[]) => void  // 题目变更回调
  /** 题目ID → 当前激活的空白图片槽位索引（受控，由父组件统一管理） */
  pendingBlankIndexByQuestion?: Record<string, number | null>
  /** 题目激活槽位变更回调 */
  onPendingBlankChange?: (qId: string, idx: number | null) => void
  /** 题目ID → 父组件下达的图片填入指令（消费后清除） */
  fillRequestByQuestion?: Record<string, import("@/components/upload/QuestionImageEditor").ImageFillRequest | null>
  /** 填入指令消费完成回调 */
  onFillConsumed?: (qId: string) => void
}

/** 单题保存状态 */
type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error"

/** 单题显示模式：预览（含表格/公式/图片） / 编辑（纯文本） */
type DisplayMode = "preview" | "edit"

/** 自动保存防抖延迟（毫秒） */
const AUTOSAVE_DELAY = 800

/** 已保存状态提示持续时间（毫秒） */
const SAVED_INDICATOR_DURATION = 1500

/** 分题保存按钮状态 */
type PageSaveStatus = "idle" | "saving" | "saved" | "error"

/**
 * 构造分题页面单题更新 payload（统一逻辑，避免分题保存/进入校对工作台/自动保存行为不一致）
 *
 * 功能：始终同步 stem；若该题存在 LaTeX 源码（latex_source 字段非空），
 *      则同时把 stem 写入 latex_source，保证校对工作台读取到最新内容
 *
 * 输入参数：q 当前题目对象（含最新 stem 与初始 latex_source）
 * 返回值：发往后端 PATCH /api/questions/{id} 的 payload
 * 使用场景：分题保存（handlePageSave）、跳转前预保存（goToWorkbench）、单题自动保存
 */
function buildQuestionUpdatePayload(q: Question): { stem: string; latex_source?: string } {
  // 始终携带 stem，确保题干本身被更新
  const payload: { stem: string; latex_source?: string } = { stem: q.stem || "" }
  // 校对工作台优先使用 latex_source 字段；若该题曾有 LaTeX 源码（来自 MinerU 解析），
  // 必须把最新 stem 同步到 latex_source，否则校对工作台会显示数据库中的旧 LaTeX 源
  if (q.latex_source) {
    payload.latex_source = q.stem || ""
  }
  return payload
}

/**
 * SplitQuestionEditor 主组件
 * 负责管理题目列表状态、多选状态、拖拽编排与自动保存调度
 */
export default function SplitQuestionEditor({
  questions,
  paperId,
  splitLoading,
  selectedQuestionId,
  onSelectQuestion,
  onResplit,
  onQuestionsChange,
  pendingBlankIndexByQuestion,
  onPendingBlankChange,
  fillRequestByQuestion,
  onFillConsumed,
}: SplitQuestionEditorProps) {
  const navigate = useNavigate()

  // 展开图片的题目ID集合（默认全部展开，强制全显示模式）
  const [expandedImages, setExpandedImages] = useState<Set<string>>(() => {
    // 初始化时，把所有有图的题目ID加入展开集合
    const initial = new Set<string>()
    for (const q of questions) {
      if ((q.has_figure || (q.images && q.images.length > 0))) {
        initial.add(q.id)
      }
    }
    return initial
  })

  // 选中题目的 ID 集合（用于多选与拖拽组移动）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 拖拽中正在被拖拽的题目 ID
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  // 题目 ID → 保存状态映射（idle/dirty/saving/saved/error）
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({})

  // saveStatus 同步镜像 ref：避免 goToWorkbench 等事件回调读到 useState 闭包旧值
  // 注意：setSaveStatus 调用后 React state 更新是异步的，事件回调中读 ref 才是最新值
  const saveStatusRef = useRef<Record<string, SaveStatus>>({})

  // 题目 ID → 显示模式映射（默认 preview，保留表格）
  const [displayMode, setDisplayMode] = useState<Record<string, DisplayMode>>({})

  // 题目 ID → 定时器句柄映射（防抖自动保存）
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // 题目 ID → saved 提示清除定时器映射
  const indicatorTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // 待删除题目信息：{ id, questionNo } | null
  const [pendingDelete, setPendingDelete] = useState<{ id: string; questionNo: number } | null>(null)

  // 是否正在删除（用于按钮禁用 + 弹窗禁用）
  const [deleting, setDeleting] = useState(false)

  // 分题保存状态（用于控制底部"分题保存"按钮）
  const [pageSaveStatus, setPageSaveStatus] = useState<PageSaveStatus>("idle")

  // 分题保存成功的提示清除定时器
  const pageSaveIndicatorRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 题目 ID → 触发该题新增图片的指令（自增计数触发 SortableQuestionItem 内的 useEffect）
  const [addImageTickByQ, setAddImageTickByQ] = useState<Record<string, number>>({})

  // 当外部 questions 变化（重新分题、加载试卷）时重置保存状态
  // 这是与外部 props 同步的标准场景（外部系统 → 内部 state）
  useEffect(() => {
    const next: Record<string, SaveStatus> = {}
    for (const q of questions) {
      next[q.id] = "idle"
    }
    // 同步镜像到 ref：保证事件回调中读到的也是最新值
    saveStatusRef.current = next
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveStatus(next)
    setSelectedIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId])

  // 当外部 selectedQuestionId 变化时，自动滚动到该题
  useEffect(() => {
    if (!selectedQuestionId) return
    const el = document.querySelector(`[data-question-id="${selectedQuestionId}"]`)
    if (el && "scrollIntoView" in el) {
      ;(el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" })
    }
    // 强制展开该题的图片（与外部选中态同步）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedImages((prev) => {
      if (prev.has(selectedQuestionId)) return prev
      const next = new Set(prev)
      next.add(selectedQuestionId)
      return next
    })
  }, [selectedQuestionId])

  // 组件卸载时清理所有未完成的定时器
  useEffect(() => {
    const timers = saveTimersRef.current
    const indicators = indicatorTimersRef.current
    const pageSave = pageSaveIndicatorRef.current
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t)
      for (const t of Object.values(indicators)) clearTimeout(t)
      if (pageSave) clearTimeout(pageSave)
    }
  }, [])

  /** 进入校对工作台 — 先把所有待保存修改落库再跳转，避免数据丢失 */
  const goToWorkbench = async () => {
    if (!paperId) return
    // 清空所有防抖定时器，避免跳转后定时器仍在更新已卸载组件
    for (const id of Object.keys(saveTimersRef.current)) {
      clearTimeout(saveTimersRef.current[id])
      delete saveTimersRef.current[id]
    }
    // 读取最新 saveStatus：使用 ref 镜像，避免 useState 闭包拿到异步更新前的旧值
    // 场景：用户先点"分题保存"（setSaveStatus 是异步的）再立即点"进入校对工作台"
    const currentSaveStatus = saveStatusRef.current
    const dirtyIds = Object.entries(currentSaveStatus)
      .filter(([, status]) => status === "dirty" || status === "error")
      .map(([id]) => id)
    if (dirtyIds.length > 0) {
      setPageSaveStatus("saving")
      try {
        await Promise.allSettled(
          dirtyIds.map((id) => {
            const q = questions.find((item) => item.id === id)
            if (!q) return Promise.resolve()
            // 统一走 buildQuestionUpdatePayload：始终同步 stem 与 latex_source（若题目曾有 LaTeX 源码）
            // 校对工作台优先使用 latex_source 字段，必须把最新 stem 写入 latex_source 才能看到修改
            return updateQuestion(id, buildQuestionUpdatePayload(q))
          })
        )
        setPageSaveStatus("saved")
        if (pageSaveIndicatorRef.current) clearTimeout(pageSaveIndicatorRef.current)
        pageSaveIndicatorRef.current = setTimeout(() => {
          setPageSaveStatus("idle")
        }, SAVED_INDICATOR_DURATION)
      } catch (err) {
        console.error("跳转前保存失败:", err)
        setPageSaveStatus("error")
        if (pageSaveIndicatorRef.current) clearTimeout(pageSaveIndicatorRef.current)
        pageSaveIndicatorRef.current = setTimeout(() => {
          setPageSaveStatus("idle")
        }, SAVED_INDICATOR_DURATION)
      }
    }
    // 跳转至校对工作台
    navigate(`/papers/${paperId}`)
  }

  /** 切换图片展开/折叠 */
  const toggleImages = (qId: string) => {
    setExpandedImages((prev) => {
      const next = new Set(prev)
      if (next.has(qId)) {
        next.delete(qId)
      } else {
        next.add(qId)
      }
      return next
    })
  }

  /** 切换单个题目选中状态 */
  const toggleSelect = (qId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(qId)) {
        next.delete(qId)
      } else {
        next.add(qId)
      }
      return next
    })
    // 同步到父组件（用于图片库联动）
    if (onSelectQuestion) onSelectQuestion(qId)
  }

  /** 全选 / 取消全选 */
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (prev.size === questions.length) {
        return new Set()
      }
      return new Set(questions.map((q) => q.id))
    })
  }

  /** 清除所有选中 */
  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  /**
   * 处理题干编辑（contentEditable 输入回调）
   * 即时更新本地 stem，并启动 debounce 自动保存
   * 若该题此前存在 latex_source（来自 MinerU 解析），则同步保持一致
   */
  const handleStemChange = (qId: string, newStem: string) => {
    onQuestionsChange(
      questions.map((q) => (q.id === qId ? { ...q, stem: newStem } : q))
    )
    // 同步镜像到 ref：保证后续事件回调能读到最新状态
    setSaveStatus((prev) => {
      const next = { ...prev, [qId]: "dirty" as SaveStatus }
      saveStatusRef.current = next
      return next
    })

    const existing = saveTimersRef.current[qId]
    if (existing) clearTimeout(existing)

    saveTimersRef.current[qId] = setTimeout(() => {
      // 自动保存：以最新 stem 构造 payload（统一走 buildQuestionUpdatePayload）
      const q = questions.find((item) => item.id === qId)
      if (!q) return
      const payload = buildQuestionUpdatePayload({ ...q, stem: newStem })
      void performSave(qId, payload)
    }, AUTOSAVE_DELAY)
  }

  /**
   * 实际执行保存的函数
   */
  const performSave = async (qId: string, payload: { stem: string; latex_source?: string }) => {
    setSaveStatus((prev) => {
      const next = { ...prev, [qId]: "saving" as SaveStatus }
      saveStatusRef.current = next
      return next
    })
    try {
      await updateQuestion(qId, payload)
      setSaveStatus((prev) => {
        const next = { ...prev, [qId]: "saved" as SaveStatus }
        saveStatusRef.current = next
        return next
      })
      const prev = indicatorTimersRef.current[qId]
      if (prev) clearTimeout(prev)
      indicatorTimersRef.current[qId] = setTimeout(() => {
        setSaveStatus((s) => {
          if (s[qId] !== "saved") return s
          const nextInner = { ...s, [qId]: "idle" as SaveStatus }
          saveStatusRef.current = nextInner
          return nextInner
        })
      }, SAVED_INDICATOR_DURATION)
    } catch (err) {
      console.error("自动保存失败:", err)
      setSaveStatus((prev) => {
        const next = { ...prev, [qId]: "error" as SaveStatus }
        saveStatusRef.current = next
        return next
      })
    }
  }

  /**
   * 切换显示模式
   */
  const toggleDisplayMode = (qId: string) => {
    setDisplayMode((prev) => {
      const next = { ...prev }
      next[qId] = (next[qId] || "preview") === "preview" ? "edit" : "preview"
      return next
    })
  }

  /**
   * 触发指定题目的"新增图片"动作
   * 思路：自增 tick，子组件 useEffect 监听后调用 QuestionImageEditor 的 addBlank
   */
  const handleAddImage = (qId: string) => {
    // 强制展开该题的图片区
    setExpandedImages((prev) => {
      if (prev.has(qId)) return prev
      const next = new Set(prev)
      next.add(qId)
      return next
    })
    setAddImageTickByQ((prev) => ({ ...prev, [qId]: (prev[qId] || 0) + 1 }))
    // 同步选中该题（让图片库也能定位）
    if (onSelectQuestion) onSelectQuestion(qId)
  }

  /**
   * 请求删除题目（打开确认弹窗）
   */
  const requestDeleteQuestion = (qId: string) => {
    const target = questions.find((q) => q.id === qId)
    if (!target) return
    setPendingDelete({ id: qId, questionNo: target.question_no })
  }

  /**
   * 取消删除
   */
  const cancelDelete = () => {
    if (deleting) return
    setPendingDelete(null)
  }

  /**
   * 确认删除题目
   * 流程：先取消该题选中 + 取消多选 → 调用 deleteQuestion → 通知父组件从列表移除 → 重新编号
   */
  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return
    const target = questions.find((q) => q.id === pendingDelete.id)
    if (!target) {
      setPendingDelete(null)
      return
    }
    setDeleting(true)
    try {
      // 先清除该题未触发的自动保存定时器，避免误伤
      const t = saveTimersRef.current[pendingDelete.id]
      if (t) {
        clearTimeout(t)
        delete saveTimersRef.current[pendingDelete.id]
      }
      const ind = indicatorTimersRef.current[pendingDelete.id]
      if (ind) {
        clearTimeout(ind)
        delete indicatorTimersRef.current[pendingDelete.id]
      }
      // 从多选集合中移除
      setSelectedIds((prev) => {
        if (!prev.has(pendingDelete.id)) return prev
        const next = new Set(prev)
        next.delete(pendingDelete.id)
        return next
      })
      // 后端删除
      await deleteQuestion(pendingDelete.id)
      // 本地更新：移除该题 + 重新编号
      const remaining = questions
        .filter((q) => q.id !== pendingDelete.id)
        .map((q, i) => ({ ...q, question_no: i + 1 }))
      onQuestionsChange(remaining)
      // 同步新题号到后端
      void Promise.all(
        remaining.map((q) =>
          updateQuestion(q.id, { question_no: q.question_no }).catch(() => undefined)
        )
      )
      toast.success(`第 ${pendingDelete.questionNo} 题已删除`)
      setPendingDelete(null)
    } catch (err) {
      console.error("删除题目失败:", err)
      toast.error("删除题目失败，请重试")
    } finally {
      setDeleting(false)
    }
  }

  /**
   * 分题保存：立即触发所有 dirty 状态的题目执行保存
   * 策略：清空所有防抖定时器 → 立即对每道 dirty 题目调用 updateQuestion → 反馈结果
   */
  const handlePageSave = async () => {
    // 找出所有 dirty 状态的题目：用 ref 镜像读最新状态，避免 useState 闭包滞后
    const dirtyIds = Object.entries(saveStatusRef.current)
      .filter(([, status]) => status === "dirty" || status === "error")
      .map(([id]) => id)
    // 取消所有防抖定时器（避免延后重复触发）
    for (const id of Object.keys(saveTimersRef.current)) {
      clearTimeout(saveTimersRef.current[id])
      delete saveTimersRef.current[id]
    }
    if (dirtyIds.length === 0) {
      // 没有需要保存的修改，直接显示"已保存"
      setPageSaveStatus("saved")
      if (pageSaveIndicatorRef.current) clearTimeout(pageSaveIndicatorRef.current)
      pageSaveIndicatorRef.current = setTimeout(() => {
        setPageSaveStatus("idle")
      }, SAVED_INDICATOR_DURATION)
      toast.success("当前分题无待保存修改")
      return
    }
    setPageSaveStatus("saving")
    // 收集当前题目快照：统一走 buildQuestionUpdatePayload，确保 stem 与 latex_source 同步
    // 校对工作台优先使用 latex_source 字段，必须把最新 stem 写入 latex_source 才能看到修改
    const updates = dirtyIds
      .map((id) => {
        const q = questions.find((item) => item.id === id)
        if (!q) return null
        return { id, payload: buildQuestionUpdatePayload(q) }
      })
      .filter((u): u is { id: string; payload: { stem: string; latex_source?: string } } => u !== null)
    // 标记所有为 saving（同时同步镜像到 ref，避免 goToWorkbench 等后续事件读到闭包旧值）
    setSaveStatus((prev) => {
      const next = { ...prev }
      for (const id of dirtyIds) next[id] = "saving"
      saveStatusRef.current = next
      return next
    })
    try {
      // 并发保存
      const results = await Promise.allSettled(
        updates.map((u) => updateQuestion(u.id, u.payload)),
      )
      let okCount = 0
      let failCount = 0
      results.forEach((r, idx) => {
        const u = updates[idx]
        if (r.status === "fulfilled") {
          okCount += 1
          setSaveStatus((prev) => {
            const next = { ...prev, [u.id]: "saved" as SaveStatus }
            // 同步镜像到 ref：保证后续事件回调能读到最新状态
            saveStatusRef.current = next
            return next
          })
          const ind = indicatorTimersRef.current[u.id]
          if (ind) clearTimeout(ind)
          indicatorTimersRef.current[u.id] = setTimeout(() => {
            setSaveStatus((s) => {
              if (s[u.id] !== "saved") return s
              const nextInner = { ...s, [u.id]: "idle" as SaveStatus }
              saveStatusRef.current = nextInner
              return nextInner
            })
          }, SAVED_INDICATOR_DURATION)
        } else {
          failCount += 1
          setSaveStatus((prev) => {
            const next = { ...prev, [u.id]: "error" as SaveStatus }
            saveStatusRef.current = next
            return next
          })
        }
      })
      if (failCount === 0) {
        setPageSaveStatus("saved")
        toast.success(`分题保存成功（${okCount} 题）`)
      } else {
        setPageSaveStatus("error")
        toast.error(`分题保存部分失败：成功 ${okCount}，失败 ${failCount}`)
      }
      if (pageSaveIndicatorRef.current) clearTimeout(pageSaveIndicatorRef.current)
      pageSaveIndicatorRef.current = setTimeout(() => {
        setPageSaveStatus((s) => (s === "saved" || s === "error" ? "idle" : s))
      }, SAVED_INDICATOR_DURATION)
    } catch (err) {
      console.error("分题保存失败:", err)
      setPageSaveStatus("error")
      toast.error("分题保存失败")
      if (pageSaveIndicatorRef.current) clearTimeout(pageSaveIndicatorRef.current)
      pageSaveIndicatorRef.current = setTimeout(() => {
        setPageSaveStatus("idle")
      }, SAVED_INDICATOR_DURATION)
    }
  }

  /**
   * 解析图片列表为对象数组（兼容 string[] 和 object[] 两种格式）
   */
  const getImages = (q: Question): QuestionImageValue[] => {
    if (!q.images || !Array.isArray(q.images)) return []
    return q.images as QuestionImageValue[]
  }

  /**
   * 处理题目图片列表变更
   * 同步更新本地状态并持久化
   */
  const handleImagesChange = (qId: string, newImages: QuestionImageValue[]) => {
    const target = questions.find((q) => q.id === qId)
    if (!target) return
    const hasFigure = newImages.length > 0
    const newHasFigure = hasFigure !== Boolean(target.has_figure) ? hasFigure : target.has_figure
    // 一次性更新本地状态（images + has_figure）
    onQuestionsChange(
      questions.map((q) =>
        q.id === qId
          ? { ...q, images: newImages as unknown as string[], has_figure: newHasFigure }
          : q
      )
    )
    // 持久化到后端
    void updateQuestion(qId, {
      images: newImages as unknown as string[],
      has_figure: newHasFigure,
    }).catch((err) => {
      console.error("保存图片关联失败:", err)
    })
  }

  /** 题型标签颜色映射（6 种标准 + 兼容旧 key） */
  const typeColorMap: Record<string, string> = {
    // 6 种标准配色
    choice: "bg-blue-100 text-blue-700",
    fill_blank: "bg-green-100 text-green-700",
    calculation: "bg-orange-100 text-orange-700",
    application: "bg-purple-100 text-purple-700",
    true_false: "bg-yellow-100 text-yellow-700",
    operation: "bg-pink-100 text-pink-700",
    // 兼容旧 key（沿用主键配色）
    single_choice: "bg-blue-100 text-blue-700",
    multi_choice: "bg-blue-100 text-blue-700",
    single: "bg-blue-100 text-blue-700",
    fill: "bg-green-100 text-green-700",
    judge: "bg-yellow-100 text-yellow-700",
    calc: "bg-orange-100 text-orange-700",
    operate: "bg-pink-100 text-pink-700",
    solution: "bg-purple-100 text-purple-700",
    general: "bg-slate-100 text-slate-600",
  }

  /** 题型标签文字（6 种标准 + 兼容旧 key） */
  const typeLabelMap: Record<string, string> = {
    // 6 种标准
    choice: "选择",
    fill_blank: "填空",
    calculation: "计算",
    application: "解决",
    true_false: "判断",
    operation: "操作",
    // 兼容旧 key
    single_choice: "选择",
    multi_choice: "选择",
    single: "选择",
    fill: "填空",
    judge: "判断",
    calc: "计算",
    operate: "操作",
    solution: "解决",
    general: "解决",
  }

  // ===== 拖拽传感器：需要移动 5px 才触发，避免与点击冲突 =====
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // 拖拽开始
  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string)
  }

  // 拖拽结束：处理单题/多选组移动
  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = questions.findIndex((q) => q.id === active.id)
    const newIndex = questions.findIndex((q) => q.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    if (selectedIds.has(active.id as string) && selectedIds.size > 1) {
      moveGroupAsBlock(oldIndex, newIndex)
    } else {
      moveSingle(oldIndex, newIndex)
    }
  }

  /**
   * 单题移动
   */
  const moveSingle = (oldIndex: number, newIndex: number) => {
    const newQuestions = arrayMove(questions, oldIndex, newIndex)
    const renumbered = newQuestions.map((q, i) => ({ ...q, question_no: i + 1 }))
    onQuestionsChange(renumbered)
    syncQuestionNos(renumbered)
  }

  /**
   * 多选题组移动
   */
  const moveGroupAsBlock = (oldIndex: number, newIndex: number) => {
    const selectedSet = new Set(selectedIds)
    const selectedItems = questions.filter((q) => selectedSet.has(q.id))
    const unselectedItems = questions.filter((q) => !selectedSet.has(q.id))
    const beforeUnselected = unselectedItems.findIndex((q) => q.id === questions[newIndex]?.id)
    const targetUnselectedIndex = beforeUnselected >= 0 ? beforeUnselected : unselectedItems.length
    const reordered = [
      ...unselectedItems.slice(0, targetUnselectedIndex),
      ...selectedItems,
      ...unselectedItems.slice(targetUnselectedIndex),
    ]
    const renumbered = reordered.map((q, i) => ({ ...q, question_no: i + 1 }))
    onQuestionsChange(renumbered)
    syncQuestionNos(renumbered)
  }

  /**
   * 同步题号到后端
   */
  const syncQuestionNos = (newQuestions: Question[]) => {
    void Promise.all(
      newQuestions.map((q) =>
        updateQuestion(q.id, { question_no: q.question_no }).catch(() => undefined)
      )
    )
  }

  // ===== 派生状态：当前被拖拽题信息 =====
  const activeQuestion = useMemo(
    () => questions.find((q) => q.id === activeDragId) || null,
    [questions, activeDragId],
  )

  // ===== 派生状态：是否全选 =====
  const isAllSelected = questions.length > 0 && selectedIds.size === questions.length

  return (
    <div className="flex flex-col h-full">
      {/* 摘要卡片 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">
            分题结果摘要
            {selectedIds.size > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                已选 {selectedIds.size} 题
              </span>
            )}
          </h3>
          <span className="text-xs text-slate-400">
            共 {questions.length} 题
          </span>
        </div>
        {/* 题目列表预览 */}
        <div className="flex flex-wrap gap-1.5">
          {questions.map((q) => (
            <span
              key={q.id}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-medium cursor-pointer transition-all",
                typeColorMap[q.question_type || "general"] || typeColorMap.general,
                selectedQuestionId === q.id && "ring-2 ring-blue-500 ring-offset-1",
              )}
              onClick={() => onSelectQuestion && onSelectQuestion(q.id)}
              title={`跳转到第 ${q.question_no} 题`}
            >
              {q.question_no}. {typeLabelMap[q.question_type || "general"] || "通用"}
            </span>
          ))}
        </div>
      </div>

      {/* 题目列表编辑区 */}
      <div className="bg-white rounded-xl border border-slate-200 flex-1 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-700">
              题目列表（可即时编辑、拖拽排序）
            </h3>
            {/* 多选工具栏 */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors"
                title={isAllSelected ? "取消全选" : "全选"}
              >
                {isAllSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {isAllSelected ? "取消全选" : "全选"}
              </button>
              {selectedIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  清除
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400">
            表格/公式/图片完整显示，所见即所得 · 点击题干切换编辑 · 勾选后拖动手柄可批量调整顺序 · 图片强制全显示
          </p>
        </div>

        {/* 可滚动题目列表 + 拖拽上下文 */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={questions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {questions.map((q, index) => (
                <SortableQuestionItem
                  key={q.id}
                  question={q}
                  index={index}
                  isSelected={selectedIds.has(q.id)}
                  isExternalSelected={selectedQuestionId === q.id}
                  isExpanded={expandedImages.has(q.id) || (q.has_figure || getImages(q).length > 0)}
                  saveStatus={saveStatus[q.id] || "idle"}
                  images={getImages(q)}
                  mode={displayMode[q.id] || "preview"}
                  typeColorMap={typeColorMap}
                  typeLabelMap={typeLabelMap}
                  onToggleSelect={toggleSelect}
                  onToggleImages={toggleImages}
                  onStemChange={handleStemChange}
                  onImagesChange={(newImgs) => handleImagesChange(q.id, newImgs)}
                  onToggleMode={toggleDisplayMode}
                  onPickFromLibrary={() => {
                    if (onSelectQuestion) onSelectQuestion(q.id)
                  }}
                  pendingBlankIndex={pendingBlankIndexByQuestion?.[q.id] ?? null}
                  onPendingBlankChange={onPendingBlankChange ? (idx) => onPendingBlankChange(q.id, idx) : undefined}
                  fillRequest={fillRequestByQuestion?.[q.id] ?? null}
                  onFillConsumed={onFillConsumed ? () => onFillConsumed(q.id) : undefined}
                  onAddImage={() => handleAddImage(q.id)}
                  onDelete={() => requestDeleteQuestion(q.id)}
                  addImageTick={addImageTickByQ[q.id] || 0}
                />
              ))}
            </div>
          </SortableContext>

          {/* 拖拽时跟随鼠标的预览 */}
          <DragOverlay>
            {activeQuestion ? (
              <div className="opacity-90 shadow-2xl ring-2 ring-blue-400 rounded-lg bg-white p-3 cursor-grabbing">
                <div className="flex items-center gap-2">
                  <GripVertical size={16} className="text-blue-500" />
                  <span className="text-sm font-medium text-slate-700">
                    移动第 {activeQuestion.question_no} 题
                    {selectedIds.has(activeQuestion.id) && selectedIds.size > 1
                      ? `（含已选 ${selectedIds.size} 题）`
                      : ""}
                  </span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* 底部操作栏 */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 gap-2 flex-wrap">
        <button
          onClick={onResplit}
          disabled={splitLoading}
          className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <RotateCcw size={14} />
          重新分题
        </button>

        <div className="flex items-center gap-2">
          {/* 分题保存按钮：三态视觉反馈（hover/active/disabled） */}
          <button
            onClick={handlePageSave}
            disabled={pageSaveStatus === "saving"}
            className={cn(
              "group/save flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg border transition-all duration-150",
              pageSaveStatus === "saved"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : pageSaveStatus === "error"
                  ? "border-red-300 bg-red-50 text-red-700"
                  : pageSaveStatus === "saving"
                    ? "border-blue-300 bg-blue-50 text-blue-700 cursor-wait"
                    : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:border-slate-300",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "focus:outline-none focus:ring-1 focus:ring-blue-400",
            )}
            title="立即保存当前分题页所有待保存的修改（题干、表格等）"
          >
            {pageSaveStatus === "saving" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : pageSaveStatus === "saved" ? (
              <Check size={14} />
            ) : pageSaveStatus === "error" ? (
              <span className="text-red-500">!</span>
            ) : (
              <Save size={14} />
            )}
            {pageSaveStatus === "saving"
              ? "保存中..."
              : pageSaveStatus === "saved"
                ? "已保存"
                : pageSaveStatus === "error"
                  ? "保存失败"
                  : "分题保存"}
          </button>

          {/* 进入校对工作台按钮：分题保存完成后启用（未保存时给出提示但不阻止） */}
          <button
            onClick={goToWorkbench}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all duration-150",
              "bg-blue-600 text-white",
              "hover:bg-blue-700 hover:shadow-md",
              "active:bg-blue-800",
              "focus:outline-none focus:ring-1 focus:ring-blue-400",
            )}
          >
            进入校对工作台
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除题目"
        message={
          pendingDelete
            ? `确认要删除第 ${pendingDelete.questionNo} 题吗？该题所有图片关联、表格与知识点绑定都将一并解除，操作不可撤销。`
            : ""
        }
        confirmText={deleting ? "删除中..." : "确认删除"}
        cancelText="取消"
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={cancelDelete}
      />
    </div>
  )
}

// =============================================================================
// 子组件：SortableQuestionItem
// 单个可拖拽题目行，集成预览/编辑双模式、多图分隔、图片操作
// =============================================================================

/** SortableQuestionItem 组件属性 */
interface SortableQuestionItemProps {
  question: Question
  index: number
  isSelected: boolean
  isExternalSelected: boolean
  isExpanded: boolean
  saveStatus: SaveStatus
  images: QuestionImageValue[]
  mode: DisplayMode
  typeColorMap: Record<string, string>
  typeLabelMap: Record<string, string>
  onToggleSelect: (qId: string) => void
  onToggleImages: (qId: string) => void
  onStemChange: (qId: string, newStem: string) => void
  onImagesChange: (newImages: QuestionImageValue[]) => void
  onToggleMode: (qId: string) => void
  onPickFromLibrary: () => void
  /** 当前题目的激活空白槽位索引（受控） */
  pendingBlankIndex?: number | null
  /** 激活空白槽位变更回调 */
  onPendingBlankChange?: (idx: number | null) => void
  /** 父组件下达的图片填入指令（消费后清除） */
  fillRequest?: import("@/components/upload/QuestionImageEditor").ImageFillRequest | null
  /** 填入指令消费完成回调 */
  onFillConsumed?: () => void
  /** 触发该题新增图片动作（外部"新增图片"按钮调用） */
  onAddImage?: () => void
  /** 请求删除该题（打开确认弹窗） */
  onDelete?: () => void
  /** 新增图片指令的递增 tick（每次外部点击按钮时自增） */
  addImageTick?: number
}

/**
 * 可拖拽题目行
 */
function SortableQuestionItem({
  question,
  index,
  isSelected,
  isExternalSelected,
  isExpanded,
  saveStatus,
  images,
  mode,
  typeColorMap,
  typeLabelMap,
  onToggleSelect,
  onToggleImages,
  onStemChange,
  onImagesChange,
  onToggleMode,
  onPickFromLibrary,
  pendingBlankIndex,
  onPendingBlankChange,
  fillRequest,
  onFillConsumed,
  onAddImage,
  onDelete,
  addImageTick = 0,
}: SortableQuestionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // 记录上次 addImageTick 变化值：父组件按钮触发时 tick 自增 → 内部 useEffect 检测到后
  // 通过 onImagesChange 给图片列表追加一个空白槽位（等价于 QuestionImageEditor 的"新增图片"）
  const lastAddTickRef = useRef<number>(addImageTick)
  useEffect(() => {
    if (addImageTick === lastAddTickRef.current) return
    lastAddTickRef.current = addImageTick
    // 计算新列表：在现有 images 末尾追加一个空白槽位
    const baseList = (images || []).map((img) => {
      if (typeof img === "string") return { path: img, type: "figure" }
      return {
        path: img.path || img.url || "",
        type: img.type || "figure",
        description: img.description,
      }
    })
    const newList: { path: string; type: string }[] = [
      ...baseList,
      { path: "", type: "blank" },
    ]
    onImagesChange(newList)
    // 通知父组件：高亮新增的空白槽位
    if (onPendingBlankChange) onPendingBlankChange(newList.length - 1)
  }, [addImageTick]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-question-id={question.id}
      className={cn(
        "relative flex items-start gap-2 p-3 pr-12 rounded-lg border transition-colors bg-white group",
        isDragging && "opacity-30",
        isExternalSelected
          ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-300 shadow-md"
          : isSelected
            ? "border-blue-400 bg-blue-50/50 ring-1 ring-blue-300"
            : "border-slate-100 hover:border-slate-200",
      )}
    >
      {/* 左侧：多选 checkbox + 拖拽手柄 + 题号 */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <button
          onClick={() => onToggleSelect(question.id)}
          className="p-0.5 rounded hover:bg-slate-100 transition-colors"
          title={isSelected ? "取消选中" : "选中"}
          aria-label={isSelected ? "取消选中" : "选中"}
        >
          {isSelected ? (
            <CheckSquare size={16} className="text-blue-600" />
          ) : (
            <Square size={16} className="text-slate-300" />
          )}
        </button>
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 rounded cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors"
          title="拖动排序（可多选）"
          aria-label="拖动排序"
        >
          <GripVertical size={16} />
        </button>
        <span className="text-xs font-medium text-slate-500">
          {index + 1}
        </span>
      </div>

      {/* 题目内容区 */}
      <div className="flex-1 min-w-0">
        {/* 题干显示：预览/编辑双模式 */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] text-slate-400 font-medium">
            {mode === "preview" ? "预览模式" : "编辑模式"}
          </span>
          <button
            onClick={() => onToggleMode(question.id)}
            className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded transition-colors",
              mode === "preview"
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "bg-amber-100 text-amber-700 hover:bg-amber-200",
            )}
            title={mode === "preview" ? "切换到编辑模式" : "切换到预览模式（保留表格/公式）"}
          >
            {mode === "preview" ? <Edit3 size={10} /> : <Eye size={10} />}
            {mode === "preview" ? "编辑" : "预览"}
          </button>
          {/* 外部选中提示（来自图片库点击） */}
          {isExternalSelected && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-blue-600">
              <Library size={10} />
              当前选中题（可在左侧图片库点击图片替换）
            </span>
          )}
          <SaveStatusIndicator status={saveStatus} />
        </div>

        {mode === "edit" ? (
          /* 编辑模式：contentEditable */
          <EditableStem
            value={question.stem || ""}
            onChange={(newStem) => onStemChange(question.id, newStem)}
          />
        ) : (
          /* 预览模式：渲染 Markdown/HTML/LaTeX/表格（保留表格结构） */
          <div
            className="preview-renderer prose prose-sm max-w-none px-2 py-1 rounded border border-transparent hover:border-slate-200 transition-colors cursor-text"
            onClick={() => onToggleMode(question.id)}
            title="点击切换到编辑模式"
          >
            <PreviewRenderer content={question.stem || ""} />
            {(!question.stem || question.stem.trim() === "") && (
              <span className="text-slate-300 italic text-sm">（题干为空，点击编辑）</span>
            )}
          </div>
        )}

        {/* 题型标签和图片/表格标记 + 新增图片按钮 */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-xs",
              typeColorMap[question.question_type || "general"] || typeColorMap.general
            )}
          >
            {typeLabelMap[question.question_type || "general"] || "通用"}
          </span>
          {/* 有图标记：点击展开/折叠图片区 */}
          <button
            onClick={() => onToggleImages(question.id)}
            className={cn(
              "flex items-center gap-0.5 text-xs rounded px-1.5 py-0.5 transition-colors",
              isExpanded
                ? "bg-blue-100 text-blue-600"
                : "bg-blue-50 text-blue-500 hover:bg-blue-100"
            )}
            title={isExpanded ? "折叠图片区" : "展开图片区"}
          >
            {isExpanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            <ImageIcon size={10} />
            图片({images.length})
          </button>
          {question.has_table && (
            <span className="text-xs text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded">
              含表格
            </span>
          )}
          {question.has_formula && (
            <span className="text-xs text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded">
              含公式
            </span>
          )}
          {/* 新增图片按钮（常驻可见，三态视觉反馈：hover/active/disabled） */}
          {onAddImage && (
            <button
              onClick={onAddImage}
              disabled={!onAddImage}
              className={cn(
                "group/btn flex items-center gap-0.5 text-xs rounded px-1.5 py-0.5",
                "border border-emerald-300 text-emerald-700 bg-emerald-50",
                "transition-all duration-150",
                "hover:bg-emerald-100 hover:border-emerald-400 hover:shadow-sm",
                "active:bg-emerald-200 active:border-emerald-500",
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-50 disabled:hover:border-emerald-300 disabled:hover:shadow-none",
                "focus:outline-none focus:ring-1 focus:ring-emerald-400",
              )}
              title="在当前题目下新增一张图片（先创建空白框，再到左侧图片库选择图片）"
            >
              <Plus
                size={10}
                className="transition-transform group-hover/btn:scale-110 group-active/btn:scale-95"
              />
              新增图片
            </button>
          )}
        </div>

        {/* 图片展开区域：集成 QuestionImageEditor */}
        {isExpanded && (
          <div className="mt-2 p-2 bg-slate-50 rounded border border-slate-100">
            <QuestionImageEditor
              images={images}
              onChange={onImagesChange}
              onPickFromLibrary={onPickFromLibrary}
              pendingBlankIndex={pendingBlankIndex}
              onPendingBlankChange={onPendingBlankChange}
              fillRequest={fillRequest}
              onFillConsumed={onFillConsumed}
              compact
            />
          </div>
        )}
      </div>

      {/* 题目右侧：删除按钮（固定于题目区域右上角） */}
      {onDelete && (
        <button
          onClick={onDelete}
          disabled={!onDelete}
          aria-label={`删除第 ${index + 1} 题`}
          title="删除该题（将弹出确认框）"
          className={cn(
            "absolute top-2 right-2 z-10",
            "flex items-center justify-center w-7 h-7 rounded-md",
            "border border-red-200 text-red-500 bg-white",
            "transition-all duration-150",
            "hover:bg-red-50 hover:border-red-400 hover:text-red-600 hover:shadow-sm",
            "active:bg-red-100 active:border-red-500 active:text-red-700",
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-red-200 disabled:hover:text-red-500 disabled:hover:shadow-none",
            "focus:outline-none focus:ring-1 focus:ring-red-400",
            "opacity-0 group-hover:opacity-100",
            // 选中或外部选中时始终可见
            (isSelected || isExternalSelected) && "opacity-100",
          )}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

// =============================================================================
// 子组件：EditableStem
// 题干即时编辑区：contentEditable + 自动保存
// =============================================================================

/** EditableStem 组件属性 */
interface EditableStemProps {
  value: string
  onChange: (newValue: string) => void
}

/**
 * 即时编辑题干（编辑模式专用）
 */
function EditableStem({ value, onChange }: EditableStemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isExternalUpdateRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.innerText !== value) {
      isExternalUpdateRef.current = true
      el.innerText = value
    }
  }, [value])

  const handleInput = () => {
    if (isExternalUpdateRef.current) {
      isExternalUpdateRef.current = false
      return
    }
    const el = ref.current
    if (!el) return
    onChange(el.innerText)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    document.execCommand("insertText", false, text)
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onPaste={handlePaste}
      onBlur={handleInput}
      className="min-h-[2rem] text-sm text-slate-700 leading-relaxed px-2 py-1 rounded border border-amber-300 bg-amber-50/30 focus:bg-white focus:outline-none transition-colors break-words whitespace-pre-wrap"
      data-placeholder="点击此处编辑题干..."
    />
  )
}

// =============================================================================
// 子组件：SaveStatusIndicator
// =============================================================================

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  switch (status) {
    case "saving":
      return (
        <span className="flex items-center gap-1 text-[10px] text-blue-500 shrink-0">
          <Loader2 size={10} className="animate-spin" />
          保存中
        </span>
      )
    case "saved":
      return (
        <span className="flex items-center gap-1 text-[10px] text-emerald-600 shrink-0">
          <Check size={10} />
          已保存
        </span>
      )
    case "error":
      return (
        <span className="text-[10px] text-red-500 shrink-0">保存失败</span>
      )
    case "dirty":
      return (
        <span className="text-[10px] text-amber-500 shrink-0" title="有未保存的修改">
          ●
        </span>
      )
    case "idle":
    default:
      return null
  }
}
