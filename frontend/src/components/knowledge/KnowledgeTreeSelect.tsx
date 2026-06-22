/**
 * 知识点树形选择器组件
 *
 * 功能：提供搜索 + 树形浏览 + 已选标签展示的知识点选择器
 * 输入参数：selectedIds（已选ID列表）、onChange（选中变化回调）、multiple（是否多选）
 * 返回值：React 组件
 * 使用场景：题目编辑、作业组卷等需要选择知识点的表单
 */
import { useState, useEffect, useCallback, useRef } from "react"
import { cn } from "@/utils/cn"
import { getKnowledgeTree, searchKnowledge } from "@/api/knowledge"
import type { KnowledgePoint, KnowledgeSearchResult } from "@/types/knowledge"
import { Search, ChevronRight, ChevronDown, X, BookOpen } from "lucide-react"

/* ========== 类型定义 ========== */

/** 树节点（嵌套结构） */
interface TreeNodeItem extends KnowledgePoint {
  children: TreeNodeItem[] // 子节点列表
}

/** 组件 Props */
interface KnowledgeTreeSelectProps {
  selectedIds: string[] // 已选中的知识点ID列表
  onChange: (ids: string[]) => void // 选中变化回调
  multiple?: boolean // 是否多选，默认 true
}

/* ========== 常量 ========== */

/** 防抖延迟（毫秒） */
const DEBOUNCE_MS = 300

/** 各层级对应的样式配置 */
const LEVEL_STYLES: Record<number, { dot: string; text: string }> = {
  1: { dot: "", text: "font-bold" }, // 学科：加粗，无圆点
  2: { dot: "bg-green-500", text: "" }, // 年级：绿色圆点
  3: { dot: "bg-blue-500", text: "" }, // 学期：蓝色圆点
  4: { dot: "bg-gray-400", text: "" }, // 单元：灰色圆点
  5: { dot: "bg-orange-400", text: "" }, // 知识点：橙色圆点
}

/* ========== 工具函数 ========== */

/**
 * 将扁平知识点列表组装为嵌套树结构
 *
 * 输入参数：flatList - 扁平知识点列表
 * 返回值：嵌套树结构数组
 */
function buildTree(flatList: KnowledgePoint[]): TreeNodeItem[] {
  // 构建 id → TreeNodeItem 映射表
  const nodeMap = new Map<string, TreeNodeItem>()

  flatList.forEach((item) => {
    nodeMap.set(item.id, { ...item, children: [] }) // 初始化每个节点
  })

  const roots: TreeNodeItem[] = [] // 根节点列表

  flatList.forEach((item) => {
    const node = nodeMap.get(item.id)! // 获取当前节点
    if (item.parent_id && nodeMap.has(item.parent_id)) {
      // 有父节点 → 挂到父节点的 children 下
      nodeMap.get(item.parent_id)!.children.push(node)
    } else {
      // 无父节点 → 作为根节点
      roots.push(node)
    }
  })

  return roots
}

/**
 * 从树中递归查找指定 ID 的节点名称
 *
 * 输入参数：nodes - 树节点数组，id - 目标节点ID
 * 返回值：节点名称或 undefined
 */
function findNodeName(nodes: TreeNodeItem[], id: string): string | undefined {
  for (const node of nodes) {
    if (node.id === id) return node.name // 命中返回名称
    const found = findNodeName(node.children, id) // 递归查找子节点
    if (found) return found
  }
  return undefined
}

/* ========== 子组件：TreeNode ========== */

/**
 * 树节点组件（递归渲染）
 *
 * 输入参数：node - 树节点数据，expandedIds - 已展开节点ID集合，
 *   selectedIds - 已选中ID列表，onToggleExpand - 展开/折叠回调，
 *   onToggleSelect - 选中/取消回调，multiple - 是否多选
 * 返回值：React 节点
 */
