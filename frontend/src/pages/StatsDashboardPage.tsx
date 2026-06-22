/**
 * 数据看板页
 * 功能：展示题库核心 KPI 指标 + 趋势/分布图表
 * 布局：4张KPI卡片 + 2行×2列图表（折线图、柱状图、饼图、环形图）
 * 数据源：/api/stats/overview、/api/stats/trend、/api/stats/distribution
 */
import { useState, useEffect } from "react"
import {
  BarChart3,
  BookOpen,
  TrendingUp,
  AlertTriangle,
  Percent,
} from "lucide-react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import {
  getStatsOverview,
  getStatsTrend,
  getStatsDistribution,
} from "@/api/system"

/* ========== 类型定义 ========== */

/** 概览数据结构 — 来自 /api/stats/overview */
interface OverviewData {
  total_questions: number
  in_bank_count: number
  this_month_new: number
  error_count: number
  bank_rate: number
  by_grade: Record<string, number>
  by_type: Record<string, number>
}

/** 趋势单条数据 — 来自 /api/stats/trend */
interface TrendItem {
  month: string
  new_count: number
  total_count: number
}

/** 分布项 — 来自 /api/stats/distribution */
interface DistItem {
  grade?: string
  type?: string
  difficulty?: string
  count: number
}

/** 分布数据结构 */
interface DistributionData {
  by_grade: DistItem[]
  by_type: DistItem[]
  by_difficulty: DistItem[]
}

/* ========== 名称映射 ========== */

/** 题型英文→中文映射 */
const typeLabels: Record<string, string> = {
  fill: "填空",
  single: "选择",
  judge: "判断",
  calc: "计算",
  operate: "操作",
  application: "应用",
  general: "未分类",
}

/** 难度英文→中文映射 */
const difficultyLabels: Record<string, string> = {
  simple: "简单",
  medium: "中等",
  hard: "困难",
}

/* ========== 颜色配置 ========== */

/** 柱状图6种颜色（蓝/绿/橙/紫/红/青） */
const barColors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#06b6d4"]

/** 饼图配色（Recharts 默认风格） */
const pieColors = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ef4444", "#06b6d4", "#eab308", "#ec4899"]

/* ========== KPI 卡片配置 ========== */

/** KPI 卡片定义：图标、标签、颜色 */
interface KpiConfig {
  label: string
  value: string
  icon: React.ElementType
  bgColor: string
  textColor: string
}

/**
 * 构建KPI卡片列表
 * @param data 概览数据
 * @returns 4张KPI卡片配置数组
 */
function buildKpiList(data: OverviewData): KpiConfig[] {
  return [
    {
      label: "题目总数",
      value: String(data.total_questions),
      icon: BookOpen,
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
    },
    {
      label: "本月新增",
      value: String(data.this_month_new),
      icon: TrendingUp,
      bgColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      label: "异常题数",
      value: String(data.error_count),
      icon: AlertTriangle,
      bgColor: "bg-red-50",
      textColor: "text-red-600",
    },
    {
      label: "入库率",
      value: `${(data.bank_rate * 100).toFixed(1)}%`,
      icon: Percent,
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
    },
  ]
}

/* ========== 主组件 ========== */

