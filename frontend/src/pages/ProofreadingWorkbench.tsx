/**
 * 校对工作台 — 三栏布局 + 双栏对照编辑
 *
 * 功能：整卷校对的核心页面，三栏稳定布局 + Monaco双栏对照编辑
 * 布局：顶部标题栏 + 左240px校对导航 + 中360px属性控制 + 右flex双栏对照预览
 * 路由：/papers/:id
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { getQuestionsByPaper, updateQuestion, toggleBankStatus, setKnowledgePoints, batchBankImport, batchUpdateQuestions, batchDeleteQuestions, batchAutoAi } from "@/api/questions"
import { getPaper } from "@/api/papers"
import { exportProofreading, downloadExport } from "@/api/exports"
import type { Question, KnowledgePointItem } from "@/types/question"
import type { Paper } from "@/types/paper"
import StatsPanel from "@/components/proofreading/StatsPanel"
import QuestionNavigator from "@/components/proofreading/QuestionNavigator"
import AttributePanel from "@/components/proofreading/AttributePanel"
import QualityCheckGroup from "@/components/proofreading/QualityCheckGroup"
import { DEFAULT_AI_MODEL, parseModelId } from "@/api/aiProviders"
import AiModelSelector from "@/components/proofreading/AiModelSelector"
import BatchActionBar from "@/components/proofreading/BatchActionBar"
import DualPaneEditor from "@/components/question/DualPaneEditor"
import OptionLayoutInline from "@/components/question/OptionLayoutInline"
import SubQuestionLayoutInline from "@/components/question/SubQuestionLayoutInline"
import PluginSlot from "@/components/plugins/PluginSlot"
import { WORKBENCH_PLUGINS } from "@/config/plugins"
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts"
import { useAutoSave } from "@/hooks/useAutoSave"
import { questionToLatex, latexToQuestion, CHOICE_TYPES } from "@/utils/latexConverter"
import { ChevronLeft, ChevronRight, BookPlus, FileDown, ArrowLeft, X, FileText, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useSSEStore } from "@/stores/sseStore"

/* ========== 类型定义 ========== */

/**
 * 将后端 images 字段转换为前端 URL 字符串数组
 * 兼容两种格式：
 *   - string[]: 纯URL字符串
 *   - {path, type}[]: 后端截图产出的对象格式
 *
 * URL补全规则：
 *   - 以 http:// 或 https:// 开头 → 原样使用
 *   - 以 /data/ 开头 → 原样使用（Vite代理会处理）
 *   - 以 /images/ 开头 → 改为 /data/ + 原路径
 *   - 其他相对路径 → 改为 /data/images/ + 路径
 */
function normalizeImages(images: unknown[]): string[] {
  if (!images || !Array.isArray(images)) return []  // 空值或非数组直接返回
  return images.map((item) => {
    // 提取原始路径字符串
    let rawUrl = ""  // 原始URL
    if (typeof item === "string") {
      rawUrl = item  // 字符串格式直接使用
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>  // 对象格式提取path或url
      rawUrl = String(obj.path || obj.url || "")  // 优先取path，其次url
    }
    // 根据路径前缀补全URL
    if (!rawUrl) return ""  // 空路径跳过
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl  // 绝对URL原样使用
    if (rawUrl.startsWith("/data/")) return rawUrl  // 已有/data/前缀，Vite代理会处理
    if (rawUrl.startsWith("/images/")) return "/data" + rawUrl  // /images/ → /data/images/
    return "/data/images/" + rawUrl  // 其他相对路径补全为 /data/images/ + 路径
  }).filter((url) => url.length > 0)  // 过滤空字符串
}

/** 校对统计数据 */
interface ProofreadingStats {
  total: number
  in_bank: number
  not_in_bank: number
  error: number
  has_warning: number
  missing_knowledge: number
  has_figure: number
  has_formula: number
  has_table: number
  by_type: Record<string, number>
}

/** AI 弹窗类型 */
// 已移除：AI 弹窗状态改为插件内部管理

/* ========== 判断题型是否"类似选择题"（用于控制预览是否显示 ABCD 标签） ========== */

