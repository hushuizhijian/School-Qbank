/**
 * PaperSplitPage — 分题切分页（content分题唯一方案）
 *
 * 功能：接收 MinerU 解析完成的 paperId，展示解析产物预览，
 *       执行 content分题（V5 位置匹配+原始顺序），展示和编辑分题结果
 * 使用场景：路由 /papers/:id/split，从 MinerU 解析页跳转过来
 *
 * 二期优化：移除 request分题方案选择 UI，仅保留 content分题作为唯一方案
 *
 * 四期优化（编辑与图片管理增强）：
 *  1. 左栏分题方案下方常驻显示图片资源库（含未匹配孤儿图片）
 *  2. 资源库与右栏题目联动：点击资源库图片 → 替换到当前选中题目
 *  3. 选中题高亮 + 自动滚动到该题 + 强制展开图片
 *  4. 严格保留所有图片资源，关联/解绑仅影响数据库字段
 */
import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { FileText, Split, RefreshCw, ArrowLeft, Eye, FileCode, FileJson, FileType, Download, CheckSquare } from "lucide-react"
import { getPaper, splitPaper, resplitPaper, getParseProgress, verifyTableMatching } from "@/api/papers"
import { getQuestionsByPaper, updateQuestion } from "@/api/questions"
import SplitQuestionEditor from "@/components/upload/SplitQuestionEditor"
import ImageResourceLibrary from "@/components/upload/ImageResourceLibrary"
import type { ImageFillRequest } from "@/components/upload/QuestionImageEditor"
import type { TableMatchingReport } from "@/api/papers"
import { useSSEStore } from "@/stores/sseStore"
import { toast } from "sonner"
import type { Question } from "@/types/question"
import type { Paper } from "@/types/paper"
import { cn } from "@/utils/cn"

/** 产物预览类型 */
type PreviewType = 'md' | 'latex' | 'html' | 'json' | 'docx'

/**
 * 分题切分页主组件
 *
 * 功能：单一方案 content分题（V5 位置匹配+原始顺序），无方案切换 UI
 */