export default function StatsDashboardPage() {
  /* --- 状态管理 --- */
  const [overview, setOverview] = useState<OverviewData | null>(null) // 概览数据
  const [trend, setTrend] = useState<TrendItem[]>([]) // 趋势数据
  const [distribution, setDistribution] = useState<DistributionData | null>(null) // 分布数据
  const [loading, setLoading] = useState(true) // 加载状态
  const [error, setError] = useState<string | null>(null) // 错误信息

  /**
   * 加载所有看板数据
   * 并行请求3个接口，任一失败则显示错误
   */
  useEffect(() => {
    async function fetchAll() {
      setLoading(true) // 开始加载
      setError(null) // 清空错误
      try {
        const [overviewRes, trendRes, distRes] = await Promise.all([
          getStatsOverview(), // 获取概览
          getStatsTrend(6), // 获取最近6个月趋势
          getStatsDistribution(), // 获取分布数据
        ])
        // 概览数据：兼容后端可能返回的不同字段名
        const safeOverview: OverviewData = {
          total_questions: overviewRes.total_questions ?? overviewRes.question_count ?? 0,
          in_bank_count: overviewRes.in_bank_count ?? overviewRes.bank_count ?? 0,
          this_month_new: overviewRes.this_month_new ?? 0,
          error_count: overviewRes.error_count ?? 0,
          bank_rate: overviewRes.bank_rate ?? 0,
          by_grade: overviewRes.by_grade ?? {},
          by_type: overviewRes.by_type ?? {},
        }
        setOverview(safeOverview) // 存储概览
        // 趋势数据：兼容 {items: [...]} 和直接数组两种格式
        const trendItems = Array.isArray(trendRes)
          ? trendRes
          : trendRes?.items ?? trendRes?.trend ?? []
        setTrend(trendItems) // 存储趋势列表
        // 分布数据：兼容 dict 和 list 两种格式
        const safeDist: DistributionData = {
          by_grade: Array.isArray(distRes?.by_grade) ? distRes.by_grade : [],
          by_type: Array.isArray(distRes?.by_type) ? distRes.by_type : [],
          by_difficulty: Array.isArray(distRes?.by_difficulty) ? distRes.by_difficulty : [],
        }
        setDistribution(safeDist) // 存储分布
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "数据加载失败" // 提取错误信息
        setError(msg) // 设置错误
      } finally {
        setLoading(false) // 结束加载
      }
    }
    fetchAll() // 执行加载
  }, [])

  /* --- 加载中骨架屏 --- */
  if (loading) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        {/* 页面标题 */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <BarChart3 size={18} />
            数据看板
          </h2>
        </div>
        <div className="p-6 space-y-6">
          {/* KPI骨架 */}
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-100" />
                  <div className="space-y-2">
                    <div className="h-6 w-16 bg-slate-100 rounded" />
                    <div className="h-3 w-12 bg-slate-100 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* 图表骨架 */}
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-4 h-72 animate-pulse">
                <div className="h-4 w-24 bg-slate-100 rounded mb-4" />
                <div className="h-56 bg-slate-50 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* --- 错误状态 --- */
  if (error) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <BarChart3 size={18} />
            数据看板
          </h2>
        </div>
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertTriangle size={32} className="mx-auto mb-2 text-red-400" />
            <p className="text-red-600 font-medium">数据加载失败</p>
            <p className="text-red-500 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  /* --- 数据就绪，构建展示数据 --- */
  const kpiList = overview ? buildKpiList(overview) : [] // KPI卡片列表

  /** 题型分布柱状图数据：映射英文名→中文 */
  const typeChartData = (distribution?.by_type ?? []).map((item) => ({
    name: typeLabels[item.type ?? ""] ?? item.type ?? "未知", // 题型中文名
    count: item.count, // 题目数量
  }))

  /** 年级分布饼图数据 */
  const gradeChartData = (distribution?.by_grade ?? []).map((item) => ({
    name: item.grade ?? "未知", // 年级名
    value: item.count, // 题目数量
  }))

  /** 难度分布环形图数据：映射英文名→中文 */
  const difficultyChartData = (distribution?.by_difficulty ?? []).map((item) => ({
    name: difficultyLabels[item.difficulty ?? ""] ?? item.difficulty ?? "未知", // 难度中文名
    value: item.count, // 题目数量
  }))

  /* --- 渲染页面 --- */
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 页面标题 */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white">
        <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <BarChart3 size={18} />
          数据看板
        </h2>
      </div>

      <div className="p-6 space-y-6">
        {/* ====== KPI 卡片行 ====== */}
        <div className="grid grid-cols-4 gap-4">
          {kpiList.map((kpi) => {
            const Icon = kpi.icon
            return (
              <div key={kpi.label} className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  {/* 图标区域 */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${kpi.bgColor} ${kpi.textColor}`}>
                    <Icon size={20} />
                  </div>
                  {/* 数值与标签 */}
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
                    <p className="text-xs text-slate-500">{kpi.label}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ====== 第二行：折线图 + 柱状图 ====== */}
        <div className="grid grid-cols-2 gap-4">
          {/* 左：题目增长趋势折线图 */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-4">题目增长趋势</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                {/* 网格线 */}
                <CartesianGrid strokeDasharray="3 3" />
                {/* X轴：月份 */}
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                {/* Y轴：数量 */}
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {/* 新增数 — 蓝色实线 */}
                <Line
                  type="monotone"
                  dataKey="new_count"
                  name="新增数"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                {/* 累计总数 — 灰色虚线 */}
                <Line
                  type="monotone"
                  dataKey="total_count"
                  name="累计总数"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* 右：题型分布柱状图 */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-4">题型分布</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={typeChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                {/* X轴：题型名称 */}
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {/* 柱状图，每根柱子不同颜色 */}
                <Bar dataKey="count" name="题目数量" radius={[4, 4, 0, 0]}>
                  {typeChartData.map((_, index) => (
                    <Cell key={index} fill={barColors[index % barColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ====== 第三行：饼图 + 环形图 ====== */}
        <div className="grid grid-cols-2 gap-4">
          {/* 左：年级分布饼图 */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-4">年级分布</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={gradeChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {gradeChartData.map((_, index) => (
                    <Cell key={index} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* 右：难度分布环形图 */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h3 className="text-sm font-medium text-slate-700 mb-4">难度分布</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={difficultyChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  label={({ name, percent }: { name?: string; percent?: number }) =>
                    `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {difficultyChartData.map((_, index) => (
                    <Cell key={index} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