/**
 * 判断题型是否类似选择题
 *
 * 功能：判断当前题目是否应该用 (A)/(B)/(C)/(D) 标签
 *       用于控制 KaTeX 预览区是否显示选项标签
 * 输入参数：questionType — 题型字符串
 * 返回值：true = 选择题（显示 ABCD），false = 计算题/其他（不显示）
 * 使用场景：ProofreadingWorkbench 渲染 DualPaneEditor 时传入 tasksRenderOptions
 *
 * 判断规则：与 latexConverter.CHOICE_TYPES 一致
 *   - single_choice / multi_choice / single → true
 *   - calculation / fill / general 等 → false
 */
function isChoiceLikeQuestion(questionType: string | null | undefined): boolean {
  if (!questionType) return false                          // 空值兜底
  return CHOICE_TYPES.has(questionType)                    // 委托给 CHOICE_TYPES
}

/* ========== 判断题型是否"计算题"（用于控制分列控件是否显示） ========== */

/**
 * 判断题型是否计算题
 *
 * 功能：判断当前题目是否应该用"分列"控件（控制是否渲染 SubQuestionLayoutInline）
 * 输入参数：questionType — 题型字符串
 * 返回值：true = 计算题（显示分列控件），false = 其他
 * 使用场景：ProofreadingWorkbench 渲染 DualPaneEditor 时传入 titleExtra
 *
 * 判断规则：
 *   - 新标准 key：calculation → true
 *   - 兼容旧 key：calc → true
 *   - 其他（选择/填空/判断/操作/解决问题等）→ false
 */
function isCalcLikeQuestion(questionType: string | null | undefined): boolean {
  if (!questionType) return false                          // 空值兜底
  // 仅 calculation（标准）+ calc（兼容旧）视为计算题
  return questionType === "calculation" || questionType === "calc"
}

/* ========== 计算校对统计 ========== */

function computeStats(questions: Question[]): ProofreadingStats {
  const stats: ProofreadingStats = {
    total: questions.length,
    in_bank: 0,
    not_in_bank: 0,
    error: 0,
    has_warning: 0,
    missing_knowledge: 0,
    has_figure: 0,
    has_formula: 0,
    has_table: 0,
    by_type: {},
  }

  for (const q of questions) {
    if (q.in_bank) {
      stats.in_bank += 1
    } else {
      stats.not_in_bank += 1
    }
    if (q.question_status === "error") {
      stats.error += 1
    }
    if (q.has_warning) {
      stats.has_warning += 1
    }
    if (!q.knowledge_points || q.knowledge_points.length === 0) {
      stats.missing_knowledge += 1
    }
    if (q.has_figure) stats.has_figure += 1
    if (q.has_formula) stats.has_formula += 1
    if (q.has_table) stats.has_table += 1
    const typeKey = q.question_type || "general"
    stats.by_type[typeKey] = (stats.by_type[typeKey] || 0) + 1
  }

  return stats
}

/* ========== 主组件 ========== */

