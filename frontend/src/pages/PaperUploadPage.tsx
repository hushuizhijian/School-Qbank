/**
 * PaperUploadPage — 套卷智能解析上传页（二期优化：仅MinerU云端解析阶段）
 * 功能：左右分栏布局，左侧配置区（基础信息+文件上传+引擎配置+开始解析），
 *       右侧进度区（ParseProgressView），解析完成后跳转分题页
 * 使用场景：路由 /papers/upload
 */
import { useState, useCallback, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { Settings, FileText, Play, BookOpen, GraduationCap, MapPin, Tag, Calendar, Clock, Split } from "lucide-react"
import { uploadPaper, getParseProgress, triggerParse } from "@/api/papers"
import FileDropZone from "@/components/upload/FileDropZone"
import FileListItem from "@/components/upload/FileListItem"
import EngineConfigPanel from "@/components/upload/EngineConfigPanel"
import type { ParseConfig } from "@/components/upload/EngineConfigPanel"
import ParseProgressView from "@/components/upload/ParseProgressView"
import { useSSEStore } from "@/stores/sseStore"

/** 上传文件项类型 */
interface UploadFileItem {
  id: string          // 唯一标识
  file: File          // 原始文件对象
  status: 'uploading' | 'done' | 'error'  // 上传状态
}

/** 解析进度状态类型 */
interface ParseProgressState {
  status: 'idle' | 'parsing' | 'completed' | 'failed'  // 状态
  progress: number        // 进度 0-100
  stage: string           // 当前阶段文字
  parsedCount: number     // 已识别题数
  totalCount: number      // 总题数
  errorCount: number      // 异常题数
  paperId?: string        // 试卷ID
}

/** 基础信息表单类型 */
interface BasicInfoForm {
  subject: string       // 学科
  grade: string         // 年级
  region: string        // 地区
  paperType: string     // 试卷类型
  academicYear: string  // 学年
  semester: string      // 学期
}

/** 默认基础信息 */
const defaultBasicInfo: BasicInfoForm = {
  subject: "数学",
  grade: "",
  region: "",
  paperType: "",
  academicYear: "2025-2026",
  semester: "",
}

/** 默认解析配置 */
const defaultParseConfig: ParseConfig = {
  engine: 'mineru',
  page_range_start: null,
  page_range_end: null,
}

/** 默认进度状态 */
const defaultProgress: ParseProgressState = {
  status: 'idle',
  progress: 0,
  stage: '',
  parsedCount: 0,
  totalCount: 0,
  errorCount: 0,
}

/** 年级选项 */
const gradeOptions = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级']

/** 试卷类型选项 */
const paperTypeOptions = [
  { value: '期末考试', label: '期末考试' },
  { value: '单元测试', label: '单元测试' },
  { value: '月考', label: '月考' },
  { value: '专项练习', label: '专项练习' },
  { value: '模拟考试', label: '模拟考试' },
]

/** 学年选项 */
const academicYearOptions = ['2024-2025', '2025-2026', '2026-2027']

/** 学期选项 */
const semesterOptions = [
  { value: '上学期', label: '上学期' },
  { value: '下学期', label: '下学期' },
]

/** 生成唯一 ID */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2) // 时间戳+随机串
}

