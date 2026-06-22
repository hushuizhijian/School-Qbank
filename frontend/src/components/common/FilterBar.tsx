/**
 * 复合筛选栏组件
 *
 * 功能：题库页顶部的搜索+筛选+批量操作栏
 * 输入参数：keyword（搜索关键词）、quickFilters（快捷筛选标签）、selectedCount（已选题目数量）、
 *   batchActions（批量操作按钮）、total（总题数）、年级/题型/难度筛选参数
 * 返回值：React 组件
 * 使用场景：题库管理页顶部，提供搜索、快捷筛选、高级筛选、批量操作等功能
 */
import { useState, useCallback, useRef, useEffect, type ReactNode } from "react"
import { cn } from "@/utils/cn"
import { QUESTION_TYPE_MAP, DIFFICULTY_MAP, GRADES } from "@/utils/constants"
import {
  Search,
  SlidersHorizontal,
  CheckSquare,
  Trash2,
  Download,
  Edit3,
} from "lucide-react"

/* ========== 类型定义 ========== */

/** 快捷筛选项 */
export interface QuickFilterItem {
  key: string // 筛选项唯一标识
  label: string // 显示文字
  active: boolean // 是否激活
}

/** 批量操作按钮 */
export interface BatchActionItem {
  label: string // 按钮文字
  icon: ReactNode // 按钮图标
  onClick: () => void // 点击回调
  variant?: "default" | "danger" // 按钮样式变体
}

/** 组件 Props */
export interface FilterBarProps {
  keyword: string // 搜索关键词
  onKeywordChange: (keyword: string) => void // 关键词变更回调
  quickFilters: QuickFilterItem[] // 快捷筛选标签列表
  onQuickFilter: (key: string) => void // 快捷筛选点击回调
  selectedCount: number // 已选题目数量
  batchActions?: BatchActionItem[] // 批量操作按钮列表
  total: number // 总题数
  grade?: string // 年级筛选值
  onGradeChange?: (grade: string) => void // 年级变更回调
  questionType?: string // 题型筛选值
  onQuestionTypeChange?: (type: string) => void // 题型变更回调
  difficulty?: string // 难度筛选值
  onDifficultyChange?: (diff: string) => void // 难度变更回调
}

/* ========== 常量 ========== */

/** 防抖延迟（毫秒） */
const DEBOUNCE_MS = 300

/** 批量操作按钮默认图标映射 */
const DEFAULT_BATCH_ICONS: Record<string, ReactNode> = {
  批量修改: <Edit3 size={14} />,
  批量导出: <Download size={14} />,
  批量删除: <Trash2 size={14} />,
}

/* ========== 子组件：SelectDropdown ========== */

/**
 * 简易下拉选择框
 *
 * 输入参数：value - 当前值，options - 选项列表，onChange - 变更回调，label - 标签文字
 * 返回值：React 节点
 */
function SelectDropdown({
  value,
  options,
  onChange,
  label,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (val: string) => void
  label: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      {/* 标签文字 */}
      <span className="text-xs text-slate-500 shrink-0">{label}:</span>
      {/* 下拉选择框 */}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)} // 选择变更
        className="text-sm border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/* ========== 主组件 ========== */

/**
 * 复合筛选栏
 *
 * 功能：搜索框 + 快捷标签 + 高级筛选下拉 + 批量操作栏
 * 输入参数：详见 FilterBarProps
 * 返回值：React 组件
 */
