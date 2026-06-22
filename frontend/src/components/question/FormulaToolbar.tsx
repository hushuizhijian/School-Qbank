/** 公式工具栏组件 — 小学优化版 */
import { useState } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/utils/cn"

/** 组件 Props 定义 */
interface FormulaToolbarProps {
  /** 插入 LaTeX 公式到编辑器的回调 */
  onInsert: (latex: string) => void
}

/** 工具栏按钮定义 */
interface ToolbarButton {
  /** 按钮显示标签 */
  label: string
  /** 点击时插入的 LaTeX 代码 */
  latex: string
  /** 所属分类 */
  category: string
}

/** 第一行按钮 — 小学高频，始终可见 */
const primaryButtons: ToolbarButton[] = [
  { label: "a/b", latex: "\\frac{ }{ }", category: "常用" }, // 分数
  { label: "%", latex: "\\%", category: "常用" },             // 百分号
  { label: ".", latex: ".", category: "常用" },               // 小数点
  { label: "²", latex: "^{2}", category: "幂次" },            // 平方
  { label: "³", latex: "^{3}", category: "幂次" },            // 立方
  { label: "√", latex: "\\sqrt{ }", category: "根式" },       // 根号
  { label: "°", latex: "^{\\circ}", category: "几何" },       // 角度
  { label: "∠", latex: "\\angle", category: "几何" },         // 角
  { label: "⊥", latex: "\\perp", category: "几何" },          // 垂直
  { label: "∥", latex: "\\parallel", category: "几何" },      // 平行
  { label: "△", latex: "\\triangle", category: "几何" },      // 三角形
  { label: "⊙", latex: "\\odot", category: "几何" },          // 圆
  { label: "π", latex: "\\pi", category: "常量" },            // 圆周率
  { label: "∞", latex: "\\infty", category: "常量" },         // 无穷
  { label: "≈", latex: "\\approx", category: "关系" },        // 约等于
  { label: "≠", latex: "\\neq", category: "关系" },           // 不等于
  { label: "≤", latex: "\\leq", category: "关系" },           // 小于等于
  { label: "≥", latex: "\\geq", category: "关系" },           // 大于等于
  { label: "{ }", latex: "\\{ \\}", category: "括号" },       // 花括号
  { label: "( )", latex: "( )", category: "括号" },           // 圆括号
  { label: "^", latex: "^{ }", category: "上下标" },          // 上标
  { label: "_", latex: "_{ }", category: "上下标" },          // 下标
]

/** 第二行按钮 — 进阶，折叠在"更多"里 */
const advancedButtons: ToolbarButton[] = [
  { label: "∫", latex: "\\int", category: "进阶" },                           // 积分
  { label: "∑", latex: "\\sum", category: "进阶" },                           // 求和
  { label: "lim", latex: "\\lim", category: "进阶" },                         // 极限
  { label: "∂", latex: "\\partial", category: "进阶" },                       // 偏导
  { label: "矩阵", latex: "\\begin{matrix} \\end{matrix}", category: "进阶" }, // 矩阵
  { label: "→", latex: "\\vec{ }", category: "进阶" },                        // 向量
  { label: "||", latex: "\\begin{vmatrix} \\end{vmatrix}", category: "进阶" }, // 行列式
  { label: "| |", latex: "| |", category: "进阶" },                           // 绝对值
  { label: "∩", latex: "\\cap", category: "进阶" },                           // 交集
  { label: "∪", latex: "\\cup", category: "进阶" },                           // 并集
  { label: "∈", latex: "\\in", category: "进阶" },                            // 属于
  { label: "∅", latex: "\\emptyset", category: "进阶" },                      // 空集
]

/**
 * 渲染按钮列表，在分类变化处插入竖线分隔符
 * @param buttons - 按钮数组
 * @param onInsert - 插入回调
 */
function renderButtonGroup(buttons: ToolbarButton[], onInsert: (latex: string) => void) {
  return buttons.map((btn, idx) => {
    /** 判断是否需要在该按钮前插入分类分隔竖线 */
    const prevCategory = idx > 0 ? buttons[idx - 1].category : null // 上一个按钮分类
    const showDivider = prevCategory !== null && btn.category !== prevCategory // 分类变化时显示分隔线

    return (
      <span key={btn.label + idx} className="contents">
        {/* 分类分隔竖线 */}
        {showDivider && (
          <span className="w-px self-stretch bg-slate-300 mx-0.5" /> // 竖线分隔符
        )}
        {/* 公式按钮 */}
        <button
          type="button"
          onClick={() => onInsert(btn.latex)} // 点击插入公式
          className="px-2 py-1 text-sm bg-white border border-slate-200 rounded hover:bg-blue-50 hover:border-blue-300 active:bg-blue-100 transition-colors whitespace-nowrap" // 按钮样式
          title={`${btn.label}：${btn.latex}`} // 悬停提示
        >
          {btn.label}
        </button>
      </span>
    )
  })
}

/** 公式工具栏主组件 */
export default function FormulaToolbar({ onInsert }: FormulaToolbarProps) {
  /** 控制第二行进阶按钮的展开/折叠状态 */
  const [expanded, setExpanded] = useState(false) // 默认折叠

  return (
    <div className="bg-slate-50 rounded-lg p-2"> {/* 整体容器：浅灰背景+圆角+内边距 */}
      {/* 第一行：小学高频按钮，始终可见 */}
      <div className="flex flex-wrap items-center gap-1">
        {renderButtonGroup(primaryButtons, onInsert)}

        {/* 分类分隔竖线 — 与进阶区域分隔 */}
        <span className="w-px self-stretch bg-slate-300 mx-0.5" />

        {/* 更多按钮 — 展开/折叠进阶区域 */}
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)} // 切换展开状态
          className={cn(
            "flex items-center gap-1 px-2 py-1 text-sm rounded transition-colors", // 基础样式
            expanded
              ? "bg-blue-100 text-blue-700 border border-blue-300" // 展开态样式
              : "bg-white text-slate-600 border border-slate-200 hover:bg-blue-50 hover:border-blue-300" // 折叠态样式
          )}
        >
          <span>更多</span> {/* 按钮文字 */}
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {/* 展开/折叠箭头图标 */}
        </button>
      </div>

      {/* 第二行：进阶按钮，展开时平滑出现 */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out", // 平滑过渡动画
          expanded ? "grid-rows-[1fr] opacity-100 mt-1" : "grid-rows-[0fr] opacity-0" // 展开高度动画
        )}
      >
        <div className="overflow-hidden"> {/* 溢出隐藏，配合高度动画 */}
          <div className="flex flex-wrap items-center gap-1">
            {renderButtonGroup(advancedButtons, onInsert)}
          </div>
        </div>
      </div>
    </div>
  )
}
