/**
 * KnowledgeGraphTree — 知识图谱树形组件（可复用基础组件）
 *
 * 功能：
 *   - 渲染可点击展开/折叠的层级知识图谱（学科 > 年级 > 学期 > 单元 > 知识点）
 *   - 支持三种模式：edit（系统设置页可编辑） / readonly（只读） / select（题库页多选筛选）
 *   - 内置面包屑（当前位置）、搜索过滤（高亮匹配）、统计信息
 *   - 编辑模式支持：新增子节点、重命名、移动（改父）、删除（级联）
 *
 * 输入参数：见 KnowledgeGraphTreeProps
 * 返回值：React 组件
 * 使用场景：系统设置 → 知识树管理；题库管理 → 知识点筛选
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { cn } from "@/utils/cn"
import { getKnowledgeTree } from "@/api/knowledge"
import {
  createKnowledgeNode,
  updateKnowledgeNode,
  deleteKnowledgeNode,
  moveKnowledgeNode,
  getDescendantCount,
} from "@/api/knowledge"
import type { KnowledgePoint } from "@/types/knowledge"
import {
  Search,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  BookOpen,
  X,
  Loader2,
  ListTree,
  Library,
  Info,
  CheckCheck,
  Plus,
  Pencil,
  Trash2,
  Move,
  ChevronRight as ChevronRightIcon,
} from "lucide-react"
import { toast } from "sonner"
import ConfirmDialog from "@/components/common/ConfirmDialog"

/* ========== 类型定义 ========== */

/** 树节点（嵌套结构） */
export interface TreeNodeItem extends KnowledgePoint {
  children: TreeNodeItem[]
}

/** 组件模式 */
export type KnowledgeGraphMode = "edit" | "readonly" | "select"

/** 组件 Props */
export interface KnowledgeGraphTreeProps {
  /** 组件模式：edit 可编辑 / readonly 只读 / select 多选筛选 */
  mode?: KnowledgeGraphMode
  /** 默认学科（用于新增节点） */
  subject?: string
  /** 受控选中 ID 列表（select 模式使用） */
  selectedIds?: string[]
  /** 选中变化回调（select 模式使用） */
  onSelectedChange?: (ids: string[]) => void
  /** 焦点节点变化回调（用于外部面包屑联动） */
  onFocusChange?: (id: string | null) => void
  /** 默认是否全部展开 */
  defaultExpandAll?: boolean
  /** 是否显示顶部面包屑（默认 true） */
  showBreadcrumb?: boolean
  /** 是否显示搜索框（默认 true） */
  showSearch?: boolean
  /** 编辑模式下是否显示"新增根节点"按钮（默认 true） */
  showAddRoot?: boolean
  /** 各节点题目数量（外部传入） */
  questionCounts?: Record<string, number>
  /** 类名 */
  className?: string
}

/* ========== 常量 ========== */

/** 防抖延迟（毫秒） */
const DEBOUNCE_MS = 200

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
    nodeMap.set(item.id, { ...item, children: [] })
  })

  const roots: TreeNodeItem[] = []
  flatList.forEach((item) => {
    const node = nodeMap.get(item.id)!
    if (item.parent_id && nodeMap.has(item.parent_id)) {
      // 有父节点 → 挂到父节点 children 下
      nodeMap.get(item.parent_id)!.children.push(node)
    } else {
      // 无父节点 → 作为根节点
      roots.push(node)
    }
  })
  return roots
}

/**
 * 递归统计树的节点总数（含所有层级）
 *
 * 输入参数：nodes - 树节点数组
 * 返回值：节点总数
 */
function countAllNodes(nodes: TreeNodeItem[]): number {
  let total = 0
  for (const node of nodes) {
    total += 1 + countAllNodes(node.children)
  }
  return total
}

/**
 * 从树中递归查找指定 ID 的节点
 *
 * 输入参数：nodes - 树节点数组，id - 目标节点ID
 * 返回值：节点或 undefined
 */
function findNode(nodes: TreeNodeItem[], id: string): TreeNodeItem | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children, id)
    if (found) return found
  }
  return undefined
}

/**
 * 从树中递归查找指定 ID 的节点到根的路径
 *
 * 输入参数：nodes - 树节点数组，id - 目标节点ID
 * 返回值：节点路径数组（含自身，从根到目标）
 */
