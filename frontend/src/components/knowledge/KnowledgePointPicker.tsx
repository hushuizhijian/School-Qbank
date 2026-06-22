/**
 * 知识点选择器组件（校对工作台专用）
 *
 * 功能：在校对工作台中提供"搜索 + AI 智能创建 + 标签展示"的知识点选择器
 * 布局：
 *   - 顶部：搜索框（输入即搜索）
 *   - 中部：搜索结果下拉（命中已有节点可点击添加；未命中时显示 AI 智能创建按钮）
 *   - 底部：和搜索框等宽等高的展示框，存放 AI 确认 + 用户添加的知识点标签，支持删除
 *
 * 输入参数：
 *   - selectedItems：当前题目已选知识点简要信息列表（含 id/name/code/level）
 *   - onChange：选中变化回调（父组件负责持久化）
 *   - subject：学科（默认"数学"）
 *   - aiSelection：AI 供应商/模型选择（用于智能创建）
 * 返回值：React 组件
 * 使用场景：校对工作台 → 属性编辑面板 → 知识点选择
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { cn } from "@/utils/cn"
import { searchKnowledge, findOrCreateSmart, type FindOrCreateSmartResult } from "@/api/knowledge"
import type { KnowledgeSearchResult } from "@/types/knowledge"
import type { KnowledgePointItem } from "@/types/question"
import { Search, X, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

/* ========== 类型定义 ========== */

/** AI 供应商/模型选择 */
export interface AiSelection {
  providerKey?: string
  instanceName?: string
  modelKey?: string
}

/** 组件 Props */
interface KnowledgePointPickerProps {
  selectedItems: KnowledgePointItem[]                                    // 已选中的知识点简要信息（含 id/name/code/level）
  onChange: (items: KnowledgePointItem[]) => void                        // 选中变化回调（传出新对象列表，保留顺序与名称）
  subject?: string                                                     // 学科（默认 数学）
  aiSelection?: AiSelection                                            // AI 供应商/模型选择
}

/* ========== 常量 ========== */

/** 防抖延迟（毫秒） */
const DEBOUNCE_MS = 300

/** 一道题最多绑定的知识点数量 */
const MAX_KNOWLEDGE_POINTS = 3

/* ========== 主组件 ========== */