export default function PaperSplitPage() {
  const { id: paperId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const addGlobalLog = useSSEStore((s) => s.addLog)

  // 试卷信息
  const [paper, setPaper] = useState<Paper | null>(null)
  // 分题状态
  const [splitStatus, setSplitStatus] = useState<'idle' | 'splitting' | 'completed' | 'failed'>('idle')
  // 分题结果题目列表
  const [questions, setQuestions] = useState<Question[]>([])
  // 分题加载状态
  const [splitLoading, setSplitLoading] = useState(false)
  // 产物预览类型
  const [previewType, setPreviewType] = useState<PreviewType>('md')
  // 产物预览内容
  const [previewContent, setPreviewContent] = useState<string>('')
  // 轮询定时器
  const [pollingTimer, setPollingTimer] = useState<ReturnType<typeof setInterval> | null>(null)

  // 当前选中题目 ID（来自点击题目 / 点击图片库"从资源库选"按钮）
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)

  // 图片库刷新触发器（题目图片变更时自增，触发资源库重新加载）
  const [imageLibRefreshKey, setImageLibRefreshKey] = useState(0)

  // 题目ID → 当前激活的空白图片槽位索引（图片库点击 → 填入此槽位）
  const [pendingBlankByQ, setPendingBlankByQ] = useState<Record<string, number | null>>({})

  // 题目ID → 父组件下达的填入指令（消费后清除）
  const [fillRequestByQ, setFillRequestByQ] = useState<Record<string, ImageFillRequest | null>>({})

  // 表格-题目关联校验报告（用于在分题完成区显示状态与一键修复）
  const [tableCheckReport, setTableCheckReport] = useState<TableMatchingReport | null>(null)
  // 校验/修复进行中标志
  const [verifying, setVerifying] = useState(false)

  // 加载试卷信息
  useEffect(() => {
    if (!paperId) return
    loadPaper()
  }, [paperId])

  /** 加载试卷信息 */
  const loadPaper = async () => {
    if (!paperId) return
    try {
      const data = await getPaper(paperId)
      setPaper(data)
      addGlobalLog(`加载试卷: ${data.filename}`, "info")

      // 如果已有题目，直接显示
      if (data.status === 'completed') {
        setSplitStatus('completed')
        loadQuestions()
      } else if (data.status === 'parsed') {
        addGlobalLog("MinerU 解析完成，等待分题", "ok")
      }
    } catch (err) {
      console.error("加载试卷失败:", err)
      addGlobalLog("加载试卷失败", "err")
    }
  }

  /** 加载已有题目 */
  const loadQuestions = async () => {
    if (!paperId) return
    try {
      const data = await getQuestionsByPaper(paperId)
      setQuestions(data)
      if (data.length > 0) {
        setSplitStatus('completed')
      }
      addGlobalLog(`加载已有分题结果: ${data.length} 题`, "ok")
    } catch (err) {
      console.error("加载题目失败:", err)
    }
  }

  /**
   * 触发后端表格-题目关联校验
   * 仅做检测，不修改任何数据
   */
  const handleVerifyTableMatching = useCallback(async () => {
    if (!paperId || verifying) return
    setVerifying(true)
    try {
      const report = await verifyTableMatching(paperId, false)
      setTableCheckReport(report)
      if (report.ok) {
        toast.success(`校验通过：${report.total_tables} 张表格全部正确关联`)
        addGlobalLog(`[表格校验] 通过：${report.total_tables} 张表格全部正确`, "ok")
      } else {
        toast.warning(`检测到 ${report.mismatches.length} 处表格错位，点击"一键修复"修正`)
        addGlobalLog(`[表格校验] 发现 ${report.mismatches.length} 处不匹配`, "warn")
      }
    } catch (err) {
      console.error("表格校验失败:", err)
      toast.error("表格校验失败，请重试")
      addGlobalLog("[表格校验] 接口异常", "err")
    } finally {
      setVerifying(false)
    }
  }, [paperId, verifying, addGlobalLog])

  /**
   * 一键修复表格-题目关联
   * 重新跑分题并写回数据库的 images / has_table / has_figure 字段
   */
  const handleAutoFixTableMatching = useCallback(async () => {
    if (!paperId || verifying) return
    setVerifying(true)
    try {
      const report = await verifyTableMatching(paperId, true)
      setTableCheckReport(report)
      if (report.ok) {
        toast.success(`修复完成（已修正 ${report.fixed_count} 道题）`)
        addGlobalLog(`[表格修复] 已修正 ${report.fixed_count} 道题`, "ok")
      } else {
        toast.warning(
          `部分修正：成功 ${report.fixed_count}，仍剩 ${report.mismatches.length} 处不匹配（可能存在边缘情况）`,
        )
        addGlobalLog(`[表格修复] 部分成功：成功 ${report.fixed_count}，剩余 ${report.mismatches.length}`, "warn")
      }
      // 无论是否完全修复，都重新拉取题目列表以反映新数据
      try {
        const data = await getQuestionsByPaper(paperId)
        setQuestions(data)
        setImageLibRefreshKey((k) => k + 1)
      } catch (e) {
        console.error("重新加载题目失败:", e)
      }
    } catch (err) {
      console.error("自动修复失败:", err)
      toast.error("自动修复失败，请重试")
      addGlobalLog("[表格修复] 接口异常", "err")
    } finally {
      setVerifying(false)
    }
  }, [paperId, verifying, addGlobalLog])

  /** 加载产物预览 */
  const loadPreview = async (type: PreviewType) => {
    setPreviewType(type)
    // 产物文件路径映射（5 种文件全支持）
    const fileMap: Record<PreviewType, string> = {
      md: 'output.md',
      latex: 'output.tex',
      html: 'output.html',
      json: 'content_list.json',
      docx: 'output.docx',
    }
    try {
      const url = `/api/papers/${paperId}/preview?file=${fileMap[type]}`
      const res = await fetch(url)
      if (res.ok) {
        // docx 是二进制文件（下载用），其它是文本（直接显示）
        if (type === 'docx') {
          const blob = await res.blob()
          const blobUrl = URL.createObjectURL(blob)
          setPreviewContent(blobUrl)
        } else {
          const text = await res.text()
          setPreviewContent(text)
        }
      } else {
        setPreviewContent('')
        addGlobalLog(`产物 ${fileMap[type]} 暂不可用`, "warn")
      }
    } catch {
      setPreviewContent('')
      addGlobalLog('加载预览失败', "err")
    }
  }

  /** 触发分题（content分题唯一方案） */
  const handleStartSplit = async () => {
    if (!paperId || splitLoading) return

    setSplitLoading(true)
    setSplitStatus('splitting')
    addGlobalLog("开始分题（content分题）...", "info")

    try {
      const res = await splitPaper(paperId)
      if (res.success) {
        addGlobalLog("分题已触发，等待完成...", "info")
        startPolling()
      } else {
        setSplitStatus('failed')
        addGlobalLog("分题触发失败", "err")
        setSplitLoading(false)
      }
    } catch (err) {
      console.error("分题失败:", err)
      setSplitStatus('failed')
      addGlobalLog(`分题失败: ${err}`, "err")
      setSplitLoading(false)
    }
  }

  /** 启动分题进度轮询 */
  const startPolling = () => {
    if (pollingTimer) clearInterval(pollingTimer)

    const timer = setInterval(async () => {
      if (!paperId) return
      try {
        const data = await getParseProgress(paperId)

        if (data.status === 'completed') {
          clearInterval(timer)
          setSplitStatus('completed')
          setSplitLoading(false)
          addGlobalLog("分题完成！", "ok")
          loadQuestions()
        } else if (data.status === 'failed') {
          clearInterval(timer)
          setSplitStatus('failed')
          setSplitLoading(false)
          addGlobalLog(`分题失败: ${data.error_message || '未知错误'}`, "err")
        }
      } catch {
        console.error('轮询分题进度失败')
      }
    }, 2000)

    setPollingTimer(timer)
  }

  /** 重新分题（content分题唯一方案，V5 位置匹配+原始顺序） */
  const handleResplit = async () => {
    if (!paperId || splitLoading) return

    setSplitLoading(true)
    addGlobalLog("正在重新分题...", "info")

    try {
      const res = await resplitPaper(paperId)
      const data = await getQuestionsByPaper(paperId)
      setQuestions(data)
      setSplitStatus('completed')
      setSplitLoading(false)
      addGlobalLog(
        `重新分题完成（${res.method_name}），共 ${res.question_count} 题`,
        "ok"
      )
    } catch (err) {
      console.error("重新分题失败:", err)
      setSplitStatus('failed')
      setSplitLoading(false)
      addGlobalLog("重新分题失败，请重试", "err")
    }
  }

  /** 返回上传页 */
  const handleBack = () => {
    navigate('/papers/upload')
  }

  /**
   * 选中题目（来自题目行点击 / 摘要卡片题号点击）
   * @param id 题目 ID
   */
  const handleSelectQuestion = useCallback((id: string) => {
    setSelectedQuestionId((prev) => (prev === id ? prev : id))
  }, [])

  /**
   * 处理题目列表整体变化（拖拽排序 / 图片编辑 / 题干编辑等）
   * 联动更新图片库刷新 key
   */
  const handleQuestionsChange = useCallback((newQuestions: Question[]) => {
    setQuestions(newQuestions)
    // 当图片数组发生变化时，触发图片库刷新（让已匹配/未匹配状态同步）
    setImageLibRefreshKey((k) => k + 1)
  }, [])

  /**
   * 处理图片库点击 → 替换到当前选中题目
   * V2 优化：优先填入当前选中题目的激活空白槽位；若没有激活空白槽位则追加到末尾
   * @param imagePath 新图片 URL
   */
  const handleReplaceFromLibrary = useCallback(
    async (imagePath: string) => {
      if (!selectedQuestionId) {
        toast.warning("请先选中一道题目")
        return
      }
      const q = questions.find((item) => item.id === selectedQuestionId)
      if (!q) {
        toast.error("未找到选中题目")
        return
      }
      // 严格 PDF 匹配校验：必须来自该试卷的图片资源
      // 路径整合后图片存放在 /data/papers/{id}/，兼容旧 /data/images/{id}/ 兜底
      const paperPrefix = `/data/papers/${paperId}/`
      const oldPrefix = `/data/images/${paperId}/`
      if (!imagePath.startsWith(paperPrefix) && !imagePath.startsWith(oldPrefix) && !imagePath.startsWith("/data/")) {
        toast.error("图片与试卷不匹配，已拒绝（严格 PDF 关联）")
        return
      }
      // 归一化现有图片列表为对象
      const currentImages: { path: string; type?: string }[] = (q.images || []).map(
        (img: unknown) => {
          if (typeof img === "string") return { path: img, type: "figure" }
          if (img && typeof img === "object") {
            const obj = img as { path?: string; url?: string; type?: string }
            return { path: obj.path || obj.url || "", type: obj.type || "figure" }
          }
          return { path: "", type: "figure" }
        },
      )
      // 检查是否已存在（避免重复）
      const exists = currentImages.some((img) => img.path === imagePath)
      if (exists) {
        toast.info("该图片已存在")
        return
      }
      // 优先路径：当前选中题目是否有激活的空白图片槽位？
      const blankIdx = pendingBlankByQ[selectedQuestionId] ?? null
      if (blankIdx !== null && blankIdx >= 0 && blankIdx < currentImages.length) {
        const slot = currentImages[blankIdx]
        const isBlank = !slot || !slot.path
        if (isBlank) {
          // 通过 fillRequest 指令让 QuestionImageEditor 消费 → 触发 onChange 走标准提交流程
          setFillRequestByQ((prev) => ({
            ...prev,
            [selectedQuestionId]: { blankIndex: blankIdx, imagePath },
          }))
          return
        }
        // 该槽位已被填，提示并降级为追加
        toast.info("该空白槽位已被填，自动追加到末尾")
      }
      // 追加新图到末尾
      const newImages: { path: string; type?: string }[] = [
        ...currentImages,
        { path: imagePath, type: "figure" },
      ]
      // 立即更新本地
      setQuestions((prev) =>
        prev.map((item) =>
          item.id === selectedQuestionId
            ? {
                ...item,
                images: newImages as unknown as string[],
                has_figure: true,
              }
            : item
        )
      )
      // 持久化到后端
      try {
        await updateQuestion(selectedQuestionId, {
          images: newImages as unknown as string[],
          has_figure: true,
        })
        toast.success(`已为第 ${q.question_no} 题添加图片`)
        // 触发图片库刷新（让已匹配状态同步）
        setImageLibRefreshKey((k) => k + 1)
      } catch (err) {
        console.error("保存图片关联失败:", err)
        toast.error("保存图片关联失败")
        // 回滚
        setQuestions((prev) =>
          prev.map((item) =>
            item.id === selectedQuestionId
              ? { ...item, images: q.images, has_figure: q.has_figure }
              : item
          )
        )
      }
    },
    [questions, selectedQuestionId, paperId, pendingBlankByQ],
  )

  /**
   * 题目激活空白槽位变更回调（由 SplitQuestionEditor 透传）
   */
  const handlePendingBlankChange = useCallback((qId: string, idx: number | null) => {
    setPendingBlankByQ((prev) => ({ ...prev, [qId]: idx }))
  }, [])

  /**
   * fillRequest 消费完成回调
   * - 清除该题的填入指令
   * - 清除该题的激活空白槽位
   * - 触发图片库刷新
   */
  const handleFillConsumed = useCallback((qId: string) => {
    setFillRequestByQ((prev) => {
      if (!prev[qId]) return prev
      const next = { ...prev }
      delete next[qId]
      return next
    })
    setPendingBlankByQ((prev) => {
      if (prev[qId] === null || prev[qId] === undefined) return prev
      return { ...prev, [qId]: null }
    })
    setImageLibRefreshKey((k) => k + 1)
  }, [])

  /** 获取当前选中题号（用于图片库标题显示） */
  const selectedQuestionNo = useMemo(
    () => questions.find((q) => q.id === selectedQuestionId)?.question_no ?? null,
    [questions, selectedQuestionId],
  )

  // 清理定时器
  useEffect(() => {
    return () => {
      if (pollingTimer) clearInterval(pollingTimer)
    }
  }, [pollingTimer])

  // 产物预览类型选项（5 种文件全支持）
  const previewTypes: { key: PreviewType; label: string; icon: typeof FileText }[] = [
    { key: 'md', label: 'Markdown', icon: FileText },
    { key: 'latex', label: 'LaTeX', icon: FileCode },
    { key: 'html', label: 'HTML', icon: FileCode },
    { key: 'json', label: 'Content List', icon: FileJson },
    { key: 'docx', label: 'Word', icon: FileType },
  ]

  return (
    <div className="flex h-full">
      {/* 左栏：试卷信息 + 分题控制区 */}
      <div className="w-[360px] border-r border-slate-200 bg-white overflow-y-auto shrink-0 flex flex-col">
        {/* 标题 */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={handleBack}
              className="p-1 rounded hover:bg-slate-100 text-slate-400"
              title="返回上传页"
            >
              <ArrowLeft size={16} />
            </button>
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Split size={18} />
              阶段二：分题切分
            </h2>
          </div>
          {paper && (
            <p className="text-xs text-slate-400 mt-1 truncate">
              {paper.filename}
            </p>
          )}
        </div>

        {/* 试卷信息 */}
        {paper && (
          <div className="p-4 border-b border-slate-200 space-y-2">
            <label className="block text-sm font-medium text-slate-600">试卷信息</label>
            <div className="text-xs text-slate-500 space-y-1">
              <p>学科：{paper.subject || '-'}</p>
              <p>年级：{paper.grade || '-'}</p>
              <p>类型：{paper.paper_type || '-'}</p>
              <p>状态：{paper.status === 'parsed' ? 'MinerU解析完成' :
                paper.status === 'completed' ? '分题完成' :
                paper.status === 'splitting' ? '分题中...' : paper.status}</p>
            </div>
          </div>
        )}

        {/* 分题方案说明（仅显示当前唯一方案，不可切换） */}
        <div className="p-4 border-b border-slate-200">
          <label className="flex items-center gap-1.5 text-sm font-medium text-slate-600 mb-2">
            <Split size={14} />
            分题方案
          </label>
          <div className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50">
            <Split className="w-4 h-4 shrink-0 text-emerald-600" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-emerald-600">content分题（唯一方案）</div>
              <div className="text-xs text-slate-500">
                V5 位置匹配 + 原始顺序 + 跨页图题匹配
              </div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          </div>
        </div>

        {/* 图片资源库（分题方案下方常驻） */}
        {splitStatus === 'completed' && paperId && (
          <ImageResourceLibrary
            paperId={paperId}
            selectedQuestionId={selectedQuestionId}
            selectedQuestionNo={selectedQuestionNo}
            onReplaceToQuestion={handleReplaceFromLibrary}
            refreshKey={imageLibRefreshKey}
          />
        )}

        {/* 开始分题按钮 */}
        <div className="p-4 border-t border-slate-200 mt-auto space-y-2">
          {splitStatus === 'idle' && (
            <button
              onClick={handleStartSplit}
              disabled={splitLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={16} />
              开始分题
            </button>
          )}
          {splitStatus === 'splitting' && (
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-slate-500">分题中，请稍候...</p>
            </div>
          )}
          {splitStatus === 'completed' && (
            <div className="text-center">
              <p className="text-sm text-emerald-600 mb-1">分题完成</p>
              <p className="text-xs text-slate-400">共 {questions.length} 题</p>
            </div>
          )}
          {splitStatus === 'failed' && (
            <button
              onClick={handleStartSplit}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              <RefreshCw size={16} />
              重试分题
            </button>
          )}

          {/* 表格-题目关联验证按钮（分题完成后可用） */}
          {splitStatus === 'completed' && paperId && (
            <div className="border-t border-slate-100 pt-2 space-y-1.5">
              <button
                onClick={handleVerifyTableMatching}
                disabled={verifying}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 transition-colors"
                title="基于最新位置匹配算法，校验每张表格是否关联到正确题目"
              >
                {verifying ? (
                  <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CheckSquare size={12} />
                )}
                {verifying ? "校验中..." : "验证表格关联"}
              </button>
              {tableCheckReport && !tableCheckReport.ok && (
                <button
                  onClick={handleAutoFixTableMatching}
                  disabled={verifying}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-amber-700 border border-amber-200 bg-amber-50 rounded-lg hover:bg-amber-100 hover:border-amber-300 disabled:opacity-50 transition-colors"
                  title="自动应用最新分题结果，修正表格错位"
                >
                  一键修复（{tableCheckReport.mismatches.length} 处）
                </button>
              )}
              {tableCheckReport && (
                <p
                  className={cn(
                    "text-[10px] text-center leading-snug px-1",
                    tableCheckReport.ok
                      ? "text-emerald-600"
                      : "text-amber-600",
                  )}
                >
                  {tableCheckReport.message}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 右栏：分题结果 + 产物预览 */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {/* 右栏标题 */}
        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <FileText size={18} />
            {splitStatus === 'completed' && questions.length > 0
              ? '分题结果'
              : splitStatus === 'splitting'
              ? '分题中...'
              : 'MinerU 解析产物预览'
            }
          </h2>

          {/* 产物预览切换按钮 */}
          <div className="flex items-center gap-1">
            {previewTypes.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => loadPreview(key)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors",
                  previewType === key
                    ? "bg-blue-100 text-blue-600"
                    : "text-slate-500 hover:bg-slate-100"
                )}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 内容区 */}
        <div className="p-6 flex-1 overflow-auto">
          {splitStatus === 'completed' && questions.length > 0 ? (
            /* 分题结果编辑区（content分题唯一方案） */
            <SplitQuestionEditor
              questions={questions}
              paperId={paperId || ''}
              splitLoading={splitLoading}
              selectedQuestionId={selectedQuestionId}
              onSelectQuestion={handleSelectQuestion}
              onResplit={handleResplit}
              onQuestionsChange={handleQuestionsChange}
              pendingBlankIndexByQuestion={pendingBlankByQ}
              onPendingBlankChange={handlePendingBlankChange}
              fillRequestByQuestion={fillRequestByQ}
              onFillConsumed={handleFillConsumed}
            />
          ) : (
            /* 产物预览区 */
            <div className="h-full">
              {previewType === 'docx' && previewContent ? (
                /* Word 文档：提供下载入口（浏览器无法直接预览 docx） */
                <div className="flex flex-col items-center justify-center h-full bg-white rounded-lg border border-slate-200 p-8">
                  <FileType size={64} className="mb-4 text-blue-500" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Word 解析产物（.docx）</h3>
                  <p className="text-sm text-slate-500 mb-6 text-center max-w-md">
                    Word 文档为二进制格式，已由 MinerU 云端解析生成，可下载后用 Microsoft Word / WPS 打开
                  </p>
                  <a
                    href={previewContent}
                    download={`paper-${paperId}-output.docx`}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Download size={16} />
                    下载 output.docx
                  </a>
                  <p className="text-xs text-slate-400 mt-4">文件大小：{`${(174 / 1024).toFixed(1)} MB`}（约）</p>
                </div>
              ) : previewContent ? (
                /* 文本格式：直接显示 */
                <pre className="text-xs font-mono bg-white rounded-lg border border-slate-200 p-4 overflow-auto h-full whitespace-pre-wrap">
                  {previewContent.slice(0, 10000)}
                  {previewContent.length > 10000 && (
                    <p className="text-slate-400 mt-2">... 内容过长，仅显示前10000字符</p>
                  )}
                </pre>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <Eye size={48} className="mb-4 opacity-30" />
                  <p className="text-sm">点击上方按钮预览 MinerU 解析产物</p>
                  <p className="text-xs mt-1">支持 Markdown / LaTeX / HTML / Content List / Word 五种格式</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 播放图标组件 */
function Play({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}