function findNodePath(nodes: TreeNodeItem[], id: string): TreeNodeItem[] | undefined {
  for (const node of nodes) {
    if (node.id === id) return [node]
    const found = findNodePath(node.children, id)
    if (found) return [node, ...found]
  }
  return undefined
}

/**
 * 从树中递归收集匹配搜索词的节点ID及其祖先路径
 *
 * 输入参数：nodes - 树节点数组，query - 搜索关键词
 * 返回值：匹配的节点ID集合（含命中节点自身和其全部祖先）
 */
function findMatchingIds(nodes: TreeNodeItem[], query: string): Set<string> {
  const matchedIds = new Set<string>()
  const lowerQuery = query.toLowerCase()

  function traverse(node: TreeNodeItem): boolean {
    const selfMatch = node.name.toLowerCase().includes(lowerQuery)
    let childMatch = false
    for (const child of node.children) {
      if (traverse(child)) childMatch = true
    }
    if (selfMatch || childMatch) {
      matchedIds.add(node.id)
      return true
    }
    return false
  }
  nodes.forEach((root) => traverse(root))
  return matchedIds
}

/**
 * 收集所有节点的 ID（用于一键展开/折叠）
 *
 * 输入参数：nodes - 树节点数组
 * 返回值：所有节点 ID 集合
 */
function collectAllIds(nodes: TreeNodeItem[]): Set<string> {
  const ids = new Set<string>()
  function walk(list: TreeNodeItem[]) {
    for (const n of list) {
      ids.add(n.id)
      walk(n.children)
    }
  }
  walk(nodes)
  return ids
}

/**
 * 递归获取某节点的所有后代ID（用于禁用移动选项）
 *
 * 输入参数：nodes - 树节点数组，rootId - 根节点ID
 * 返回值：后代ID集合（含 rootId 自身）
 */
function collectSelfAndDescendants(nodes: TreeNodeItem[], rootId: string): Set<string> {
  const ids = new Set<string>()
  function walk(list: TreeNodeItem[]) {
    for (const n of list) {
      if (n.id === rootId) {
        // 命中后整棵子树加入
        function subtree(x: TreeNodeItem) {
          ids.add(x.id)
          x.children.forEach(subtree)
        }
        subtree(n)
        return
      }
      walk(n.children)
    }
  }
  walk(nodes)
  return ids
}

/**
 * 高亮文本中的匹配关键字（返回 React 节点）
 *
 * 输入参数：text - 原文本，query - 搜索关键词
 * 返回值：含高亮 span 的 React 节点
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerQuery, cursor)
    if (idx === -1) {
      parts.push(text.slice(cursor))
      break
    }
    if (idx > cursor) parts.push(text.slice(cursor, idx))
    parts.push(
      <mark
        key={`${idx}-${text}`}
        className="bg-amber-200 text-amber-900 rounded-sm px-0.5"
      >
        {text.slice(idx, idx + query.length)}
      </mark>
    )
    cursor = idx + query.length
  }
  return parts
}

/* ========== 子组件：KnowledgeGraphNode ========== */

/**
 * 树节点组件（递归渲染）
 *
 * 输入参数：node - 树节点数据，level - 当前层级，expandedIds - 已展开节点ID集合，
 *   mode - 组件模式，selectedIds / onToggleSelect 多选相关，
 *   onToggleExpand - 展开/折叠回调，onNodeClick - 节点点击回调（用于更新焦点/面包屑），
 *   onRename / onAddChild / onMove / onDelete - 编辑操作回调，
 *   questionCounts - 题目数量映射，filteredIds - 搜索过滤集合，searchQuery - 当前搜索词
 * 返回值：React 节点
 */
