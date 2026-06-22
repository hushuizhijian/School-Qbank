/**
 * KnowledgeTreePanel — 知识点树形筛选面板（重构版）
 *
 * 功能：题库管理页左侧知识点树，复用 KnowledgeGraphTree（select 模式）
 *   - 顶部面包屑（点击节点定位）
 *   - 搜索 + 多选筛选（OR 语义）
 *   - 底部已选统计
 * 输入参数：selectedIds（已选知识点ID列表）、onChange（筛选变更回调）、questionCounts（各知识点题目数量映射）
 * 返回值：React 组件
 * 使用场景：题库管理页（QuestionBankPage）左侧筛选面板
 */
import { useState, useEffect, useMemo, useCallback } from "react"
import { X, CheckCheck, ListTree } from "lucide-react"
import KnowledgeGraphTree from "./KnowledgeGraphTree"
import { getKnowledgeTree } from "@/api/knowledge"

/** 组件 Props */
interface KnowledgeTreePanelProps {
  selectedIds: string[] // 当前选中的知识点ID列表
  onChange: (ids: string[]) => void // 筛选变更回调
  questionCounts?: Record<string, number> // 各知识点下的题目数量映射（外部传入）
}

/**
 * 知识点树形筛选面板（包装版）
 *
 * 功能：在 KnowledgeGraphTree 基础上增加题库页特有的"已选统计"底部
 * 输入参数：selectedIds、onChange、questionCounts
 * 返回值：React 组件
 */
export default function KnowledgeTreePanel({
  selectedIds,
  onChange,
  questionCounts,
}: KnowledgeTreePanelProps) {
  /* ========== 状态 ========== */

  // 焦点节点 ID（用于面包屑联动）
  const [_focusedId, setFocusedId] = useState<string | null>(null)

  // id → name 映射（用于底部"已选"标签展示名称）
  const [nameMap, setNameMap] = useState<Record<string, string>>({})

  /* ========== 拉取树填充 nameMap ========== */

  /**
   * 拉取扁平知识树并构建 id→name 映射
   *
   * 输入参数：无
   * 返回值：Promise
   */
  const refreshNameMap = useCallback(async () => {
    try {
      const res = await getKnowledgeTree()
      // res.tree 是扁平列表（已传 flat=true），直接遍历建映射
      const map: Record<string, string> = {}
      for (const n of res.tree) {
        map[n.id] = n.name
      }
      setNameMap(map)
    } catch (err) {
      console.error("拉取知识树失败:", err)
    }
  }, [])

  // 首次挂载时拉一次
  useEffect(() => {
    refreshNameMap()
  }, [refreshNameMap])

  // 监听 selectedIds 变化：若 nameMap 中有缺失则补拉一次
  useEffect(() => {
    const missing = selectedIds.find((id) => !nameMap[id])
    if (missing) refreshNameMap()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds])

  const selectedNames = useMemo(() => {
    return selectedIds
      .map((id) => (nameMap[id] ? { id, name: nameMap[id] } : null))
      .filter(Boolean) as { id: string; name: string }[]
  }, [selectedIds, nameMap])

  /* ========== 渲染 ========== */

  return (
    <div className="flex flex-col h-full border border-slate-200 rounded-lg bg-white overflow-hidden">
      {/* 知识图谱主体（select 模式） */}
      <div className="flex-1 min-h-0">
        <KnowledgeGraphTree
          mode="select"
          subject="数学"
          selectedIds={selectedIds}
          onSelectedChange={onChange}
          onFocusChange={setFocusedId}
          defaultExpandAll={false}
          showBreadcrumb={true}
          showSearch={true}
          showAddRoot={false}
          questionCounts={questionCounts}
        />
      </div>

      {/* ========== 底部已选统计 ========== */}
      {selectedNames.length > 0 && (
        <div className="border-t border-slate-200 px-2.5 py-2 bg-slate-50 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-600 font-medium inline-flex items-center gap-1">
              <ListTree size={11} className="text-blue-500" />
              已选 {selectedNames.length} 个知识点
            </span>
            <button
              onClick={() => onChange([])}
              className="text-[11px] text-blue-500 hover:text-blue-700 hover:underline transition-colors inline-flex items-center gap-0.5"
            >
              <CheckCheck size={10} />
              清空
            </button>
          </div>
          {/* 已选标签列表（最多显示 3 个） */}
          <div className="flex items-start gap-1 flex-wrap mt-1.5">
            {selectedNames.slice(0, 3).map(({ id, name }) => (
              <span
                key={id}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 max-w-[120px]"
              >
                <span className="truncate">{name}</span>
                <button
                  onClick={() => onChange(selectedIds.filter((sid) => sid !== id))}
                  className="hover:bg-blue-200 rounded-full p-0.5 transition-colors shrink-0"
                  aria-label="移除"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
            {selectedNames.length > 3 && (
              <span className="text-[11px] text-slate-400 px-1 py-0.5">
                +{selectedNames.length - 3}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
