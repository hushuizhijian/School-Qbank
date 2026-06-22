/**
 * PDF 导出记录列表页
 *
 * 功能：从后端拉取当前用户的 PDF 导出记录，支持搜索、刷新、下载、删除
 * 输入参数：无（通过 api/exports 拉取数据）
 * 返回值：表格视图
 * 使用场景：用户查看历史导出的 PDF 列表
 */
import { useEffect, useMemo, useState } from "react"
import { Search, FileText, RefreshCw, Download, Trash2, Loader2, FileDown } from "lucide-react"
import { toast } from "sonner"
import { getExports, downloadExport, deleteExport } from "@/api/exports"

interface ExportRecord {
  id: string
  user_id: string
  homework_id: string
  title: string
  page_size: string
  file_path: string | null
  created_at: string
}

export default function ExportListPage() {
  // 搜索关键词
  const [keyword, setKeyword] = useState("")
  // 数据
  const [items, setItems] = useState<ExportRecord[]>([])
  // 加载状态
  const [loading, setLoading] = useState(false)
  // 正在下载的记录 id
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  // 正在删除的记录 id
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 加载导出记录列表
  const loadExports = async () => {
    setLoading(true)
    try {
      const res = await getExports()
      // 兼容两种返回结构：{items: [...], total: N} 或直接数组
      const list: ExportRecord[] = Array.isArray(res)
        ? res
        : (res?.items || [])
      setItems(list)
    } catch (err) {
      console.error("加载导出记录失败:", err)
      toast.error("加载导出记录失败")
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  // 组件挂载时加载数据
  useEffect(() => {
    void loadExports()
  }, [])

  // 关键词过滤后的列表
  const filtered = useMemo(() => {
    if (!keyword.trim()) return items
    const q = keyword.trim().toLowerCase()
    return items.filter(
      (it) =>
        (it.title || "").toLowerCase().includes(q) ||
        (it.page_size || "").toLowerCase().includes(q)
    )
  }, [items, keyword])

  // 下载 PDF 文件
  const handleDownload = async (rec: ExportRecord) => {
    setDownloadingId(rec.id)
    try {
      const blob = await downloadExport(rec.id)
      // 后端目前可能没有真实的文件存储，blob 可能是 JSON 错误信息
      // 这里做一次类型判断：如果是 application/json 说明文件不存在
      if (blob instanceof Blob && blob.type && blob.type.includes("application/json")) {
        const text = await blob.text()
        try {
          const j = JSON.parse(text)
          toast.error(j.detail || "文件下载失败")
        } catch {
          toast.error("文件下载失败")
        }
        return
      }
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${rec.title || "试卷"}_${rec.id.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success("已开始下载")
    } catch (err) {
      console.error("下载失败:", err)
      toast.error("下载失败")
    } finally {
      setDownloadingId(null)
    }
  }

  // 删除单条记录
  const handleDelete = async (rec: ExportRecord) => {
    if (!window.confirm(`确认删除导出记录「${rec.title || rec.id.slice(0, 8)}」？`)) return
    setDeletingId(rec.id)
    try {
      await deleteExport(rec.id)
      setItems((prev) => prev.filter((it) => it.id !== rec.id))
      toast.success("已删除")
    } catch (err) {
      console.error("删除失败:", err)
      toast.error("删除失败")
    } finally {
      setDeletingId(null)
    }
  }

  // 格式化时间为中文短格式
  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏：标题 + 搜索 + 刷新 */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-white">
        <FileDown size={18} className="text-slate-500" />
        <h2 className="text-base font-semibold text-slate-800">导出记录</h2>
        <span className="text-xs text-slate-400">· {items.length} 条</span>
        <div className="flex-1" />
        <div className="relative w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="搜索导出记录（标题/纸张）..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => void loadExports()}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          刷新
        </button>
      </div>

      {/* 表格区域 */}
      <div className="flex-1 overflow-auto p-6">
        {loading && items.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            <Loader2 size={32} className="mx-auto mb-2 animate-spin opacity-50" />
            正在加载...
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            <FileText size={32} className="mx-auto mb-2 opacity-30" />
            {items.length === 0 ? "暂无导出记录" : "没有匹配的记录"}
          </div>
        ) : (
          <table className="w-full bg-white rounded-lg border border-slate-200 overflow-hidden">
            {/* 表头 */}
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">文件名</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">纸张</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">作业ID</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">导出时间</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">状态</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            {/* 表体 */}
            <tbody>
              {filtered.map((rec) => {
                const isDownloading = downloadingId === rec.id
                const isDeleting = deletingId === rec.id
                return (
                  <tr
                    key={rec.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-slate-700">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-slate-400" />
                        <span className="truncate max-w-xs" title={rec.title || "(未命名)"}>
                          {rec.title || "(未命名)"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{rec.page_size || "A4"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                      {rec.homework_id?.slice(0, 8) || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">{formatTime(rec.created_at)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-600 border border-green-200">
                        已生成
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => void handleDownload(rec)}
                          disabled={isDownloading}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                          title="下载 PDF"
                        >
                          {isDownloading ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Download size={12} />
                          )}
                          下载
                        </button>
                        <button
                          onClick={() => void handleDelete(rec)}
                          disabled={isDeleting}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                          title="删除记录"
                        >
                          {isDeleting ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
