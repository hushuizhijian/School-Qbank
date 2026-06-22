import { BarChart3, ClipboardList, Clock, AlertTriangle, Image, HelpCircle, Link2, CheckCircle } from "lucide-react" // 图标库导入
import { cn } from "@/utils/cn" // 样式合并工具

/* 统计数据接口定义 */
interface Stats {
  total: number              // 总题数
  in_bank: number            // 已入库数
  not_in_bank: number        // 未入库数
  error: number              // 异常数
  has_warning: number        // 有警告数
  missing_knowledge: number  // 缺知识点数
  has_figure: number         // 带图数
  has_formula: number        // 带公式数
  has_table: number          // 带表数
  by_type: Record<string, number> // 按题型分组统计
}

/* 组件Props接口定义 */
interface StatsPanelProps {
  stats: Stats                                // 统计数据
  activeFilter: string | null                 // 当前激活的筛选
  onFilterChange: (filter: string | null) => void // 点击筛选回调
}

/* 7项统计指标配置：统一展示所有筛选维度 */
const STATS_ITEMS = [
  {
    key: "total",              // 筛选键名
    label: "全部题目",          // 显示标签
    icon: ClipboardList,       // 图标组件
    colorClass: "text-slate-600", // 图标颜色
    bgClass: "",               // 背景色（无背景）
  },
  {
    key: "not_in_bank",        // 筛选键名
    label: "未入库",            // 显示标签
    icon: Clock,               // 图标组件
    colorClass: "text-yellow-600", // 图标颜色
    bgClass: "bg-yellow-50",   // 背景色
  },
  {
    key: "has_warning",        // 筛选键名
    label: "有警告",            // 显示标签
    icon: AlertTriangle,       // 图标组件
    colorClass: "text-orange-600", // 图标颜色
    bgClass: "bg-orange-50",   // 背景色
  },
  {
    key: "has_figure",         // 筛选键名
    label: "有题图",            // 显示标签
    icon: Image,               // 图标组件
    colorClass: "text-blue-600", // 图标颜色
    bgClass: "bg-blue-50",     // 背景色
  },
  {
    key: "missing_knowledge",  // 筛选键名
    label: "知识点缺失",        // 显示标签
    icon: HelpCircle,          // 图标组件
    colorClass: "text-red-600", // 图标颜色
    bgClass: "bg-red-50",      // 背景色
  },
  {
    key: "error",              // 筛选键名
    label: "挂错异常",          // 显示标签
    icon: Link2,               // 图标组件
    colorClass: "text-purple-600", // 图标颜色
    bgClass: "bg-purple-50",   // 背景色
  },
  {
    key: "in_bank",            // 筛选键名
    label: "已入库",            // 显示标签
    icon: CheckCircle,         // 图标组件
    colorClass: "text-green-600", // 图标颜色
    bgClass: "bg-green-50",    // 背景色
  },
] as const // 只读元组，防止配置被篡改

/**
 * 校对统计面板组件
 * 功能：展示校对工作台的7项统计数据，支持按维度筛选
 * 输入：stats统计数据、activeFilter当前筛选、onFilterChange筛选回调
 * 使用场景：校对工作台左侧统计面板
 */
export default function StatsPanel({
  stats,
  activeFilter,
  onFilterChange,
}: StatsPanelProps) {

  /* 根据指标key获取对应的统计数值 */
  const getStatValue = (key: string): number => {
    const valueMap: Record<string, number> = {
      total: stats.total,                     // 总题数
      in_bank: stats.in_bank,                 // 已入库数
      not_in_bank: stats.not_in_bank,         // 未入库数
      error: stats.error,                     // 异常数
      has_warning: stats.has_warning,         // 有警告数
      missing_knowledge: stats.missing_knowledge, // 缺知识点数
      has_figure: stats.has_figure,           // 带图数
      has_formula: stats.has_formula,         // 带公式数
      has_table: stats.has_table,             // 带表数
    }
    return valueMap[key] ?? 0 // 找不到则返回0
  }

  /* 处理统计项点击 — 再次点击同一项则取消筛选 */
  const handleItemClick = (key: string) => {
    if (activeFilter === key) {
      onFilterChange(null) // 取消筛选
    } else {
      onFilterChange(key) // 激活筛选
    }
  }

  return (
    /* 外层容器：纵向排列，白色背景，右侧边框 */
    <div className="flex flex-col bg-white border-r border-slate-200 h-full">

      {/* 面板标题区域 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
        <BarChart3 className="w-5 h-5 text-blue-500" /> {/* 统计图标 */}
        <h2 className="text-sm font-semibold text-slate-700">校对统计</h2>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto px-2 py-2">

        {/* 7项统计指标列表 */}
        {STATS_ITEMS.map((item) => {
          const IconComp = item.icon // 取出图标组件
          const value = getStatValue(item.key) // 获取对应数值
          const isActive = activeFilter === item.key // 是否激活状态

          return (
            /* 单个统计指标项 — 可点击筛选 */
            <div
              key={item.key}
              onClick={() => handleItemClick(item.key)} // 点击切换筛选
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors", // 基础样式
                item.bgClass && !isActive && item.bgClass, // 非激活时应用背景色
                isActive && "ring-2 ring-blue-300" // 激活状态：蓝色边框环
              )}
            >
              {/* 左侧：图标+标签 */}
              <div className="flex items-center gap-2">
                <IconComp className={cn("w-4 h-4", item.colorClass)} /> {/* 指标图标 */}
                <span className="text-sm">{item.label}</span> {/* 指标标签 */}
              </div>
              {/* 右侧：数值 */}
              <span className={cn(
                "font-bold text-lg", // 数值样式
                isActive ? "text-blue-700" : "text-slate-700" // 激活/默认颜色
              )}>
                {value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