export default function KnowledgePointPicker({
  selectedItems,
  onChange,
  subject = "数学",
  aiSelection,
}: KnowledgePointPickerProps) {
  /* ========== 状态 ========== */

  const [searchQuery, setSearchQuery] = useState("")                     // 搜索关键词
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([])  // 搜索结果
  const [searching, setSearching] = useState(false)                      // 搜索中状态
  const [showDropdown, setShowDropdown] = useState(false)                // 是否显示下拉
  const [creating, setCreating] = useState(false)                       // AI 智能创建中状态
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)  // 防抖定时器

  /* ========== 防抖搜索 ========== */

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query)                                              // 更新搜索词
      // 清空搜索词 → 隐藏下拉
      if (!query.trim()) {
        setShowDropdown(false)
        setSearchResults([])
        return
      }
      setShowDropdown(true)                                              // 显示下拉
      // 清除上一次防抖定时器
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
      // 设置新的防抖定时器
      debounceTimer.current = setTimeout(async () => {
        setSearching(true)                                               // 开始搜索
        try {
          const results = await searchKnowledge(query.trim())            // 调用搜索 API
          setSearchResults(results)                                      // 存储结果
        } catch (err) {
          console.error("搜索知识点失败:", err)
          setSearchResults([])                                           // 失败清空
        } finally {
          setSearching(false)                                            // 结束搜索
        }
      }, DEBOUNCE_MS)
    },
    []
  )

  /* ========== 选中/取消知识点 ========== */

  const toggleSelect = useCallback(
    (kp: KnowledgePointItem) => {
      const exists = selectedItems.some((it) => it.id === kp.id)
      if (exists) {
        // 已选 → 取消选中
        onChange(selectedItems.filter((it) => it.id !== kp.id))
      } else {
        // 未选 → 检查上限
        if (selectedItems.length >= MAX_KNOWLEDGE_POINTS) {
          toast.warning(`一道题最多绑定 ${MAX_KNOWLEDGE_POINTS} 个知识点`)
          return
        }
        onChange([...selectedItems, kp])
      }
    },
    [selectedItems, onChange]
  )

  /* ========== 移除知识点 ========== */

  const removeSelected = useCallback(
    (kpId: string) => {
      onChange(selectedItems.filter((it) => it.id !== kpId))
    },
    [selectedItems, onChange]
  )

  /* ========== AI 智能创建并添加 ========== */

  const handleAiCreate = useCallback(async () => {
    const name = searchQuery.trim()
    if (!name) return                                                    // 空字符串跳过
    if (selectedItems.length >= MAX_KNOWLEDGE_POINTS) {
      toast.warning(`一道题最多绑定 ${MAX_KNOWLEDGE_POINTS} 个知识点`)
      return
    }
    setCreating(true)                                                    // 开始创建
    try {
      const result: FindOrCreateSmartResult = await findOrCreateSmart(
        name,
        subject,
        aiSelection
      )
      // 本地成功加入
      if (result.is_new) {
        toast.success(
          `AI 已智能创建"${result.name}"` +
            (result.parent_name ? `并挂到「${result.parent_name}」下` : "")
        )
      } else if (result.fuzzy_matched) {
        toast.success(`已匹配到相似知识点"${result.name}"`)
      } else {
        toast.success(`已添加"${result.name}"`)
      }
      // 加入到选中列表（构造对象条目）
      if (!selectedItems.some((it) => it.id === result.id)) {
        onChange([
          ...selectedItems,
          { id: result.id, name: result.name, code: "", level: 0 },
        ])
      }
      // 清空搜索框
      setSearchQuery("")
      setShowDropdown(false)
      setSearchResults([])
    } catch (err) {
      console.error("AI 智能创建失败:", err)
      toast.error("AI 智能创建失败，请重试")
    } finally {
      setCreating(false)                                                 // 结束创建
    }
  }, [searchQuery, selectedItems, subject, aiSelection, onChange])

  /* ========== 清理定时器 ========== */

  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }
    }
  }, [])

  /* ========== 计算"未命中"标志 ========== */

  // 当前搜索词在结果中完全没有匹配时，提示 AI 智能创建
  const noMatch = showDropdown && !searching && searchQuery.trim() && searchResults.length === 0

  /* ========== 渲染 ========== */

  return (
    <div className="relative">
      {/* ====== 搜索框（高度固定 32px） ====== */}
      <div className="relative h-8 border border-slate-300 rounded bg-white">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"  // 搜索图标
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}                  // 输入即触发防抖搜索
          onFocus={() => searchQuery.trim() && setShowDropdown(true)}    // 聚焦时如有内容则显示
          placeholder="搜索知识点..."
          className="w-full h-full pl-8 pr-3 text-sm border-0 outline-none focus:ring-0 placeholder:text-slate-400 bg-transparent"
        />
        {/* 搜索中指示器 */}
        {searching && (
          <Loader2
            size={12}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin"
          />
        )}
      </div>

      {/* ====== 搜索结果下拉 ====== */}
      {showDropdown && (searchResults.length > 0 || searching || noMatch) && (
        <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded shadow-lg">
          {/* 搜索中 */}
          {searching && (
            <div className="px-3 py-2 text-xs text-slate-400">搜索中...</div>
          )}

          {/* 命中结果列表 */}
          {!searching && searchResults.map((item) => {
            const isSelected = selectedItems.some((it) => it.id === item.id)
            return (
              <div
                key={item.id}
                onClick={() => {
                  toggleSelect({ id: item.id, name: item.name, code: item.code, level: item.level })  // 选中/取消
                  setSearchQuery("")                                      // 清空搜索
                  setShowDropdown(false)
                  setSearchResults([])
                }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors text-sm",
                  "hover:bg-blue-50",
                  isSelected && "bg-blue-50 text-blue-700"
                )}
              >
                {/* 选中勾 */}
                <span
                  className={cn(
                    "shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center",
                    isSelected ? "bg-blue-500 border-blue-500" : "border-slate-300"
                  )}
                >
                  {isSelected && (
                    <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 text-white">
                      <path d="M3 8l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {/* 名称 */}
                <span className="truncate">{item.name}</span>
                {/* 路径 */}
                {item.path.length > 0 && (
                  <span className="ml-auto text-[10px] text-slate-400 truncate shrink min-w-0">
                    {item.path.join(" / ")}
                  </span>
                )}
              </div>
            )
          })}

          {/* 未命中：AI 智能创建按钮 */}
          {!searching && noMatch && (
            <div className="px-3 py-2 flex items-center justify-between bg-amber-50 border-t border-amber-100">
              <span className="text-xs text-amber-700">
                知识树中没有「{searchQuery.trim()}」
              </span>
              <button
                onClick={handleAiCreate}
                disabled={creating}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors",
                  creating
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-amber-500 text-white hover:bg-amber-600"
                )}
              >
                {creating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                AI 智能创建并添加
              </button>
            </div>
          )}
        </div>
      )}

      {/* ====== AI 确认 / 用户选择展示框（与搜索框等宽等高） ====== */}
      <div
        className={cn(
          "mt-2 min-h-8 w-full px-2 py-1 border rounded bg-slate-50",
          "flex flex-wrap items-center gap-1.5",
          selectedItems.length > 0 ? "border-slate-300" : "border-dashed border-slate-300"
        )}
        style={{ minHeight: "32px" }}                                     // 与搜索框同高
      >
        {/* 提示文字（无选中时） */}
        {selectedItems.length === 0 && (
          <span className="text-xs text-slate-400 px-1">
            暂无知识点，请在搜索框搜索或 AI 智能创建
          </span>
        )}

        {/* 选中标签列表 */}
        {selectedItems.map((item) => (
          <SelectedKpChip
            key={item.id}
            item={item}
            onRemove={() => removeSelected(item.id)}
          />
        ))}

        {/* 数量提示 */}
        {selectedItems.length > 0 && (
          <span className="ml-auto text-[10px] text-slate-400 shrink-0">
            {selectedItems.length}/{MAX_KNOWLEDGE_POINTS}
          </span>
        )}
      </div>
    </div>
  )
}

/* ========== 子组件：已选知识点标签 ========== */

/**
 * 已选知识点标签
 *
 * 功能：在展示框中显示一个知识点标签，含删除按钮
 *       优先显示 item.name；若 item 无 name 则回退到 id 前 8 位
 */
function SelectedKpChip({
  item,
  onRemove,
}: {
  item: KnowledgePointItem
  onRemove: () => void
}) {
  /* ========== 渲染 ========== */
  const label = item.name || (item.id ? item.id.slice(0, 8) : '未知')    // 优先 name，否则截断 id
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
      {/* 名称或 ID 截断 */}
      {label}
      {/* 删除按钮 */}
      <button
        onClick={onRemove}
        className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
        title="移除"
      >
        <X size={10} />
      </button>
    </span>
  )
}
