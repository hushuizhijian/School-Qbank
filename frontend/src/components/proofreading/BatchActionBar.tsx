/**
 * 批量操作工具栏组件
 *
 * 功能：校对页面多选题号后显示的批量操作栏，支持批量修改题型/难度、入库、删除、AI标准化
 * 输入参数：
 *   - selectedIds: string[] — 选中的题目ID列表
 *   - onClearSelection: () => void — 清空选择回调
 *   - onBatchUpdate: (ids: string[], field: string, value: unknown) => void — 批量修改属性
 *   - onBatchBankImport: (ids: string[]) => void — 批量入库
 *   - onBatchDelete: (ids: string[]) => void — 批量删除
 *   - onBatchAiStandardize?: (ids: string[]) => void — 批量AI标准化（可选）
 * 返回值：React 组件
 * 使用场景：校对页面底部，多选题号后弹出
 */

import { useState } from "react"
import { cn } from "@/utils/cn"
import { QUESTION_TYPE_MAP, DIFFICULTY_MAP } from "@/utils/constants"
import { X, Download, Trash2, Check } from "lucide-react"
import { toast } from "sonner"

/* ========== 类型定义 ========== */

/** 批量操作工具栏 Props */
interface BatchActionBarProps {
  selectedIds: string[]                                                   // 选中的题目ID列表
  onClearSelection: () => void                                            // 清空选择回调
  onBatchUpdate: (ids: string[], field: string, value: unknown) => void   // 批量修改属性
  onBatchBankImport: (ids: string[]) => void                              // 批量入库
  onBatchDelete: (ids: string[]) => void                                  // 批量删除
}

/* ========== 常量 ========== */

/** 旧题型 key 集合（合并到新 6 类，下拉框中需隐藏） */
const LEGACY_TYPE_KEYS = new Set([
  "single_choice", "multi_choice", "single",  // 合并到 choice
  "fill",                                      // 合并到 fill_blank
  "judge",                                     // 合并到 true_false
  "calc",                                      // 合并到 calculation
  "operate",                                   // 合并到 operation
  "solution", "general",                       // 合并到 application
])

/** 题型选项列表（从映射表生成，过滤旧 key） */
const questionTypeOptions = Object.entries(QUESTION_TYPE_MAP)
  .filter(([key]) => !LEGACY_TYPE_KEYS.has(key))
  .map(([value, label]) => ({ value, label })) // 转为 { value, label } 格式

/** 难度选项列表（从映射表生成） */
const difficultyOptions = Object.entries(DIFFICULTY_MAP).map(
  ([value, label]) => ({ value, label }) // 转为 { value, label } 格式
)

/* ========== 子组件：下拉选择+应用按钮 ========== */

/**
 * 属性修改下拉选择器
 *
 * 功能：选择属性值后点击应用，触发批量修改
 * 输入参数：label（标签）、options（选项列表）、onApply（应用回调）
 * 返回值：React 节点
 */
function FieldSelector({
  label,
  options,
  onApply,
}: {
  label: string                                                          // 字段标签
  options: { value: string; label: string }[]                            // 选项列表
  onApply: (value: string) => void                                       // 应用回调
}) {
  const [selectedValue, setSelectedValue] = useState("") // 当前选中的值

  /* ========== 应用修改 ========== */

  const handleApply = () => {
    if (!selectedValue) {
      toast.warning(`请先选择${label}`) // 未选择时提示
      return
    }
    onApply(selectedValue) // 触发应用回调
    setSelectedValue("") // 重置选择
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* 字段标签 */}
      <span className="text-sm text-slate-600 shrink-0">{label}:</span>
      {/* 下拉选择 */}
      <select
        value={selectedValue}
        onChange={(e) => setSelectedValue(e.target.value)} // 选择变更
        className="h-8 px-2 text-sm border border-slate-300 rounded bg-white
                   focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        <option value="">请选择</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {/* 应用按钮 */}
      <button
        onClick={handleApply}
        disabled={!selectedValue} // 未选择时禁用
        className={cn(
          "h-8 px-2.5 text-xs font-medium rounded transition-colors",
          "flex items-center gap-1",
          selectedValue
            ? "bg-blue-500 text-white hover:bg-blue-600" // 有选择：蓝色可点击
            : "bg-slate-100 text-slate-400 cursor-not-allowed" // 无选择：灰色禁用
        )}
      >
        <Check size={12} />应用
      </button>
    </div>
  )
}