function KnowledgeGraphNode({
  node,
  level,
  expandedIds,
  mode,
  selectedIds,
  onToggleSelect,
  onToggleExpand,
  onNodeClick,
  onRename,
  onAddChild,
  onMove,
  onDelete,
  questionCounts,
  filteredIds,
  searchQuery,
  isFocused,
}: {
  node: TreeNodeItem
  level: number
  expandedIds: Set<string>
  mode: KnowledgeGraphMode
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onNodeClick: (id: string) => void
  onRename?: (node: TreeNodeItem) => void
  onAddChild?: (node: TreeNodeItem) => void
  onMove?: (node: TreeNodeItem) => void
  onDelete?: (node: TreeNodeItem) => void
  questionCounts?: Record<string, number>
  filteredIds: Set<string> | null
  searchQuery: string
  isFocused: boolean
}) {
  // 搜索过滤：不在过滤集合中的节点不渲染
  if (filteredIds && !filteredIds.has(node.id)) {
    return null
  }

  const hasChildren = node.children.length > 0
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedIds.includes(node.id)
  const isLeaf = !hasChildren
  const count = questionCounts?.[node.id] ?? node.question_count
  const canEdit = mode === "edit"

  /**
   * 渲染层级图标
   *
   * 输入参数：无
   * 返回值：图标 JSX
   */
  const renderIcon = () => {
    if (level === 1) {
      return <BookOpen size={14} className="shrink-0 text-emerald-600" />
    }
    if (isLeaf) {
      return <FileText size={14} className="shrink-0 text-slate-400" />
    }
    return isExpanded ? (
      <FolderOpen size={14} className="shrink-0 text-amber-500" />
    ) : (
      <Folder size={14} className="shrink-0 text-amber-500" />
    )
  }

  /**
   * 行点击处理
   *
   * 功能：根据模式分发：select 模式切换选中；其他模式更新焦点
   * 输入参数：无
   * 返回值：无
   */
  const handleRowClick = () => {
    if (mode === "select") {
      onToggleSelect(node.id) // select 模式 → 切换选中
    } else {
      onNodeClick(node.id) // 其他模式 → 更新焦点（面包屑）
    }
  }

  return (
    <div>
      {/* 单个节点行 */}
      <div
        onClick={handleRowClick}
        className={cn(
          "group flex items-center gap-1.5 py-1.5 pr-2 rounded-md cursor-pointer transition-colors",
          mode === "select" ? "hover:bg-blue-50/60" : "hover:bg-slate-50",
          isSelected && mode === "select" && "bg-blue-50",
          isFocused && mode !== "select" && "bg-emerald-50/60",
        )}
        style={{ paddingLeft: `${(level - 1) * 16 + 6}px` }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          // 键盘可达性：Enter/Space 触发
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleRowClick()
          }
        }}
      >
        {/* 展开/折叠箭头 */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
            className="shrink-0 p-0.5 rounded hover:bg-slate-200 transition-colors"
            aria-label={isExpanded ? "折叠" : "展开"}
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-slate-500" />
            ) : (
              <ChevronRight size={14} className="text-slate-500" />
            )}
          </button>
        ) : (
          <span className="w-[22px] shrink-0" />
        )}

        {/* 层级图标 */}
        {renderIcon()}

        {/* select 模式才显示复选框 */}
        {mode === "select" && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect(node.id)
            }}
            className={cn(
              "shrink-0 w-3.5 h-3.5 rounded border transition-colors flex items-center justify-center",
              isSelected
                ? "bg-blue-500 border-blue-500"
                : "border-slate-300 group-hover:border-blue-400",
            )}
            role="checkbox"
            aria-checked={isSelected}
            aria-label={isSelected ? "取消选中" : "选中"}
          >
            {isSelected && (
              <svg viewBox="0 0 16 16" className="w-2.5 h-2.5 text-white">
                <path
                  d="M3 8l3 3 7-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
        )}

        {/* 节点名称（含搜索高亮） */}
        <span
          className={cn(
            "text-sm truncate select-none flex-1",
            level === 1 && "font-semibold text-slate-800",
            mode === "select" && isSelected && "text-blue-700 font-medium",
            mode !== "select" && isFocused && "text-emerald-700 font-medium",
            mode === "select" && !isSelected && level > 1 && "text-slate-700",
            mode !== "select" && !isFocused && level > 1 && "text-slate-700",
          )}
          title={node.name}
        >
          {highlightMatch(node.name, searchQuery)}
        </span>

        {/* 题目数量徽标（select 模式 + 有题时显示） */}
        {mode === "select" && count > 0 && (
          <span
            className={cn(
              "ml-auto text-[11px] shrink-0 px-1.5 py-0.5 rounded-full",
              isSelected
                ? "text-blue-600 bg-blue-100"
                : "text-slate-400 group-hover:text-slate-600",
            )}
          >
            {count}
          </span>
        )}

        {/* 编辑模式：行尾操作按钮组（hover 时显现） */}
        {canEdit && (
          <div
            className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onAddChild?.(node)}
              className="p-1 rounded hover:bg-emerald-100 text-slate-500 hover:text-emerald-600 transition-colors"
              title="新增子节点"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => onRename?.(node)}
              className="p-1 rounded hover:bg-blue-100 text-slate-500 hover:text-blue-600 transition-colors"
              title="重命名"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onMove?.(node)}
              className="p-1 rounded hover:bg-amber-100 text-slate-500 hover:text-amber-600 transition-colors"
              title="移动"
            >
              <Move size={12} />
            </button>
            <button
              onClick={() => onDelete?.(node)}
              className="p-1 rounded hover:bg-red-100 text-slate-500 hover:text-red-600 transition-colors"
              title="删除"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* 子节点（展开时渲染） */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <KnowledgeGraphNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              mode={mode}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onToggleExpand={onToggleExpand}
              onNodeClick={onNodeClick}
              onRename={onRename}
              onAddChild={onAddChild}
              onMove={onMove}
              onDelete={onDelete}
              questionCounts={questionCounts}
              filteredIds={filteredIds}
              searchQuery={searchQuery}
              isFocused={isFocused}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ========== 子组件：MovePicker（移动目标选择器） ========== */