function TreeNode({
  node,
  expandedIds,
  selectedIds,
  onToggleExpand,
  onToggleSelect,
  multiple,
}: {
  node: TreeNodeItem
  expandedIds: Set<string>
  selectedIds: string[]
  onToggleExpand: (id: string) => void
  onToggleSelect: (id: string) => void
  multiple: boolean
}) {
  const hasChildren = node.children.length > 0 // 是否有子节点
  const isExpanded = expandedIds.has(node.id) // 是否已展开
  const isSelected = selectedIds.includes(node.id) // 是否已选中
  const style = LEVEL_STYLES[node.level] || LEVEL_STYLES[5] // 获取层级样式

  return (
    <div>
      {/* 单个节点行 */}
      <div
        className={cn(
          "flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer transition-colors",
          "hover:bg-slate-100",
          isSelected && "bg-blue-50 border-l-2 border-l-blue-500" // 选中：蓝色浅背景 + 左边框
        )}
        style={{ paddingLeft: `${(node.level - 1) * 20 + 8}px` }} // 层级缩进
      >
        {/* 展开/折叠箭头 */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation() // 阻止冒泡
              onToggleExpand(node.id)
            }}
            className="shrink-0 p-0.5 rounded hover:bg-slate-200 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-slate-500" /> // 展开状态
            ) : (
              <ChevronRight size={14} className="text-slate-500" /> // 折叠状态
            )}
          </button>
        ) : (
          // 无子节点 → 占位保持对齐
          <span className="w-[22px] shrink-0" />
        )}

        {/* 层级图标/圆点 */}
        {node.level === 1 ? (
          // 学科层级：BookOpen 图标
          <BookOpen size={14} className="shrink-0 text-slate-600" />
        ) : (
          // 其他层级：彩色圆点
          <span
            className={cn(
              "shrink-0 w-2 h-2 rounded-full",
              style.dot
            )}
          />
        )}

        {/* 选中复选框样式 */}
        <button
          onClick={() => onToggleSelect(node.id)}
          className={cn(
            "shrink-0 w-4 h-4 rounded border transition-colors",
            isSelected
              ? "bg-blue-500 border-blue-500" // 选中：蓝色填充
              : "border-slate-300 hover:border-blue-400" // 未选中：灰色边框
          )}
        >
          {isSelected && (
            // 选中勾号
            <svg viewBox="0 0 16 16" className="w-full h-full text-white">
              <path
                d="M3 8l3 3 7-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>

        {/* 节点名称 */}
        <span
          onClick={() => onToggleSelect(node.id)}
          className={cn(
            "text-sm truncate select-none",
            style.text, // 层级文字样式
            isSelected && "text-blue-700 font-medium" // 选中文字高亮
          )}
        >
          {node.name}
        </span>

        {/* 题目数量角标 */}
        {node.question_count > 0 && (
          <span className="ml-auto text-[11px] text-slate-400 shrink-0">
            {node.question_count}题
          </span>
        )}
      </div>

      {/* 子节点（展开时渲染） */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              expandedIds={expandedIds}
              selectedIds={selectedIds}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              multiple={multiple}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ========== 主组件 ========== */

/**
 * 知识点树形选择器
 *
 * 功能：搜索框 + 树形列表 + 已选标签展示
 * 输入参数：selectedIds、onChange、multiple
 * 返回值：React 组件
 */
export default function KnowledgeTreeSelect({
  selectedIds,
  onChange,
  multiple = true,
}: KnowledgeTreeSelectProps) {
  /* ========== 状态 ========== */

  const [treeData, setTreeData] = useState<TreeNodeItem[]>([]) // 树形数据
  const [loading, setLoading] = useState(false) // 加载状态
  const [error, setError] = useState<string | null>(null) // 错误信息
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set()) // 展开的节点ID集合
  const [searchQuery, setSearchQuery] = useState("") // 搜索关键词
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]) // 搜索结果
  const [searching, setSearching] = useState(false) // 搜索中状态
  const [isSearchMode, setIsSearchMode] = useState(false) // 是否处于搜索模式

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // 防抖定时器

  /* ========== 加载知识树 ========== */

  useEffect(() => {
    let cancelled = false // 防止组件卸载后更新状态

    async function fetchTree() {
      setLoading(true) // 开始加载
      setError(null) // 清空错误
      try {
        const res = await getKnowledgeTree() // 调用API获取知识树
        if (cancelled) return // 已卸载则跳过
        const tree = buildTree(res.tree) // 扁平列表转嵌套树
        setTreeData(tree) // 存储树数据

        // 默认展开第一层和第二层
        const defaultExpanded = new Set<string>()
        tree.forEach((root) => {
          defaultExpanded.add(root.id) // 展开学科
          root.children.forEach((grade) => {
            defaultExpanded.add(grade.id) // 展开年级
          })
        })
        setExpandedIds(defaultExpanded)
      } catch (err) {
        if (cancelled) return
        setError("加载知识树失败，请刷新重试") // 设置错误提示
        console.error("加载知识树失败:", err)
      } finally {
        if (!cancelled) setLoading(false) // 结束加载
      }
    }

    fetchTree()

    return () => {
      cancelled = true // 清理标记
    }
  }, [])

  /* ========== 防抖搜索 ========== */

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query) // 更新搜索词

      // 清空搜索词 → 退出搜索模式
      if (!query.trim()) {
        setIsSearchMode(false)
        setSearchResults([])
        return
      }

      setIsSearchMode(true) // 进入搜索模式

      // 清除上一次防抖定时器
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current)
      }

      // 设置新的防抖定时器
      debounceTimer.current = setTimeout(async () => {
        setSearching(true) // 开始搜索
        try {
          const results = await searchKnowledge(query.trim()) // 调用搜索API
          setSearchResults(results) // 存储搜索结果
        } catch (err) {
          console.error("搜索知识点失败:", err)
          setSearchResults([]) // 搜索失败清空结果
        } finally {
          setSearching(false) // 结束搜索
        }
      }, DEBOUNCE_MS) // 300ms 防抖
    },
    []
  )

  /* ========== 展开/折叠节点 ========== */

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id) // 已展开 → 折叠
      } else {
        next.add(id) // 已折叠 → 展开
      }
      return next
    })
  }, [])

  /* ========== 选中/取消选中节点 ========== */

  const toggleSelect = useCallback(
    (id: string) => {
      if (multiple) {
        // 多选模式：切换当前项
        if (selectedIds.includes(id)) {
          onChange(selectedIds.filter((sid) => sid !== id)) // 取消选中
        } else {
          onChange([...selectedIds, id]) // 添加选中
        }
      } else {
        // 单选模式：选中当前项，取消其他
        if (selectedIds.includes(id)) {
          onChange([]) // 取消选中
        } else {
          onChange([id]) // 只选一个
        }
      }
    },
    [selectedIds, onChange, multiple]
  )

  /* ========== 移除已选标签 ========== */

  const removeSelected = useCallback(
    (id: string) => {
      onChange(selectedIds.filter((sid) => sid !== id)) // 从已选列表移除
    },
    [selectedIds, onChange]
  )

  /* ========== 获取已选节点名称 ========== */

  const selectedNames = selectedIds
    .map((id) => {
      const name = findNodeName(treeData, id) // 从树中查找名称
      return name ? { id, name } : null
    })
    .filter(Boolean) as { id: string; name: string }[]

  /* ========== 渲染 ========== */

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden">
      {/* 搜索框区域 */}
      <div className="relative border-b border-slate-200">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" // 搜索图标
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)} // 输入即触发防抖搜索
          placeholder="搜索知识点..."
          className="w-full pl-9 pr-3 py-2.5 text-sm border-0 outline-none focus:ring-0 placeholder:text-slate-400"
        />
        {/* 搜索中指示器 */}
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            搜索中...
          </span>
        )}
      </div>

      {/* 树形列表 / 搜索结果区域 */}
      <div className="max-h-[320px] overflow-y-auto">
        {/* 加载状态 */}
        {loading && (
          <div className="flex items-center justify-center py-8 text-sm text-slate-400">
            加载中...
          </div>
        )}

        {/* 错误状态 */}
        {error && (
          <div className="flex flex-col items-center justify-center py-8 text-sm text-red-500">
            <span>{error}</span>
            <button
              onClick={() => window.location.reload()} // 刷新重试
              className="mt-2 text-xs text-blue-500 hover:underline"
            >
              点击刷新
            </button>
          </div>
        )}

        {/* 搜索模式：显示搜索结果列表 */}
        {!loading && !error && isSearchMode && (
          <div>
            {searchResults.length === 0 && !searching ? (
              // 无搜索结果
              <div className="py-8 text-center text-sm text-slate-400">
                未找到匹配的知识点
              </div>
            ) : (
              // 搜索结果列表
              searchResults.map((item) => {
                const isSelected = selectedIds.includes(item.id) // 是否已选中
                return (
                  <div
                    key={item.id}
                    onClick={() => toggleSelect(item.id)} // 点击选中/取消
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                      "hover:bg-slate-50",
                      isSelected && "bg-blue-50 border-l-2 border-l-blue-500" // 选中样式
                    )}
                  >
                    {/* 选中复选框 */}
                    <span
                      className={cn(
                        "shrink-0 w-4 h-4 rounded border transition-colors flex items-center justify-center",
                        isSelected
                          ? "bg-blue-500 border-blue-500"
                          : "border-slate-300"
                      )}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 16 16" className="w-3 h-3 text-white">
                          <path
                            d="M3 8l3 3 7-7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>

                    {/* 搜索结果信息 */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm truncate">{item.name}</div>
                      {/* 路径信息 */}
                      {item.path.length > 0 && (
                        <div className="text-[11px] text-slate-400 truncate">
                          {item.path.join(" / ")}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* 树形浏览模式 */}
        {!loading && !error && !isSearchMode && (
          <div>
            {treeData.length === 0 ? (
              // 空树提示
              <div className="py-8 text-center text-sm text-slate-400">
                暂无知识点数据
              </div>
            ) : (
              // 递归渲染树节点
              treeData.map((root) => (
                <TreeNode
                  key={root.id}
                  node={root}
                  expandedIds={expandedIds}
                  selectedIds={selectedIds}
                  onToggleExpand={toggleExpand}
                  onToggleSelect={toggleSelect}
                  multiple={multiple}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* 已选标签展示区 */}
      {selectedNames.length > 0 && (
        <div className="border-t border-slate-200 px-3 py-2 bg-slate-50">
          <div className="flex items-start gap-1.5 flex-wrap">
            {/* 标签标题 */}
            <span className="text-xs text-slate-500 pt-0.5 shrink-0">
              已选:
            </span>
            {/* 已选标签列表 */}
            {selectedNames.map(({ id, name }) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700" // 蓝色标签样式
              >
                {name}
                <button
                  onClick={() => removeSelected(id)} // 点击 X 移除
                  className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
