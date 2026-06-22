/**
 * PaperRecordsPage — 试卷解析记录列表页
 * 功能：展示所有已上传试卷的解析记录，支持状态筛选、进入校对、重新解析、删除操作
 * 使用场景：路由 /papers
 */
import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, RefreshCw, Trash2, Eye, Filter, Inbox, Scissors } from "lucide-react"
import { toast } from "sonner"
import { getPapers, deletePaper, triggerParse } from "@/api/papers"
import type { Paper } from "@/types/paper"

/** 解析状态配置：标签文字 + 颜色样式 */
const statusConfig: Record<string, { label: string; className: string }> = {
  uploaded: { label: "待解析", className: "bg-slate-100 text-slate-600" },
  parsing:  { label: "解析中", className: "bg-blue-100 text-blue-700" },
  completed:{ label: "已完成", className: "bg-green-100 text-green-700" },
  failed:   { label: "失败",   className: "bg-red-100 text-red-700" },
}

/** 状态筛选选项 */
const filterOptions = [
  { value: "", label: "全部状态" },
  { value: "uploaded", label: "待解析" },
  { value: "parsing", label: "解析中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
]

/** 格式化时间字符串 */
function formatTime(dateStr: string | null): string {
  if (!dateStr) return "-" // 无时间则显示占位
  const d = new Date(dateStr)
  const pad = (n: number) => n.toString().padStart(2, "0") // 补零
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 试卷解析记录页主组件 */
export default function PaperRecordsPage() {
  const navigate = useNavigate()
  // 试卷列表数据
  const [papers, setPapers] = useState<Paper[]>([])
  // 数据加载状态
  const [loading, setLoading] = useState(true)
  // 状态筛选值
  const [statusFilter, setStatusFilter] = useState("")
  // 正在执行操作的试卷 ID（防止重复点击）
  const [actioningId, setActioningId] = useState<string | null>(null)

  /** 加载试卷列表 */
  const fetchPapers = useCallback(async () => {
    setLoading(true) // 开始加载
    try {
      const data = await getPapers()
      // 兼容返回数组或 {papers, total} 两种格式
      const list = Array.isArray(data) ? data : (data as { papers: Paper[] }).papers
      setPapers(list)
    } catch (err) {
      console.error("获取试卷列表失败:", err)
      toast.error("获取试卷列表失败")
    } finally {
      setLoading(false) // 结束加载
    }
  }, [])

  // 页面挂载时加载数据
  useEffect(() => {
    fetchPapers()
  }, [fetchPapers])

  /** 按状态筛选后的列表 */
  const filteredPapers = statusFilter
    ? papers.filter((p) => p.status === statusFilter)
    : papers

  /** 进入校对 — 仅 completed 状态可用 */
  const handleProofread = (id: string) => {
    navigate(`/papers/${id}`) // 跳转到校对工作台
  }

  /** 进入分题切分页 — parsed/completed/splitting/failed 状态可用 */
  const handleSplit = (id: string) => {
    navigate(`/papers/${id}/split`) // 跳转到分题切分页
  }

  /** 重新解析 — 仅 failed 状态可用 */
  const handleReparse = async (id: string) => {
    setActioningId(id) // 标记操作中
    try {
      await triggerParse(id) // 调用重新解析接口
      toast.success("已触发重新解析")
      await fetchPapers() // 刷新列表
    } catch (err) {
      console.error("重新解析失败:", err)
      toast.error("重新解析失败")
    } finally {
      setActioningId(null) // 清除操作标记
    }
  }

  /** 删除试卷 — 确认后执行 */
  const handleDelete = async (id: string, filename: string) => {
    const confirmed = window.confirm(`确定要删除「${filename}」吗？此操作不可恢复。`)
    if (!confirmed) return // 用户取消

    setActioningId(id) // 标记操作中
    try {
      await deletePaper(id) // 调用删除接口
      toast.success("删除成功")
      await fetchPapers() // 刷新列表
    } catch (err) {
      console.error("删除失败:", err)
      toast.error("删除失败")
    } finally {
      setActioningId(null) // 清除操作标记
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 页面标题栏 */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <FileText size={20} />
          解析记录
        </h1>

        {/* 状态筛选下拉 */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-blue-500 bg-white"
          >
            {filterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* 加载中状态 */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-400">
            加载中...
          </div>
        )}

        {/* 空状态提示 */}
        {!loading && filteredPapers.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Inbox size={48} className="mb-3" />
            <p className="text-sm">
              {statusFilter ? "当前筛选条件下没有记录" : "暂无解析记录，请先上传试卷"}
            </p>
          </div>
        )}

        {/* 记录列表 */}
        {!loading && filteredPapers.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {/* 表头 */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500 uppercase tracking-wider">
              <span>文件名</span>
              <span>年级</span>
              <span>试卷类型</span>
              <span>解析状态</span>
              <span>题目数</span>
              <span>创建时间</span>
            </div>

            {/* 数据行 */}
            {filteredPapers.map((paper) => {
              const cfg = statusConfig[paper.status] ?? { label: paper.status, className: "bg-slate-100 text-slate-600" }
              const isActioning = actioningId === paper.id // 当前行是否在操作中
              return (
                <div
                  key={paper.id}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1.5fr] gap-4 px-5 py-3 border-b border-slate-100 hover:bg-slate-50 items-center text-sm"
                >
                  {/* 文件名 */}
                  <span className="truncate text-slate-700" title={paper.filename}>
                    {paper.filename}
                  </span>

                  {/* 年级 */}
                  <span className="text-slate-600">{paper.grade || "-"}</span>

                  {/* 试卷类型 */}
                  <span className="text-slate-600">{paper.paper_type || "-"}</span>

                  {/* 解析状态标签 */}
                  <span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </span>

                  {/* 题目数 */}
                  <span className="text-slate-600">{paper.total_questions ?? "-"}</span>

                  {/* 创建时间 + 操作按钮 */}
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-xs flex-1">{formatTime(paper.created_at)}</span>

                    {/* 分题按钮（剪刀图标）— 左侧，parsed/completed/splitting/failed 状态可用 */}
                    {paper.status !== "uploaded" && paper.status !== "parsing" && (
                      <button
                        onClick={() => handleSplit(paper.id)}
                        disabled={isActioning}
                        className="p-1 rounded hover:bg-amber-50 text-amber-600 transition-colors disabled:opacity-50"
                        title="分题切分"
                      >
                        <Scissors size={16} />
                      </button>
                    )}

                    {/* 进入校对按钮（绿色眼睛）— 仅 completed 状态 */}
                    {paper.status === "completed" && (
                      <button
                        onClick={() => handleProofread(paper.id)}
                        disabled={isActioning}
                        className="p-1 rounded hover:bg-green-50 text-green-600 transition-colors disabled:opacity-50"
                        title="进入校对"
                      >
                        <Eye size={16} />
                      </button>
                    )}

                    {/* 重新解析按钮 — 仅 failed 状态 */}
                    {paper.status === "failed" && (
                      <button
                        onClick={() => handleReparse(paper.id)}
                        disabled={isActioning}
                        className="p-1 rounded hover:bg-blue-50 text-blue-600 transition-colors disabled:opacity-50"
                        title="重新解析"
                      >
                        <RefreshCw size={16} />
                      </button>
                    )}

                    {/* 删除按钮 — 所有状态可用 */}
                    <button
                      onClick={() => handleDelete(paper.id, paper.filename)}
                      disabled={isActioning}
                      className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors disabled:opacity-50"
                      title="删除"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
