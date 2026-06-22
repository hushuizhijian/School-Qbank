import { AlertCircle, AlertTriangle, Image, BookOpen, ChevronDown } from "lucide-react" // 图标库导入
import { cn } from "@/utils/cn" // 样式合并工具

/* 统计数据接口定义 */
interface Stats {
  total: number          // 总题数
  in_bank: number        // 已入库数
  not_in_bank: number    // 未入库数
  error: number          // 异常数
  has_warning: number    // 有警告数
  missing_knowledge: number  // 缺知识点数
  has_figure: number     // 带图数
  has_formula: number    // 带公式数
  has_table: number      // 带表数
}

/* 组件Props接口定义 */
interface GlobalStatusBarProps {
  stats: Stats                              // 统计数据
  onFilterChange: (filter: string) => void  // 点击数字触发筛选
  onShowQualityChecker?: () => void         // 展开质量检查面板
}

/* 指标项配置：定义每类指标的展示信息 */
const INDICATOR_CONFIG = [
  {
    key: "not_in_bank",         // 筛选键名
    label: "未入库",             // 显示标签
    icon: BookOpen,             // 图标组件
    bgClass: "bg-yellow-50",    // 背景色
    textClass: "text-yellow-600", // 文字色
  },
  {
    key: "error",               // 筛选键名
    label: "异常",               // 显示标签
    icon: AlertCircle,          // 图标组件
    bgClass: "bg-red-50",       // 背景色
    textClass: "text-red-600",  // 文字色
  },
  {
    key: "missing_knowledge",   // 筛选键名
    label: "缺知识点",           // 显示标签
    icon: AlertTriangle,        // 图标组件
    bgClass: "bg-orange-50",    // 背景色
    textClass: "text-orange-600", // 文字色
  },
  {
    key: "has_figure",          // 筛选键名
    label: "带图",               // 显示标签
    icon: Image,                // 图标组件
    bgClass: "bg-blue-50",      // 背景色
    textClass: "text-blue-600", // 文字色
  },
] as const // 只读元组，防止配置被篡改

/**
 * 全局状态提示条组件
 * 功能：固定在校对页面最顶部，展示题目统计概览，支持点击筛选
 * 输入：stats统计数据、onFilterChange筛选回调、onShowQualityChecker展开面板回调
 * 使用场景：校对页面顶部状态栏
 */
export default function GlobalStatusBar({
  stats,
  onFilterChange,
  onShowQualityChecker,
}: GlobalStatusBarProps) {

  /* 根据指标key获取对应的统计数值 */
  const getStatValue = (key: string): number => {
    const valueMap: Record<string, number> = {
      not_in_bank: stats.not_in_bank,         // 未入库数
      error: stats.error,                     // 异常数
      missing_knowledge: stats.missing_knowledge, // 缺知识点数
      has_figure: stats.has_figure,           // 带图数
    }
    return valueMap[key] ?? 0 // 找不到则返回0
  }

  /* 处理指标点击，触发筛选回调 */
  const handleIndicatorClick = (filterKey: string) => {
    onFilterChange(filterKey) // 调用父组件筛选方法
  }

  /* 处理"查看详情"点击，展开质量检查面板 */
  const handleDetailClick = () => {
    onShowQualityChecker?.() // 可选调用，防止未传入时报错
  }

  return (
    /* 外层容器：固定顶部，白色背景，底部边框 */
    <div className="sticky top-0 z-50 bg-white border-b border-slate-200">
      {/* 内容区域：水平排列，左右两端对齐 */}
      <div className="flex items-center justify-between px-4 py-2">

        {/* 左侧指标区域：水平排列各指标pill */}
        <div className="flex items-center gap-2">
          {INDICATOR_CONFIG.map((indicator) => {
            const IconComp = indicator.icon // 取出图标组件
            const value = getStatValue(indicator.key) // 获取对应数值

            return (
              /* 单个指标pill：可点击，圆角胶囊形 */
              <button
                key={indicator.key} // 使用key作为唯一标识
                onClick={() => handleIndicatorClick(indicator.key)} // 点击触发筛选
                className={cn(
                  "rounded-full px-3 py-1 cursor-pointer", // 胶囊形状+可点击
                  "hover:opacity-80 transition-opacity",   // 悬停透明度变化
                  "flex items-center gap-1.5 text-sm",     // 水平排列图标和文字
                  indicator.bgClass // 各指标独立背景色
                )}
              >
                {/* 指标图标 */}
                <IconComp className={cn("w-3.5 h-3.5", indicator.textClass)} />
                {/* 指标标签 */}
                <span className="text-slate-600">{indicator.label}</span>
                {/* 指标数值：加粗显示 */}
                <span className={cn("font-bold", indicator.textClass)}>
                  {value}
                </span>
              </button>
            )
          })}
        </div>

        {/* 右侧"查看详情"按钮 */}
        <button
          onClick={handleDetailClick} // 点击展开质量检查面板
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <span>查看详情</span>
          <ChevronDown className="w-4 h-4" /> {/* 下拉箭头图标 */}
        </button>
      </div>
    </div>
  )
}