/**
 * 移动目标选择器弹窗
 *
 * 功能：树形展示可选父节点（排除自身及后代），支持选中后确认
 * 输入参数：treeData - 当前树数据，excludeIds - 禁用ID集合（含自身及后代），
 *   currentParentId - 当前父节点ID（用于高亮），subject - 学科（用于新增），
 *   onConfirm - 确认回调（返回新父节点ID，null 表示移到根级），onClose - 关闭回调
 * 返回值：React 节点
 */
function MovePicker({
  treeData,
  excludeIds,
  currentParentId,
  subject,
  onConfirm,
  onClose,
}: {
  treeData: TreeNodeItem[]
  excludeIds: Set<string>
  currentParentId: string | null
  subject: string
  onConfirm: (newParentId: string | null) => void
  onClose: () => void
}) {
  // 展开的节点ID集合
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const next = new Set<string>()
    treeData.forEach((root) => {
      next.add(root.id)
      root.children.forEach((c) => next.add(c.id))
    })
    return next
  })
  // 选中的目标父节点ID
  const [pickedId, setPickedId] = useState<string | null>(currentParentId)
  // 搜索过滤
  const [query, setQuery] = useState("")
  const debouncedQuery = useMemo(() => query.trim().toLowerCase(), [query])
  const filteredIds = useMemo(() => {
    if (!debouncedQuery) return null
    return findMatchingIds(treeData, debouncedQuery)
  }, [treeData, debouncedQuery])

  /** 切换展开/折叠 */
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /**
   * 递归渲染可选项
   *
   * 输入参数：nodes - 树节点数组，level - 当前层级
   * 返回值：React 节点
   */
  const renderPickRow = (nodes: TreeNodeItem[], level: number): React.ReactNode => {
    return nodes.map((n) => {
      if (excludeIds.has(n.id)) return null // 自身及后代不可选
      if (filteredIds && !filteredIds.has(n.id)) return null // 搜索过滤
      const has = n.children.some((c) => !excludeIds.has(c.id) || c.id === n.id)
      const expanded = expandedIds.has(n.id)
      return (
        <div key={n.id}>
          <div
            onClick={() => setPickedId(n.id)}
            className={cn(
              "flex items-center gap-1.5 py-1.5 pr-2 rounded-md cursor-pointer transition-colors hover:bg-emerald-50",
              pickedId === n.id && "bg-emerald-100",
            )}
            style={{ paddingLeft: `${(level - 1) * 16 + 6}px` }}
          >
            {has ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExpand(n.id)
                }}
                className="shrink-0 p-0.5 rounded hover:bg-slate-200"
              >
                {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
              </button>
            ) : (
              <span className="w-[22px] shrink-0" />
            )}
            {n.children.length > 0 ? (
              <Folder size={14} className="shrink-0 text-amber-500" />
            ) : (
              <FileText size={14} className="shrink-0 text-slate-400" />
            )}
            <span className="text-sm truncate flex-1 text-slate-700">{n.name}</span>
            {pickedId === n.id && (
              <span className="text-[11px] text-emerald-600">当前</span>
            )}
          </div>
          {has && expanded && renderPickRow(n.children, level + 1)}
        </div>
      )
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="px-5 py-3 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-800">选择新的父节点</h3>
          <p className="text-xs text-slate-500 mt-1">
            学科「{subject}」 · 灰色节点不可选（自身及后代）
          </p>
        </div>
        {/* 搜索框 */}
        <div className="px-3 py-2 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索目标节点..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
          </div>
        </div>
        {/* 树形选项 */}
        <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
          {/* 根级选项 */}
          <div
            onClick={() => setPickedId(null)}
            className={cn(
              "flex items-center gap-1.5 py-1.5 px-2 rounded-md cursor-pointer transition-colors hover:bg-emerald-50",
              pickedId === null && "bg-emerald-100",
            )}
          >
            <BookOpen size={14} className="text-emerald-600" />
            <span className="text-sm font-semibold text-slate-800">（根级）</span>
          </div>
          {renderPickRow(treeData, 1)}
        </div>
        {/* 底部按钮 */}
        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(pickedId)}
            className="px-3 py-1.5 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
          >
            确认移动
          </button>
        </div>
      </div>
    </div>
  )
}