/** 套卷上传页主组件（阶段一：MinerU云端解析） */
export default function PaperUploadPage() {
  const navigate = useNavigate()
  // 基础信息表单
  const [basicInfo, setBasicInfo] = useState<BasicInfoForm>(defaultBasicInfo)
  // 已上传文件列表
  const [fileList, setFileList] = useState<UploadFileItem[]>([])
  // 解析引擎配置
  const [parseConfig, setParseConfig] = useState<ParseConfig>(defaultParseConfig)
  // 解析进度状态
  const [progressState, setProgressState] = useState<ParseProgressState>(defaultProgress)
  // 轮询定时器 ID
  const [pollingTimer, setPollingTimer] = useState<ReturnType<typeof setInterval> | null>(null)
  // 全局 SSE 日志
  const addGlobalLog = useSSEStore((s) => s.addLog)
  // SSE EventSource 引用
  const sseRef = useRef<EventSource | null>(null)

  /** 更新基础信息字段 */
  const updateBasicInfo = <K extends keyof BasicInfoForm>(key: K, value: BasicInfoForm[K]) => {
    setBasicInfo((prev) => ({ ...prev, [key]: value })) // 浅拷贝更新
  }

  /** 处理文件选择回调 */
  const handleFilesSelected = useCallback((files: File[]) => {
    const newItems: UploadFileItem[] = files.map((file) => ({
      id: generateId(),   // 生成唯一 ID
      file,               // 原始文件
      status: 'done',     // 标记为已上传（本地选择即完成）
    }))
    setFileList((prev) => [...prev, ...newItems]) // 追加到列表
  }, [])

  /** 移除文件 */
  const handleRemoveFile = useCallback((id: string) => {
    setFileList((prev) => prev.filter((item) => item.id !== id)) // 过滤掉目标项
  }, [])

  /** 开始解析（仅阶段一：MinerU云端解析） */
  const handleStartParse = async () => {
    if (fileList.length === 0) {
      addGlobalLog("请先上传文件", "warn")
      return
    }

    addGlobalLog("开始上传并触发 MinerU 云端解析...", "info")
    setProgressState({
      status: 'parsing',
      progress: 0,
      stage: '正在上传文件...',
      parsedCount: 0,
      totalCount: 0,
      errorCount: 0,
    })

    try {
      const formData = new FormData()
      formData.append('file', fileList[0].file)
      formData.append('subject', basicInfo.subject)
      formData.append('grade', basicInfo.grade)
      formData.append('region', basicInfo.region)
      formData.append('paper_type', basicInfo.paperType)
      formData.append('academic_year', basicInfo.academicYear)
      formData.append('semester', basicInfo.semester)
      formData.append('parse_config', JSON.stringify(parseConfig))

      const paper = await uploadPaper(formData)
      addGlobalLog(`上传成功: ${paper.id}`, "ok")

      if (paper.status === 'completed' || paper.status === 'parsed') {
        setProgressState({
          status: 'completed',
          progress: 100,
          stage: 'MinerU 云端解析完成，请前往分题',
          parsedCount: 0,
          totalCount: 0,
          errorCount: 0,
          paperId: paper.id,
        })
        addGlobalLog("MinerU 云端解析完成", "ok")
      } else if (paper.status === 'failed') {
        setProgressState({
          status: 'failed',
          progress: 0,
          stage: '解析失败',
          parsedCount: 0,
          totalCount: 0,
          errorCount: 0,
          paperId: paper.id,
        })
        addGlobalLog("解析失败", "err")
      } else {
        setProgressState((prev) => ({
          ...prev,
          stage: '文件上传成功，等待 MinerU 解析...',
          paperId: paper.id,
        }))
        connectSSE(paper.id)
        startPolling(paper.id)
      }
    } catch (err) {
      console.error('上传失败:', err)
      addGlobalLog(`上传失败: ${err}`, "err")
      setProgressState({
        status: 'failed',
        progress: 0,
        stage: '上传失败',
        parsedCount: 0,
        totalCount: 0,
        errorCount: 0,
      })
    }
  }

  /** 连接 SSE 获取实时进度 */
  const connectSSE = (paperId: string) => {
    if (sseRef.current) sseRef.current.close()
    addGlobalLog(`SSE 连接: ${paperId}`, "info")
    const source = new EventSource(`/api/papers/${paperId}/sse`)
    sseRef.current = source
    source.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === "progress") {
          const msg = event.data?.message || event.data?.stage || ""
          if (msg) addGlobalLog(msg, "info")
        } else if (event.type === "done") {
          addGlobalLog("SSE: MinerU 解析完成", "ok")
          source.close()
        } else if (event.type === "error") {
          addGlobalLog(`SSE 错误: ${event.data?.message}`, "err")
          source.close()
        }
      } catch { /* keepalive */ }
    }
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        addGlobalLog("SSE 连接断开", "warn")
      }
    }
  }

  /** 启动解析进度轮询 */
  const startPolling = (paperId: string) => {
    if (pollingTimer) {
      clearInterval(pollingTimer)
    }

    const timer = setInterval(async () => {
      try {
        const data = await getParseProgress(paperId) // 获取进度

        setProgressState((prev) => ({
          ...prev,
          progress: data.progress ?? 0,
          stage: data.stage ?? prev.stage,
          parsedCount: data.parsed_count ?? 0,
          totalCount: data.total_count ?? 0,
          errorCount: data.error_count ?? 0,
        }))

        // MinerU解析完成（status为parsed或completed），停止轮询
        if (data.status === 'completed' || data.status === 'parsed') {
          clearInterval(timer)
          setProgressState((prev) => ({
            ...prev,
            status: 'completed',
            progress: 100,
            stage: 'MinerU 云端解析完成，请前往分题',
          }))
        }

        if (data.status === 'failed') {
          clearInterval(timer)
          setProgressState((prev) => ({
            ...prev,
            status: 'failed',
            stage: data.error_message ?? data.stage ?? '解析失败',
          }))
        }
      } catch {
        console.error('轮询进度失败')
      }
    }, 2000)

    setPollingTimer(timer)
  }

  /** 重试解析 */
  const handleRetry = async () => {
    if (!progressState.paperId) {
      setProgressState(defaultProgress)
      return
    }

    setProgressState((prev) => ({
      ...prev,
      status: 'parsing',
      progress: 0,
      stage: '正在重新解析...',
    }))

    try {
      const result = await triggerParse(progressState.paperId)
      if (result.success) {
        setProgressState((prev) => ({
          ...prev,
          status: 'parsing',
          stage: '已触发重新解析，等待处理...',
        }))
        startPolling(progressState.paperId!)
      } else {
        setProgressState((prev) => ({
          ...prev,
          status: 'failed',
          stage: result.error ?? result.message ?? '解析失败',
        }))
      }
    } catch (err) {
      console.error('重新解析失败:', err)
      setProgressState((prev) => ({
        ...prev,
        status: 'failed',
        stage: '重新解析失败',
      }))
    }
  }

  /** 跳转到分题页 */
  const handleGoToSplit = () => {
    if (progressState.paperId) {
      navigate(`/papers/${progressState.paperId}/split`)
    }
  }

  /** 是否可以开始解析 */
  const canStartParse =
    fileList.length > 0 &&                              // 有文件
    progressState.status !== 'parsing' &&               // 非解析中
    basicInfo.grade !== '' &&                            // 已选年级
    basicInfo.paperType !== '' &&                        // 已选试卷类型
    basicInfo.semester !== ''                            // 已选学期

  return (
    <div className="flex h-full">
      {/* 左栏：配置区（固定360px宽） */}
      <div className="w-[360px] border-r border-slate-200 bg-white overflow-y-auto shrink-0 flex flex-col">
        {/* 配置区标题 */}
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Settings size={18} />
            阶段一：MinerU 云端解析
          </h2>
          <p className="text-xs text-slate-400 mt-1">上传PDF并触发云端解析，解析完成后进入分题</p>
        </div>

        {/* 基础信息表单 */}
        <div className="p-4 border-b border-slate-200 space-y-3">
          <label className="block text-sm font-medium text-slate-600">基础信息</label>

          {/* 学科选择 */}
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-slate-400 shrink-0" />
            <select
              value={basicInfo.subject}
              onChange={(e) => updateBasicInfo('subject', e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
            >
              <option value="数学">数学</option>
            </select>
          </div>

          {/* 年级选择 */}
          <div className="flex items-center gap-2">
            <GraduationCap size={14} className="text-slate-400 shrink-0" />
            <select
              value={basicInfo.grade}
              onChange={(e) => updateBasicInfo('grade', e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
            >
              <option value="" disabled>选择年级</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* 地区输入 */}
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="地区（选填）"
              value={basicInfo.region}
              onChange={(e) => updateBasicInfo('region', e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* 试卷类型选择 */}
          <div className="flex items-center gap-2">
            <Tag size={14} className="text-slate-400 shrink-0" />
            <select
              value={basicInfo.paperType}
              onChange={(e) => updateBasicInfo('paperType', e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
            >
              <option value="" disabled>选择试卷类型</option>
              {paperTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 学年选择 */}
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <select
              value={basicInfo.academicYear}
              onChange={(e) => updateBasicInfo('academicYear', e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
            >
              {academicYearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* 学期选择 */}
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-400 shrink-0" />
            <select
              value={basicInfo.semester}
              onChange={(e) => updateBasicInfo('semester', e.target.value)}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500"
            >
              <option value="" disabled>选择学期</option>
              {semesterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 文件上传区 */}
        <div className="p-4 border-b border-slate-200">
          <label className="block text-sm font-medium text-slate-600 mb-2">上传套卷</label>
          <FileDropZone onFilesSelected={handleFilesSelected} />
        </div>

        {/* 已上传文件列表 */}
        {fileList.length > 0 && (
          <div className="p-4 border-b border-slate-200 space-y-2">
            <label className="block text-sm font-medium text-slate-600">已上传文件</label>
            {fileList.map((item) => (
              <FileListItem
                key={item.id}
                filename={item.file.name}
                size={item.file.size}
                status={item.status}
                onRemove={() => handleRemoveFile(item.id)}
              />
            ))}
          </div>
        )}

        {/* 引擎配置面板 */}
        <div className="p-4 border-b border-slate-200">
          <EngineConfigPanel
            config={parseConfig}
            onChange={setParseConfig}
          />
        </div>

        {/* 开始解析按钮 */}
        <div className="p-4 border-t border-slate-200 mt-auto">
          <button
            onClick={handleStartParse}
            disabled={!canStartParse}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={16} />
            {progressState.status === 'parsing' ? '解析中...' : '开始 MinerU 云端解析'}
          </button>
          {/* 必填提示 */}
          {!canStartParse && fileList.length > 0 && (
            <p className="text-xs text-slate-400 mt-2 text-center">
              请填写年级、试卷类型和学期
            </p>
          )}
        </div>

        {/* 解析完成后跳转分题按钮 */}
        {progressState.status === 'completed' && progressState.paperId && (
          <div className="px-4 pb-4">
            <button
              onClick={handleGoToSplit}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Split size={16} />
              前往分题切分
            </button>
          </div>
        )}
      </div>

      {/* 右栏：进度区（flex自适应） */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {/* 右栏标题 */}
        <div className="p-4 border-b border-slate-200 bg-white">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <FileText size={18} />
            MinerU 云端解析进度
          </h2>
        </div>

        {/* 进度展示区 */}
        <div className="p-6 flex-1 overflow-auto">
          <ParseProgressView
            status={progressState.status}
            progress={progressState.progress}
            stage={progressState.stage}
            parsedCount={progressState.parsedCount}
            totalCount={progressState.totalCount}
            errorCount={progressState.errorCount}
            paperId={progressState.paperId}
            onRetry={handleRetry}
          />

          {/* 解析完成后提示 */}
          {progressState.status === 'completed' && progressState.paperId && (
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
              <p className="text-sm text-emerald-700 mb-2">
                MinerU 云端解析已完成！生成了 markdown、latex、html、docx、content_list 五种格式产物。
              </p>
              <button
                onClick={handleGoToSplit}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                进入分题切分
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}