export default function ProofreadingWorkbench() {
  const { id: paperId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addGlobalLog = useSSEStore((s) => s.addLog)

  /* ========== 状态 ========== */

  const [questions, setQuestions] = useState<Question[]>([])
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  // 组卷纸张格式选择弹窗开关
  const [composePickerOpen, setComposePickerOpen] = useState(false)
  // 组卷草稿创建中的 loading
  const [composing, setComposing] = useState(false)
  // 试卷元信息（含 subject，用于知识点智能创建）
  const [paperMeta, setPaperMeta] = useState<Paper | null>(null)
  // AI 批量补全状态
  const [autoAiFilling, setAutoAiFilling] = useState(false)

  // AI模型选择 — 默认智谱 GLM-4v-flash
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL)

  // 将 aiModel 状态转为 AI API 需要的供应商/实例/模型选择格式
  // modelId 格式：providerName|instanceName|modelName
  // 使用 useMemo 缓存派生对象，避免每次渲染重建导致 loadQuestions 依赖变化
  const parsed = useMemo(() => parseModelId(aiModel.modelId), [aiModel.modelId])
  const aiSelection = useMemo(() => ({
    provider_key: aiModel.providerId,             // 供应商名称（如 智谱AI / DeepSeek）
    instance_name: parsed?.instanceName || "default", // 实例名称
    model_key: parsed?.modelName || "",           // 模型名称
  }), [aiModel.providerId, parsed])
  // 驼峰版（用于 KnowledgePointPicker 内部）
  const aiSelectionCamel = useMemo(() => ({
    providerKey: aiModel.providerId,
    instanceName: parsed?.instanceName || "default",
    modelKey: parsed?.modelName || "",
  }), [aiModel.providerId, parsed])

  // 使用 ref 保存 aiSelection，避免 loadQuestions 因 aiSelection 变化而重建
  const aiSelectionRef = useRef(aiSelection)
  // 在 effect 中同步 ref 值，避免 render 阶段修改 ref
  useEffect(() => {
    aiSelectionRef.current = aiSelection
  }, [aiSelection])

  // 计算统计数据
  const stats = computeStats(questions)

  // 获取当前题目对象
  const currentQuestion = questions.find((q) => q.id === currentId) || null

  // 当前题目索引
  const currentIndex = questions.findIndex((q) => q.id === currentId)

  /* ========== 数据加载 ========== */

  const loadQuestions = useCallback(async () => {
    if (!paperId) return                                     // 没有 paperId 直接返回
    setLoading(true)
    try {
      // 1) 加载试卷元信息（含 subject）
      const paper = await getPaper(paperId)
      setPaperMeta(paper)
      addGlobalLog(`试卷：${paper.filename}（${paper.subject}）`, "ok")

      // 2) 加载题目列表
      const data = await getQuestionsByPaper(paperId)
      // 防御性检查：确保返回的是数组
      const safeData = Array.isArray(data) ? data : []
      setQuestions(safeData)
      addGlobalLog(`加载题目: ${safeData.length} 题`, "ok")
      if (safeData.length > 0 && !currentId) {
        setCurrentId(safeData[0].id)
      }

      // 3) 触发 AI 批量补全（异步执行，不阻塞 UI）
      //    仅对未标注的题目执行；已在 useEffect 中按 paperId 去重避免重复
      //    使用 ref 获取当前 AI 选择，避免依赖 aiSelection 导致 loadQuestions 重建
      const currentAiSelection = aiSelectionRef.current
      setAutoAiFilling(true)
      batchAutoAi(paperId, currentAiSelection)
        .then((res) => {
          if (res && typeof res.filled === "number" && res.filled > 0) {
            addGlobalLog(`AI 批量补全：${res.filled} 道题（失败 ${res.failed || 0}）`, "ok")
            toast.success(`AI 已自动补全 ${res.filled} 道题的难度和知识点`)
            // 重新拉取题目列表以获取新数据
            return getQuestionsByPaper(paperId).then((fresh) => {
              const safeFresh = Array.isArray(fresh) ? fresh : []
              setQuestions(safeFresh)
            })
          } else if (res && res.message) {
            addGlobalLog(res.message, res.failed > 0 ? "warn" : "ok")
          }
        })
        .catch((err) => {
          console.error("AI 批量补全失败:", err)
          addGlobalLog("AI 批量补全失败，可在系统设置检查 AI 服务", "err")
        })
        .finally(() => {
          setAutoAiFilling(false)
        })
    } catch (err) {
      console.error("加载题目失败:", err)
      addGlobalLog("加载题目失败", "err")
      toast.error("加载题目失败")
    } finally {
      setLoading(false)
    }
  }, [paperId, currentId, addGlobalLog])               // batchAiTriggeredFor ref 保证只执行一次

  // 用 ref 记录是否已为该 paper 触发过批量补全（避免 React 18 严格模式下 effect 跑两次）
  const batchAiTriggeredFor = useRef<string | null>(null)
  useEffect(() => {
    if (!paperId) return
    if (batchAiTriggeredFor.current === paperId) return                  // 已触发过则跳过
    batchAiTriggeredFor.current = paperId
    // 异步包装避免 lint 误报
    queueMicrotask(() => {
      void loadQuestions()
    })
  }, [paperId, loadQuestions])                              // loadQuestions 现在稳定（仅依赖 paperId + addGlobalLog）

  /* ========== 筛选逻辑 ========== */

  const filteredQuestions = questions.filter((q) => {
    if (activeFilter === "total") return true
    if (activeFilter === "in_bank" && !q.in_bank) return false
    if (activeFilter === "not_in_bank" && q.in_bank) return false
    if (activeFilter === "error" && q.question_status !== "error") return false
    if (activeFilter === "has_warning" && !q.has_warning) return false
    if (activeFilter === "missing_knowledge" && q.knowledge_points && q.knowledge_points.length > 0) return false
    if (activeFilter === "has_figure" && !q.has_figure) return false
    return true
  })

  /* ========== 导航操作 ========== */

  const goToPrev = () => {
    const idx = filteredQuestions.findIndex((q) => q.id === currentId)
    if (idx > 0) setCurrentId(filteredQuestions[idx - 1].id)
  }

  const goToNext = () => {
    const idx = filteredQuestions.findIndex((q) => q.id === currentId)
    if (idx < filteredQuestions.length - 1) setCurrentId(filteredQuestions[idx + 1].id)
  }

  const handleSelect = (id: string) => {
    setCurrentId(id)
  }

  const handleMultiSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const handleFilterChange = (filter: string | null) => {
    if (activeFilter === filter) {
      setActiveFilter(null)
    } else {
      setActiveFilter(filter)
    }
  }

  /* ========== 题目操作 ========== */

  const handleUpdateField = useCallback(async (field: string, value: unknown) => {
    if (!currentQuestion) return
    try {
      await updateQuestion(currentQuestion.id, { [field]: value })
      setQuestions((prev) =>
        prev.map((q) => (q.id === currentQuestion.id ? { ...q, [field]: value } : q))
      )
    } catch (err) {
      console.error("更新失败:", err)
      toast.error("更新失败")
    }
  }, [currentQuestion])

  const handleToggleBank = useCallback(async () => {
    if (!currentQuestion) return
    try {
      const res = await toggleBankStatus(currentQuestion.id)
      setQuestions((prev) =>
        prev.map((q) => (q.id === currentQuestion.id ? { ...q, in_bank: res.in_bank } : q))
      )
      toast.success(res.in_bank ? "已入库" : "已取消入库")
    } catch (err) {
      console.error("操作失败:", err)
      toast.error("操作失败")
    }
  }, [currentQuestion])

  const handleKnowledgeChange = useCallback(async (items: KnowledgePointItem[]) => {
    if (!currentQuestion) return
    try {
      // 仅把 ID 列表发送给后端（后端存储字段是 ID 列表）
      const ids = items.map((it) => it.id)
      await setKnowledgePoints(currentQuestion.id, ids)
      if (paperId) {
        const data = await getQuestionsByPaper(paperId)
        setQuestions(data)
      }
      toast.success("知识点已更新")
    } catch (err) {
      console.error("更新知识点失败:", err)
      toast.error("更新知识点失败")
    }
  }, [currentQuestion, paperId])

  // 插件 Props：核心注入给所有插件的数据
  const pluginProps = useMemo(() => ({
    paperId: paperId || "",
    currentQuestion,
    questions,
    onUpdateField: handleUpdateField,
    onToggleBank: handleToggleBank,
    onRefresh: async () => {
      if (paperId) {
        const data = await getQuestionsByPaper(paperId)
        setQuestions(data)
      }
    },
    onNavigate: (id: string) => setCurrentId(id),
    onKnowledgeChange: handleKnowledgeChange,
    aiSelection,
    selectedIds,
  }), [paperId, currentQuestion, questions, handleUpdateField, handleToggleBank, handleKnowledgeChange, aiSelection, selectedIds])

  const handleBatchImport = async () => {
    const importableIds = questions
      .filter((q) => !q.in_bank && q.question_status !== "error" && q.knowledge_points && q.knowledge_points.length > 0)
      .map((q) => q.id)

    if (importableIds.length === 0) {
      toast.info("没有可入库的题目")
      return
    }

    try {
      const res = await batchBankImport(importableIds)
      if (paperId) {
        const data = await getQuestionsByPaper(paperId)
        setQuestions(data)
      }
      toast.success(`已入库 ${res.imported} 题，跳过 ${res.skipped} 题`)
    } catch (err) {
      console.error("批量入库失败:", err)
      toast.error("批量入库失败")
    }
  }

  const handleBatchUpdate = async (ids: string[], field: string, value: unknown) => {
    try {
      await batchUpdateQuestions(ids, { [field]: value })
      if (paperId) {
        const data = await getQuestionsByPaper(paperId)
        setQuestions(data)
      }
      setSelectedIds([])
    } catch (err) {
      console.error("批量修改失败:", err)
      toast.error("批量修改失败")
    }
  }

  const handleBatchBankImport = async (ids: string[]) => {
    try {
      const res = await batchBankImport(ids)
      if (paperId) {
        const data = await getQuestionsByPaper(paperId)
        setQuestions(data)
      }
      setSelectedIds([])
      toast.success(`已入库 ${res.imported} 题`)
    } catch (err) {
      console.error("批量入库失败:", err)
      toast.error("批量入库失败")
    }
  }

  const handleBatchDelete = async (ids: string[]) => {
    try {
      const res = await batchDeleteQuestions(ids)
      if (paperId) {
        const data = await getQuestionsByPaper(paperId)
        setQuestions(data)
      }
      setSelectedIds([])
      const deleted = res?.deleted ?? ids.length
      toast.success(`已删除 ${deleted} 道题`)
    } catch (err) {
      console.error("批量删除失败:", err)
      toast.error("批量删除失败")
    }
  }

  /* ========== 入库检查操作 ========== */

  const handleCheckAction = (action: string) => {
    switch (action) {
      case "view_params":
        toast.info("解析参数查看功能开发中")
        break
      case "pending_bank":
        handleFilterChange("not_in_bank")
        break
      case "group_before_bank":
        toast.info("入库前组题功能开发中")
        break
      case "missing_knowledge":
        handleFilterChange("missing_knowledge")
        break
      case "figure_mount":
        handleFilterChange("has_figure")
        break
    }
  }

  /* ========== 快捷键 & 草稿 ========== */

  useKeyboardShortcuts({
    "ArrowUp": goToPrev,
    "ArrowDown": goToNext,
  })

  const { hasDraft, restoreDraft, clearDraft } = useAutoSave({
    paperId: paperId || "",
    questionId: currentId || "",
    data: currentQuestion ? {
      stem: currentQuestion.stem,
      answer: currentQuestion.answer,
      analysis: currentQuestion.analysis,
      question_type: currentQuestion.question_type,
      difficulty: currentQuestion.difficulty,
    } : {},
  })

  useEffect(() => {
    if (hasDraft && currentQuestion) {
      const draft = restoreDraft()
      if (draft) {
        toast.info("检测到未保存的草稿", {
          action: {
            label: "恢复",
            onClick: () => {
              handleUpdateField("stem", (draft as Record<string, unknown>).stem || currentQuestion.stem)
              handleUpdateField("answer", (draft as Record<string, unknown>).answer || currentQuestion.answer)
              handleUpdateField("analysis", (draft as Record<string, unknown>).analysis || currentQuestion.analysis)
              clearDraft()
              toast.success("草稿已恢复")
            },
          },
          duration: 5000,
        })
      }
    }
  }, [hasDraft, currentId, clearDraft, currentQuestion, handleUpdateField, restoreDraft])

  /* ========== 组卷：选择纸张格式 ========== */

  /**
   * 处理选择纸张格式：创建草稿 + 跳转组卷页
   * 输入参数：paperSize - 选中的纸张格式 "A3" | "A4"
   * 返回值：无
   */
  const handlePickComposePaper = async (paperSize: "A3" | "A4") => {
    if (composing) return
    setComposing(true)
    try {
      const { createHomework } = await import("@/api/homework")
      const hw = await createHomework({
        paper_id: paperId || undefined,
        page_config: { paper_size: paperSize },
      } as Record<string, unknown>)
      toast.success("组卷草稿已创建")
      setComposePickerOpen(false)
      navigate(`/homework/${hw.id}/compose`)
    } catch (err) {
      console.error("创建组卷草稿失败:", err)
      toast.error("创建组卷草稿失败，请重试")
      // 失败时仍可让用户进入新建组卷页手动选择纸张
      setComposePickerOpen(false)
      navigate("/homework/compose/new")
    } finally {
      setComposing(false)
    }
  }

  /* ========== 导出校对稿 ========== */

  const handleExportProofreading = async () => {
    if (!paperId) return
    setExporting(true)
    try {
      const res = await exportProofreading(paperId)
      toast.success("校对稿已生成，正在下载...")
      if (res.id) {
        const blob = await downloadExport(res.id)
        const url = window.URL.createObjectURL(new Blob([blob]))
        const link = document.createElement("a")
        link.href = url
        link.setAttribute("download", `校对稿_${paperId}.pdf`)
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error("导出校对稿失败:", err)
      toast.error("导出校对稿失败")
    } finally {
      setExporting(false)
    }
  }

  /* ========== 渲染 ========== */

  return (
    <div className="flex flex-col h-full">
      {/* ====== 顶部标题栏 ====== */}
      <div className="bg-white border-b border-slate-200 shrink-0">
        {/* 主标题行 */}
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                // 优先返回该试卷的分题页面；无 paperId 时退回题库中心
                if (paperId) {
                  navigate(`/papers/${paperId}/split`)
                } else {
                  navigate("/")
                }
              }}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-blue-600 transition-colors"
            >
              <ArrowLeft size={16} />
              返回分题页面
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <h1 className="text-base font-semibold text-slate-800">校对工作台</h1>
          </div>
          <div className="flex items-center gap-3">
            <AiModelSelector
              value={aiModel}
              onChange={setAiModel}
            />
            <div className="w-px h-5 bg-slate-200" />
            <button
              onClick={() => setComposePickerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              title="基于当前试卷快速组卷"
            >
              <BookPlus size={14} />
              组卷
            </button>
          </div>
        </div>
        {/* 副标题行 */}
        <div className="px-4 pb-2 text-xs text-slate-400">
          上传原卷生成解析结果后，逐题校对、补图、修正公式，再保存入库
        </div>
      </div>

      {/* ====== 三栏主体 ====== */}
      <div className="flex-1 overflow-hidden" style={{ display: "grid", gridTemplateColumns: "240px 360px 1fr" }}>
        {/* ---- 左栏：校对导航面板（固定240px） ---- */}
        <div className="border-r border-slate-200 bg-white overflow-y-auto flex flex-col">
          {/* 区域一：校对统计 */}
          <StatsPanel
            stats={stats}
            activeFilter={activeFilter}
            onFilterChange={handleFilterChange}
          />

          {/* 区域二：入库检查组 */}
          <div className="border-t border-slate-200">
            <QualityCheckGroup
              checks={{
                canViewParams: true,
                pendingBankCount: stats.not_in_bank,
                canGroupBeforeBank: stats.not_in_bank > 1,
                missingKnowledgeIds: questions
                  .filter((q) => !q.knowledge_points || q.knowledge_points.length === 0)
                  .map((q) => q.id),
                figureMountIssues: questions
                  .filter((q) => q.has_figure && (!q.images || q.images.length === 0))
                  .map((q) => q.id),
              }}
              onCheckAction={handleCheckAction}
            />
          </div>

          {/* 区域三：题号导航网格 */}
          <div className="flex-1 border-t border-slate-200">
            <QuestionNavigator
              questions={filteredQuestions}
              currentId={currentId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onMultiSelect={handleMultiSelect}
            />
          </div>
        </div>

        {/* ---- 中栏：属性编辑面板（固定360px） ---- */}
        <div className="border-r border-slate-200 bg-white overflow-y-auto">
          <AttributePanel
            question={currentQuestion}
            onUpdateField={handleUpdateField}
            onToggleBank={handleToggleBank}
            onKnowledgeChange={handleKnowledgeChange}
            onBatchBankImport={handleBatchBankImport}
            onDeleteQuestion={async () => {
              if (!currentQuestion) return
              try {
                const { deleteQuestion } = await import("@/api/questions")
                await deleteQuestion(currentQuestion.id)
                if (paperId) {
                  const data = await getQuestionsByPaper(paperId)
                  setQuestions(data)
                }
                toast.success("题目已删除")
              } catch (err) {
                console.error("删除题目失败:", err)
                toast.error("删除失败")
              }
            }}
            selectedIds={selectedIds}
            paperSubject={paperMeta?.subject}                              // 试卷学科（用于 AI 智能创建）
            aiSelection={aiSelectionCamel}                                  // AI 供应商/模型（驼峰版给 Picker）
          />
          {/* 插件槽：题图管理（原内置 ImageManagerPanel 剥离） */}
          <div className="border-t border-slate-200 p-3">
            <PluginSlot
              mountPoint="image-manager"
              pluginProps={pluginProps}
              plugins={WORKBENCH_PLUGINS}
            />
          </div>
          {/* AI 批量补全进行中提示 */}
          {autoAiFilling && (
            <div className="px-4 py-2 text-xs text-blue-600 bg-blue-50 border-t border-blue-100 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              AI 正在为缺失标注的题目自动补全难度和知识点...
            </div>
          )}
          {/* 插件槽：AI 难度打分、AI 知识点匹配 */}
          <div className="border-t border-slate-200 px-4 py-2 flex flex-wrap gap-2">
            <PluginSlot
              mountPoint="attribute-panel"
              pluginProps={pluginProps}
              plugins={WORKBENCH_PLUGINS}
            />
          </div>
        </div>

        {/* ---- 右栏：双栏对照编辑区（自适应，最小600px） ---- */}
        <div className="overflow-y-auto bg-slate-50 flex flex-col" style={{ minWidth: "600px" }}>
          {currentQuestion ? (
            <div className="flex-1 flex flex-col p-3 gap-3">
              {/* 题目内容 — 当前 LaTeX 源码（latex_source 优先，否则从 stem+options 生成） */}
              {(() => {
                // 题目 LaTeX 源码（用于 DualPaneEditor 和分行控件共享）
                const stemLatex = currentQuestion.latex_source
                  || questionToLatex(currentQuestion.stem, currentQuestion.options, currentQuestion.question_type)
                // 是否选择题（决定是否显示分行控件）
                const isChoice = isChoiceLikeQuestion(currentQuestion.question_type)
                // 是否计算题（决定是否显示分列控件）
                const isCalc = isCalcLikeQuestion(currentQuestion.question_type)
                /**
                 * 处理题目内容变更
                 * 功能：统一的 stem/latex 写入入口，供编辑器和分行控件复用
                 *       - 已有 latex_source：直接同步更新 latex_source + stem
                 *       - 没有 latex_source：解析后写入 stem + options
                 * 输入参数：val — 新的 LaTeX 源码
                 * 返回值：无（异步写入）
                 */
                const handleStemChange = async (val: string) => {
                  if (currentQuestion.latex_source) {
                    // LaTeX 源码编辑：同时更新 latex_source 和 stem，确保持久化
                    try {
                      await updateQuestion(currentQuestion.id, { latex_source: val, stem: val })
                      setQuestions((prev) =>
                        prev.map((q) =>
                          q.id === currentQuestion.id
                            ? { ...q, latex_source: val, stem: val }
                            : q
                        )
                      )
                    } catch (err) {
                      console.error("更新失败:", err)
                      toast.error("更新失败")
                    }
                  } else {
                    // 无 latex_source：解析后写入 stem + options
                    const parsed = latexToQuestion(val, currentQuestion.question_type)
                    handleUpdateField("stem", parsed.stem)
                    if (parsed.options.length > 0) {
                      handleUpdateField("options", parsed.options)
                    }
                  }
                }
                return (
                  <DualPaneEditor
                    value={stemLatex}
                    onChange={handleStemChange}
                    title="题目内容"
                    height="45%"
                    images={normalizeImages(currentQuestion.images)}
                    imagePosition="after-stem"
                    tasksRenderOptions={{
                      showLabels: isChoice,                                          // 选择题显示 ABCD，计算题/其他不显示
                      columnGap: "2em",                                              // 同行选项之间间距
                    }}
                    titleExtra={isChoice ? (
                      // 分行控件：仅选择题显示，绑定到题目内容
                      <OptionLayoutInline
                        value={stemLatex}
                        onChange={handleStemChange}
                        questionType={currentQuestion.question_type}
                        options={currentQuestion.options}
                        stem={currentQuestion.stem}
                      />
                    ) : isCalc ? (
                      // 分列控件：仅计算题显示，绑定到题目内容（与分行控件同位置同 UI）
                      <SubQuestionLayoutInline
                        value={stemLatex}
                        onChange={handleStemChange}
                        questionType={currentQuestion.question_type}
                      />
                    ) : undefined}
                    titleRight={
                      // 标题栏最右侧插件槽：word编辑 等
                      <PluginSlot
                        mountPoint="title-right"
                        pluginProps={pluginProps}
                        plugins={WORKBENCH_PLUGINS}
                      />
                    }
                  />
                )
              })()}

              {/* 解析内容编辑（已剥离为插件，挂载点 analysis-editor） */}
              <PluginSlot
                mountPoint="analysis-editor"
                pluginProps={pluginProps}
                plugins={WORKBENCH_PLUGINS}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center text-slate-400">
                <p className="text-lg mb-1">暂无题目内容</p>
                <p className="text-sm">请先上传套卷进行解析</p>
              </div>
            </div>
          )}
          {/* 插件槽：AI 生成解析、AI 拆分子题、AI 修正错别字、AI 标准化题干 */}
          <div className="border-t border-slate-200 px-3 py-2 flex flex-wrap gap-2">
            <PluginSlot
              mountPoint="editor-bottom"
              pluginProps={pluginProps}
              plugins={WORKBENCH_PLUGINS}
            />
            <PluginSlot
              mountPoint="editor-side"
              pluginProps={pluginProps}
              plugins={WORKBENCH_PLUGINS}
            />
          </div>
        </div>
      </div>

      {/* ====== 批量操作栏（选中题目后显示） ====== */}
      <BatchActionBar
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
        onBatchUpdate={handleBatchUpdate}
        onBatchBankImport={handleBatchBankImport}
        onBatchDelete={handleBatchDelete}
      />

      {/* 组卷纸张格式选择弹窗 */}
      {composePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => !composing && setComposePickerOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[92vw] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 弹窗标题栏 */}
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-1.5">
                <FileText size={16} className="text-blue-600" />
                选择试卷纸张格式
              </h2>
              <button
                onClick={() => setComposePickerOpen(false)}
                disabled={composing}
                className="p-1 text-slate-400 hover:text-slate-600 rounded disabled:opacity-30"
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              选好格式后，画布布局将自动适配（A4 单列 / A3 双列）。本次组卷将自动带入当前试卷的学科 / 年级信息。
            </p>

            {/* 纸张选项 */}
            <div className="space-y-2.5">
              {/* A4 校本作业 */}
              <button
                onClick={() => handlePickComposePaper("A4")}
                disabled={composing}
                className="w-full flex items-center gap-3 p-3.5 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/30 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div
                  className="w-10 h-14 border-2 border-slate-300 rounded shrink-0 flex items-center justify-center bg-slate-50"
                  style={{ aspectRatio: "210/297" }}
                >
                  <div className="w-5 h-9" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">A4 — 校本作业</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">单列排版，适合校内日常作业与练习</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">尺寸：210 × 297 mm</div>
                </div>
              </button>
              {/* A3 标准试卷 */}
              <button
                onClick={() => handlePickComposePaper("A3")}
                disabled={composing}
                className="w-full flex items-center gap-3 p-3.5 border-2 border-slate-200 rounded-lg hover:border-blue-500 hover:bg-blue-50/30 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div
                  className="w-12 h-16 border-2 border-slate-300 rounded shrink-0 flex items-center justify-center bg-slate-50"
                  style={{ aspectRatio: "297/420" }}
                >
                  <div className="flex gap-0.5 w-7 h-9">
                    <div className="flex-1 border-r border-slate-400" />
                    <div className="flex-1" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800">A3 — 标准试卷</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">双列排版，适合正式考试与标准化试卷</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">尺寸：297 × 420 mm</div>
                </div>
              </button>
            </div>

            {/* 加载提示 */}
            {composing && (
              <div className="mt-3 text-center text-xs text-blue-600">正在创建组卷草稿…</div>
            )}
          </div>
        </div>
      )}

      {/* ====== 底部固定操作栏 ====== */}
      <div className="bg-white border-t border-slate-200 px-6 py-2 flex items-center justify-between shrink-0">
        {/* 左侧：上下题导航 */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrev}
            disabled={currentIndex <= 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={14} />
            上一题
          </button>
          <button
            onClick={goToNext}
            disabled={currentIndex >= filteredQuestions.length - 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            下一题
            <ChevronRight size={14} />
          </button>
        </div>

        {/* 中间：题号指示器 */}
        <div className="text-sm text-slate-500">
          {currentQuestion
            ? `第 ${currentIndex + 1}/${filteredQuestions.length} 题`
            : "未选择题目"
          }
          {selectedIds.length > 0 && (
            <span className="ml-3 text-blue-600">已选 {selectedIds.length} 题</span>
          )}
        </div>

        {/* 右侧：插件工具栏 + 导出 + 一键入库 */}
        <div className="flex items-center gap-2">
          {/* 插件槽：AI 批量标准化、质量检查 */}
          <PluginSlot
            mountPoint="toolbar"
            pluginProps={pluginProps}
            plugins={WORKBENCH_PLUGINS}
          />
          <button
            onClick={handleExportProofreading}
            disabled={exporting || questions.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileDown size={16} />
            {exporting ? "导出中..." : "导出校对稿"}
          </button>
          <button
            onClick={handleBatchImport}
            disabled={stats.not_in_bank === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <BookPlus size={16} />
            一键入库
            {stats.not_in_bank > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-green-600 rounded text-xs">
                {stats.not_in_bank - stats.error}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