export default function FilterBar({
  keyword,
  onKeywordChange,
  quickFilters,
  onQuickFilter,
  selectedCount,
  batchActions,
  total,
  grade,
  onGradeChange,
  questionType,
  onQuestionTypeChange,
  difficulty,
  onDifficultyChange,
}: FilterBarProps) {
  /* ========== 状态 ========== */

  const [localKeyword, setLocalKeyword] = useState(keyword) // 本地搜索词（防抖前）
  const [showAdvanced, setShowAdvanced] = useState(false) // 高级筛选区是否展开
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // 防抖定时器

  /* ========== 同步外部 keyword ========== */

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalKeyword(keyword) // 外部 keyword 变化时同步本地状态
  }, [keyword])

  /* ========== 防抖搜索 ========== */

  const handleKeywordInput = useCallback(
    (value: string) => {
      setLocalKeyword(value) // 立即更新本地输入

      // 清除上一次防抖定时器
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }

      // 设置新的防抖定时器
      debounceTimer.current = setTimeout(() => {
        onKeywordChange(value) // 300ms 后触发外部回调
      }, DEBOUNCE_MS)
    },
    [onKeywordChange]
  )

  /* ========== 清理防抖定时器 ========== */

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current) // 组件卸载时清理
      }
    }
  }, [])

  /* ========== 年级选项列表 ========== */

  const gradeOptions = [
    { value: "", label: "全部" }, // 默认选项
    ...GRADES.map((g) => ({ value: g, label: g })), // 年级列表
  ]

  /* ========== 题型选项列表 ========== */

  const typeOptions = [
    { value: "", label: "全部" }, // 默认选项
    ...Object.entries(QUESTION_TYPE_MAP).map(([value, label]) => ({
      value,
      label,
    })), // 题型列表
  ]

  /* ========== 难度选项列表 ========== */

  const difficultyOptions = [
    { value: "", label: "全部" }, // 默认选项
    ...Object.entries(DIFFICULTY_MAP).map(([value, label]) => ({
      value,
      label,
    })), // 难度列表
  ]

  /* ========== 渲染 ========== */

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2.5">
      {/* 第一行：搜索框 + 高级筛选切换 */}
      <div className="flex items-center gap-2">
        {/* 搜索框 */}
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" // 搜索图标
          />
          <input
            type="text"
            value={localKeyword}
            onChange={(e) => handleKeywordInput(e.target.value)} // 防抖输入
            placeholder="搜索题干/答案/解析..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-md outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 placeholder:text-slate-400 transition-colors"
          />
        </div>

        {/* 高级筛选切换按钮 */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)} // 切换展开/折叠
          className={cn(
            "flex items-center gap-1 px-3 py-2 text-sm rounded-md border transition-colors shrink-0",
            showAdvanced
              ? "border-blue-300 bg-blue-50 text-blue-600" // 展开状态
              : "border-slate-200 text-slate-600 hover:bg-slate-50" // 折叠状态
          )}
        >
          <SlidersHorizontal size={14} />
          高级筛选
        </button>
      </div>

      {/* 第二行：快捷筛选标签 + 总题数 */}
      <div className="flex items-center gap-2">
        {/* 快捷标签列表 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {quickFilters.map((filter) => (
            <button
              key={filter.key}
              onClick={() => onQuickFilter(filter.key)} // 点击切换筛选
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border transition-colors",
                filter.active
                  ? "border-blue-300 bg-blue-50 text-blue-600 font-medium" // 激活状态
                  : "border-slate-200 text-slate-600 hover:bg-slate-50" // 未激活状态
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* 总题数 */}
        <span className="ml-auto text-xs text-slate-400 shrink-0">
          共 {total} 道
        </span>
      </div>

      {/* 第三行：高级筛选区（年级/题型/难度下拉框） */}
      {showAdvanced && (
        <div className="flex items-center gap-4 flex-wrap pt-1">
          {/* 年级筛选 */}
          {onGradeChange && (
            <SelectDropdown
              value={grade ?? ""}
              options={gradeOptions}
              onChange={onGradeChange}
              label="年级"
            />
          )}

          {/* 题型筛选 */}
          {onQuestionTypeChange && (
            <SelectDropdown
              value={questionType ?? ""}
              options={typeOptions}
              onChange={onQuestionTypeChange}
              label="题型"
            />
          )}

          {/* 难度筛选 */}
          {onDifficultyChange && (
            <SelectDropdown
              value={difficulty ?? ""}
              options={difficultyOptions}
              onChange={onDifficultyChange}
              label="难度"
            />
          )}
        </div>
      )}

      {/* 第四行：批量操作栏（选中后显示） */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          {/* 全选图标 + 已选数量 */}
          <CheckSquare size={14} className="text-blue-500 shrink-0" />
          <span className="text-xs text-slate-600">
            已选 {selectedCount} 题
          </span>

          {/* 批量操作按钮 */}
          <div className="flex items-center gap-1.5 ml-2">
            {batchActions?.map((action, idx) => (
              <button
                key={idx}
                onClick={action.onClick} // 执行批量操作
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 text-xs rounded border transition-colors",
                  action.variant === "danger"
                    ? "border-red-200 text-red-600 hover:bg-red-50" // 危险操作样式
                    : "border-slate-200 text-slate-600 hover:bg-slate-50" // 默认样式
                )}
              >
                {/* 图标：优先使用传入图标，否则使用默认映射 */}
                {action.icon ?? DEFAULT_BATCH_ICONS[action.label] ?? null}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