/* ========== 主组件 ========== */

/**
 * 批量操作工具栏
 *
 * 功能：选中题目后显示的底部操作栏
 * 布局：左侧选中数量+清空 | 中间题型/难度修改 | 右侧入库/删除/AI标准化
 */
export default function BatchActionBar({
  selectedIds,
  onClearSelection,
  onBatchUpdate,
  onBatchBankImport,
  onBatchDelete,
}: BatchActionBarProps) {
  /* ========== 无选中时不渲染 ========== */

  if (selectedIds.length === 0) return null

  /* ========== 批量修改题型 ========== */

  const handleTypeApply = (value: string) => {
    onBatchUpdate(selectedIds, "question_type", value) // 调用批量修改
    toast.success(`已批量修改题型为「${QUESTION_TYPE_MAP[value]}」`) // 提示成功
  }

  /* ========== 批量修改难度 ========== */

  const handleDifficultyApply = (value: string) => {
    onBatchUpdate(selectedIds, "difficulty", value) // 调用批量修改
    toast.success(`已批量修改难度为「${DIFFICULTY_MAP[value]}」`) // 提示成功
  }

  /* ========== 批量入库 ========== */

  const handleBankImport = () => {
    onBatchBankImport(selectedIds) // 调用批量入库
    toast.success(`已将 ${selectedIds.length} 道题入库`) // 提示成功
  }

  /* ========== 批量删除（二次确认） ========== */

  const handleDelete = () => {
    const confirmed = window.confirm(
      `确定要删除选中的 ${selectedIds.length} 道题吗？此操作不可撤销。`
    ) // 二次确认对话框
    if (!confirmed) return // 取消则不执行
    onBatchDelete(selectedIds) // 调用批量删除
    toast.success(`已删除 ${selectedIds.length} 道题`) // 提示成功
  }

  return (
    <div
      className={cn(
        "sticky bottom-0 z-30", // 固定底部，高层级
        "flex items-center gap-3 px-4 py-2.5",
        "bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]",
        "transition-all duration-200"
      )}
    >
      {/* 左侧：选中数量 + 清空按钮 */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm font-medium text-slate-700">
          已选 <span className="text-blue-600 font-bold">{selectedIds.length}</span> 题
        </span>
        <button
          onClick={onClearSelection}
          className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500
                     hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
        >
          <X size={12} />清空
        </button>
      </div>

      {/* 分隔线 */}
      <div className="w-px h-6 bg-slate-200" />

      {/* 中间：批量修改题型/难度 */}
      <FieldSelector
        label="题型"
        options={questionTypeOptions}
        onApply={handleTypeApply}
      />

      <div className="w-px h-6 bg-slate-200" />

      <FieldSelector
        label="难度"
        options={difficultyOptions}
        onApply={handleDifficultyApply}
      />

      {/* 弹性间距，将右侧按钮推到末尾 */}
      <div className="flex-1" />

      {/* 右侧：批量入库 */}
      <button
        onClick={handleBankImport}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   bg-emerald-500 text-white rounded hover:bg-emerald-600
                   transition-colors shadow-sm"
      >
        <Download size={14} />批量入库
      </button>

      {/* 右侧：批量删除 */}
      <button
        onClick={handleDelete}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                   bg-red-500 text-white rounded hover:bg-red-600
                   transition-colors shadow-sm"
      >
        <Trash2 size={14} />批量删除
      </button>
    </div>
  )
}