/* ========== 子组件：AddNodeDialog（新增/重命名弹窗） ========== */

/**
 * 新增/重命名弹窗
 *
 * 功能：输入节点名称（重命名时预填原名），保存后回调
 * 输入参数：title - 弹窗标题，initialName - 初始名称，onConfirm - 确认回调，onClose - 关闭回调
 * 返回值：React 节点
 */
function NameEditDialog({
  title,
  initialName = "",
  onConfirm,
  onClose,
}: {
  title: string
  initialName?: string
  onConfirm: (name: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 自动聚焦 + 选中
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-800 mb-3">{title}</h3>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) onConfirm(name.trim())
            if (e.key === "Escape") onClose()
          }}
          placeholder="请输入节点名称"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
          maxLength={100}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(name.trim())}
            disabled={!name.trim()}
            className="px-3 py-1.5 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

/* ========== 主组件：KnowledgeGraphTree ========== */

/**
 * 知识图谱树形组件（主组件）
 *
 * 功能：渲染可展开/可搜索/可编辑的层级知识图谱
 * 输入参数：见 KnowledgeGraphTreeProps
 * 返回值：React 组件
 */
export default function KnowledgeGraphTree({
  mode = "readonly",
  subject = "数学",
  selectedIds = [],
  onSelectedChange,
  onFocusChange,
  defaultExpandAll = false,
  showBreadcrumb = true,
  showSearch = true,
  showAddRoot = true,
  questionCounts,
  className,
}: KnowledgeGraphTreeProps) {
  /* ========== 状态 ========== */

  const [treeData, setTreeData] = useState<TreeNodeItem[]>([]) // 树形数据
  const [loading, setLoading] = useState(false) // 加载中
  const [error, setError] = useState<string | null>(null) // 错误信息

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set()) // 展开的节点ID
  const [searchQuery, setSearchQuery] = useState("") // 搜索词
  const [debouncedQuery, setDebouncedQuery] = useState("") // 防抖后的搜索词
  const [focusedId, setFocusedId] = useState<string | null>(null) // 当前焦点节点（面包屑）

  // 编辑模式各弹窗状态
  const [addChildTarget, setAddChildTarget] = useState<TreeNodeItem | null>(null) // 新增子节点目标
  const [renameTarget, setRenameTarget] = useState<TreeNodeItem | null>(null) // 重命名目标
  const [moveTarget, setMoveTarget] = useState<TreeNodeItem | null>(null) // 移动目标
  const [deleteTarget, setDeleteTarget] = useState<TreeNodeItem | null>(null) // 删除目标
  const [deleteDescendantCount, setDeleteDescendantCount] = useState(0) // 删除时后代数量

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // 防抖定时器

  /* ========== 加载知识树 ========== */

  /**
   * 加载知识树（编辑操作后用同一方法刷新）
   *
   * 输入参数：无
   * 返回值：Promise
   */
  const loadTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getKnowledgeTree()
      const tree = buildTree(res.tree)
      setTreeData(tree)

      // 默认展开逻辑
      if (defaultExpandAll) {
        setExpandedIds(collectAllIds(tree))
      } else {
        // 默认展开前两层
        const next = new Set<string>()
        tree.forEach((root) => {
          next.add(root.id)
          root.children.forEach((c) => next.add(c.id))
        })
        setExpandedIds(next)
      }
    } catch (err) {
      setError("加载知识树失败，请刷新重试")
      console.error("加载知识树失败:", err)
    } finally {
      setLoading(false)
    }
  }, [defaultExpandAll])

  useEffect(() => {
    loadTree()
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [loadTree])

  /* ========== 搜索防抖 ========== */

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [searchQuery])

  /* ========== 本地搜索过滤 ========== */

  const filteredIds = useMemo(() => {
    if (!debouncedQuery.trim()) return null
    return findMatchingIds(treeData, debouncedQuery.trim())
  }, [treeData, debouncedQuery])

  const isSearchMode = debouncedQuery.trim().length > 0

  // 搜索时自动展开匹配路径
  useEffect(() => {
    if (filteredIds && filteredIds.size > 0) {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        filteredIds.forEach((id) => next.add(id))
        return next
      })
    }
  }, [filteredIds])

  /* ========== 统计信息 ========== */

  const totalNodes = useMemo(() => countAllNodes(treeData), [treeData])

  /* ========== 展开/折叠节点 ========== */

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 一键展开全部
  const expandAll = useCallback(() => {
    setExpandedIds(collectAllIds(treeData))
  }, [treeData])

  // 一键折叠（保留根节点）
  const collapseAll = useCallback(() => {
    const next = new Set<string>()
    treeData.forEach((root) => next.add(root.id))
    setExpandedIds(next)
  }, [treeData])

  /* ========== 选中/取消选中节点（select 模式） ========== */

  const handleToggleSelect = useCallback(
    (id: string) => {
      if (!onSelectedChange) return
      if (selectedIds.includes(id)) {
        onSelectedChange(selectedIds.filter((sid) => sid !== id))
      } else {
        onSelectedChange([...selectedIds, id])
      }
    },
    [selectedIds, onSelectedChange],
  )

  // 清空所有选中
  const clearAll = useCallback(() => {
    onSelectedChange?.([])
  }, [onSelectedChange])

  /* ========== 节点点击（更新焦点 / 面包屑） ========== */

  const handleNodeClick = useCallback(
    (id: string) => {
      setFocusedId(id)
      onFocusChange?.(id)
      // 自动展开点击的节点
      setExpandedIds((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })
    },
    [onFocusChange],
  )

  /* ========== 面包屑路径 ========== */

  const breadcrumbPath = useMemo(() => {
    if (!focusedId) return []
    return findNodePath(treeData, focusedId) ?? []
  }, [treeData, focusedId])

  /* ========== 编辑操作 ========== */

  /**
   * 新增子节点
   *
   * 输入参数：parent - 父节点，name - 名称
   * 返回值：Promise
   */
  const handleAddChild = useCallback(
    async (parent: TreeNodeItem, name: string) => {
      try {
        await createKnowledgeNode({
          subject: parent.subject,
          name,
          parent_id: parent.id,
          sort_order: parent.children.length,
        })
        toast.success(`已新增「${name}」到「${parent.name}」下`)
        await loadTree()
        // 展开父节点
        setExpandedIds((prev) => {
          const next = new Set(prev)
          next.add(parent.id)
          return next
        })
      } catch (err) {
        console.error("新增失败:", err)
        toast.error("新增失败，请重试")
      }
    },
    [loadTree],
  )

  /**
   * 新增根节点
   *
   * 输入参数：name - 名称
   * 返回值：Promise
   */
  const handleAddRoot = useCallback(
    async (name: string) => {
      try {
        await createKnowledgeNode({
          subject,
          name,
          parent_id: null,
          sort_order: 0,
        })
        toast.success(`已新增根节点「${name}」`)
        await loadTree()
      } catch (err) {
        console.error("新增根节点失败:", err)
        toast.error("新增失败，请重试")
      }
    },
    [loadTree, subject],
  )

  /**
   * 重命名节点
   *
   * 输入参数：target - 目标节点，newName - 新名称
   * 返回值：Promise
   */
  const handleRename = useCallback(
    async (target: TreeNodeItem, newName: string) => {
      try {
        await updateKnowledgeNode(target.id, { name: newName })
        toast.success(`已重命名为「${newName}」`)
        await loadTree()
        // 保持焦点在新节点
        setFocusedId(target.id)
        onFocusChange?.(target.id)
      } catch (err) {
        console.error("重命名失败:", err)
        toast.error("重命名失败，请重试")
      }
    },
    [loadTree, onFocusChange],
  )

  /**
   * 移动节点
   *
   * 输入参数：target - 目标节点，newParentId - 新父节点ID
   * 返回值：Promise
   */
  const handleMove = useCallback(
    async (target: TreeNodeItem, newParentId: string | null) => {
      try {
        await moveKnowledgeNode(target.id, newParentId)
        toast.success("移动成功")
        await loadTree()
      } catch (err) {
        console.error("移动失败:", err)
        // axios 错误结构
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "移动失败，请重试"
        toast.error(msg)
      }
    },
    [loadTree],
  )

  /**
   * 删除节点
   *
   * 输入参数：target - 目标节点
   * 返回值：Promise
   */
  const handleDelete = useCallback(async (target: TreeNodeItem) => {
    try {
      // 先查询后代数量（用于确认提示）
      const res = await getDescendantCount(target.id)
      setDeleteDescendantCount(res.count)
      setDeleteTarget(target)
    } catch (err) {
      console.error("查询后代数量失败:", err)
      toast.error("操作失败，请重试")
    }
  }, [])

  /**
   * 确认删除
   *
   * 输入参数：无
   * 返回值：Promise
   */
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteKnowledgeNode(deleteTarget.id)
      toast.success("已删除")
      // 若焦点节点被删除，清空焦点
      if (focusedId === deleteTarget.id) {
        setFocusedId(null)
        onFocusChange?.(null)
      }
      await loadTree()
    } catch (err) {
      console.error("删除失败:", err)
      toast.error("删除失败，请重试")
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, focusedId, loadTree, onFocusChange])

  /* ========== 渲染 ========== */

  return (
    <div className={cn("flex flex-col h-full bg-white", className)}>
      {/* ========== 顶部：面包屑 ========== */}
      {showBreadcrumb && (
        <div className="px-3 py-2 border-b border-slate-200 bg-gradient-to-r from-emerald-50/60 to-white shrink-0">
          <div className="flex items-center gap-2">
            <ListTree size={16} className="text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold text-slate-800">知识图谱</span>
            {subject && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
                {subject}
              </span>
            )}
            {mode === "edit" && (
              <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                可编辑
              </span>
            )}
          </div>
          {/* 面包屑：当前位置 */}
          {breadcrumbPath.length > 0 ? (
            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-600 flex-wrap">
              {breadcrumbPath.map((n, i) => (
                <span key={n.id} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRightIcon size={10} className="text-slate-400" />}
                  <button
                    onClick={() => handleNodeClick(n.id)}
                    className={cn(
                      "px-1 py-0.5 rounded hover:bg-emerald-100 hover:text-emerald-700 transition-colors",
                      i === breadcrumbPath.length - 1 ? "font-semibold text-emerald-700" : "text-slate-600",
                    )}
                  >
                    {n.name}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Library size={11} className="text-slate-400" />
                <span>共 {totalNodes} 个知识点</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Info size={11} className="text-slate-400" />
                <span>点击节点查看位置{mode === "edit" ? " · 悬停查看操作" : ""}</span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ========== 搜索框 ========== */}
      {showSearch && (
        <div className="relative border-b border-slate-200 shrink-0">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索知识点..."
            className="w-full pl-8 pr-7 py-2 text-[13px] border-0 outline-none focus:ring-0 placeholder:text-slate-400 bg-white"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-100"
              aria-label="清空搜索"
            >
              <X size={12} className="text-slate-400" />
            </button>
          )}
        </div>
      )}

      {/* ========== 工具栏 ========== */}
      {!loading && !error && treeData.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-slate-100 text-[11px] shrink-0">
          <button
            onClick={expandAll}
            className="px-1.5 py-0.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="展开全部"
          >
            展开
          </button>
          <span className="text-slate-300">|</span>
          <button
            onClick={collapseAll}
            className="px-1.5 py-0.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="折叠全部"
          >
            折叠
          </button>
          {mode === "select" && selectedIds.length > 0 && (
            <>
              <span className="text-slate-300">|</span>
              <button
                onClick={clearAll}
                className="px-1.5 py-0.5 text-blue-600 hover:bg-blue-50 rounded transition-colors inline-flex items-center gap-0.5"
              >
                <CheckCheck size={11} />
                清空
              </button>
            </>
          )}
          {mode === "edit" && showAddRoot && (
            <>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setAddChildTarget({ id: "__root__", name: "（新增根节点）", subject, parent_id: null } as TreeNodeItem)}
                className="px-1.5 py-0.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors inline-flex items-center gap-0.5"
                title="新增根节点"
              >
                <Plus size={11} />
                新增根节点
              </button>
            </>
          )}
          {isSearchMode && filteredIds && filteredIds.size > 0 && (
            <span className="ml-auto text-slate-400">匹配 {filteredIds.size} 个</span>
          )}
        </div>
      )}

      {/* ========== 树形列表区域 ========== */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-400 gap-2">
            <Loader2 size={14} className="animate-spin" />
            <span>加载中...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-sm text-red-500">
            <span>{error}</span>
            <button
              onClick={loadTree}
              className="mt-2 text-xs text-blue-500 hover:underline"
            >
              点击刷新
            </button>
          </div>
        ) : (
          <div className="py-1">
            {treeData.length === 0 ? (
              <div className="py-10 px-4 text-center text-sm text-slate-500">
                <ListTree size={32} className="mx-auto text-slate-300 mb-2" />
                <div className="text-slate-600 mb-1">暂无知识点数据</div>
                <div className="text-[11px] text-slate-400">
                  {mode === "edit" ? "可点击右上「新增根节点」创建第一个知识点" : "请先初始化知识树"}
                </div>
              </div>
            ) : isSearchMode && filteredIds && filteredIds.size === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">未找到匹配的知识点</div>
            ) : (
              treeData.map((root) => (
                <KnowledgeGraphNode
                  key={root.id}
                  node={root}
                  level={1}
                  expandedIds={expandedIds}
                  mode={mode}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onToggleExpand={toggleExpand}
                  onNodeClick={handleNodeClick}
                  onRename={(n) => setRenameTarget(n)}
                  onAddChild={(n) => setAddChildTarget(n)}
                  onMove={(n) => setMoveTarget(n)}
                  onDelete={(n) => handleDelete(n)}
                  questionCounts={questionCounts}
                  filteredIds={filteredIds}
                  searchQuery={debouncedQuery}
                  isFocused={focusedId === root.id}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ========== 弹窗们 ========== */}

      {/* 新增子节点弹窗 */}
      {addChildTarget && (
        <NameEditDialog
          title={
            addChildTarget.id === "__root__"
              ? `新增根节点（${subject}）`
              : `在「${addChildTarget.name}」下新增子节点`
          }
          onConfirm={async (name) => {
            if (addChildTarget.id === "__root__") {
              await handleAddRoot(name)
            } else {
              await handleAddChild(addChildTarget, name)
            }
            setAddChildTarget(null)
          }}
          onClose={() => setAddChildTarget(null)}
        />
      )}

      {/* 重命名弹窗 */}
      {renameTarget && (
        <NameEditDialog
          title={`重命名节点`}
          initialName={renameTarget.name}
          onConfirm={async (name) => {
            await handleRename(renameTarget, name)
            setRenameTarget(null)
          }}
          onClose={() => setRenameTarget(null)}
        />
      )}

      {/* 移动弹窗 */}
      {moveTarget && (
        <MovePicker
          treeData={treeData}
          excludeIds={collectSelfAndDescendants(treeData, moveTarget.id)}
          currentParentId={moveTarget.parent_id}
          subject={moveTarget.subject}
          onConfirm={async (newParentId) => {
            // 移到当前父节点下视为无变化
            if (newParentId === moveTarget.parent_id) {
              setMoveTarget(null)
              return
            }
            await handleMove(moveTarget, newParentId)
            setMoveTarget(null)
          }}
          onClose={() => setMoveTarget(null)}
        />
      )}

      {/* 删除确认弹窗 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除确认"
        message={
          deleteTarget
            ? deleteDescendantCount > 0
              ? `将删除「${deleteTarget.name}」及其 ${deleteDescendantCount} 个后代节点，此操作不可撤销。`
              : `将删除「${deleteTarget.name}」，此操作不可撤销。`
            : ""
        }
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  )
}
