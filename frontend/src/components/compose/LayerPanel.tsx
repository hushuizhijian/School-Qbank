/**
 * 图层面板组件 — Photoshop 式图层管理
 *
 * 功能：
 *  - 列出试卷中所有可编辑的图层（Logo / 页眉 / 水印 / 标题），按 z_index 降序显示
 *  - 每个图层支持：显示/隐藏、锁定/解锁、置顶、置底、上移、下移
 *  - 顶部"批量操作"：全部显示、全部解锁、位置重置
 *  - 选中后高亮，与画布中元素选中状态联动
 *
 * 输入参数：
 *  - pageConfig: 当前页面配置（含 header_box / logo_box）
 *  - onLayerAction: 图层操作回调（统一入口，避免散落多处 setState）
 *  - selectedLayerId: 当前选中的图层（与画布联动）
 *  - onSelectLayer: 选中图层回调
 *  - readOnly: 是否只读（列表页微型卡片用）
 *
 * 返回值：面板节点
 */
import { useMemo } from "react"
import { Eye, EyeOff, Lock, Unlock, ChevronsUp, ChevronsDown, ChevronUp, ChevronDown, Image as ImageIcon, Type, Heading1, Droplets, RotateCcw, Layers } from "lucide-react"
import { cn } from "@/utils/cn"
import type { HomeworkPageConfig, ElementBox } from "@/types/homework"

/**
 * 图层标识（与 page_config 的字段名一致）
 */
export type LayerId = "logo" | "header" | "watermark" | "title"

/**
 * 图层操作类型
 */
export type LayerAction =
  | { type: "toggle_show"; layerId: LayerId; show: boolean }
  | { type: "toggle_lock"; layerId: LayerId; locked: boolean }
  | { type: "move_top"; layerId: LayerId }
  | { type: "move_bottom"; layerId: LayerId }
  | { type: "move_up"; layerId: LayerId }
  | { type: "move_down"; layerId: LayerId }
  | { type: "reset_position"; layerId: LayerId }
  | { type: "show_all" }
  | { type: "unlock_all" }

/**
 * 图层描述符（前端展示用，不包含渲染内容）
 */
export interface LayerItem {
  id: LayerId
  name: string
  icon: React.ReactNode
  zIndex: number
  visible: boolean
  locked: boolean
  /** 该图层是否需要配置 box（true 则可拖动/缩放） */
  movable: boolean
}

/**
 * 默认 z_index（用于未配置 z_index 的图层）
 * 数值越大越靠上层
 */
const Z_FALLBACK: Record<LayerId, number> = {
  title: 5,
  watermark: 8,
  header: 10,
  logo: 20,
}

/**
 * 计算图层的有效 z_index
 * 输入参数：layerId - 图层 ID；box - 元素 box（可空）
 * 返回值：z_index 数值
 */
function resolveZ(layerId: LayerId, box: ElementBox | undefined | null): number {
  if (box && typeof box.z_index === "number") return box.z_index
  return Z_FALLBACK[layerId]
}

/**
 * 从 pageConfig 派生图层列表
 * 输入参数：pageConfig - 页面配置
 * 返回值：LayerItem 列表
 * 关键点：每个图层的 zIndex/show/locked 从对应 box 上读取，未配置时回退到默认值
 * 需求（图层化）：标题、页眉、Logo 都作为可拖拽图层（movable=true）
 */
function buildLayerList(pageConfig: HomeworkPageConfig): LayerItem[] {
  const items: LayerItem[] = []

  // 标题层（已改造为独立可拖拽图层）
  // 标题图层：始终显示在图层面板中（试卷一定有标题）
  const box = pageConfig.title_box
  items.push({
    id: "title",
    name: "试卷标题",
    icon: <Heading1 size={13} />,
    zIndex: resolveZ("title", box),
    visible: box?.show !== false,
    locked: box?.locked === true,
    movable: true,
  })

  // 水印层（不可拖动，特殊处理）
  if (pageConfig.watermark_text) {
    items.push({
      id: "watermark",
      name: "水印",
      icon: <Droplets size={13} />,
      zIndex: resolveZ("watermark", null),
      visible: pageConfig.watermark_text.length > 0,
      locked: false,
      movable: false,
    })
  }

  // 页眉层
  if (pageConfig.header_text || pageConfig.logo_url) {
    const box = pageConfig.header_box
    items.push({
      id: "header",
      name: "页眉文字",
      icon: <Type size={13} />,
      zIndex: resolveZ("header", box),
      visible: box?.show !== false,
      locked: box?.locked === true,
      movable: true,
    })
  }

  // Logo 层
  if (pageConfig.logo_url) {
    const box = pageConfig.logo_box
    items.push({
      id: "logo",
      name: "Logo 图片",
      icon: <ImageIcon size={13} />,
      zIndex: resolveZ("logo", box),
      visible: box?.show !== false,
      locked: box?.locked === true,
      movable: true,
    })
  }

  // 排序：z 大的在前面（图层面板显示顺序 = 自上而下 = z 降序）
  items.sort((a, b) => b.zIndex - a.zIndex)
  return items
}

/**
 * 应用图层操作到 pageConfig，返回新的 pageConfig
 *
 * 输入参数：pageConfig - 当前 pageConfig；action - 图层操作
 * 返回值：新的 HomeworkPageConfig
 *
 * 实现：
 *  - toggle_show/toggle_lock: 写入 box.show / box.locked
 *  - move_top/move_bottom: 目标图层 z 设为最高/最低
 *  - move_up/move_down: 与目标交换 z_index
 *  - reset_position: 清除 box.x/y/width/height（恢复默认）
 *  - show_all/unlock_all: 遍历所有图层批量更新
 *
 * 需求（图层化）：标题、页眉、Logo 三个图层都支持 toggle_show / toggle_lock / z_index 调整；
 *   仅 watermark 是不可拖动的特殊图层（用 watermark_text 控制显隐）
 */
export function applyLayerAction(
  pageConfig: HomeworkPageConfig,
  action: LayerAction,
): HomeworkPageConfig {
  /**
   * 获取图层对应的 page_config key
   * 返回值："title_box" | "header_box" | "logo_box" | null
   *   null = watermark（无 box 属性）
   */
  const boxKeyOf = (layerId: LayerId): "title_box" | "header_box" | "logo_box" | null => {
    if (layerId === "title") return "title_box"
    if (layerId === "header") return "header_box"
    if (layerId === "logo") return "logo_box"
    return null
  }

  /**
   * 更新图层 box 字段
   * 输入参数：layerId - 图层 ID；patch - 要合并到 box 的部分字段
   * 返回值：新的 pageConfig（boxKeyOf 为 null 时原样返回）
   */
  const updateBox = (layerId: LayerId, patch: Partial<ElementBox>): HomeworkPageConfig => {
    const key = boxKeyOf(layerId)
    if (!key) return pageConfig
    const cur = (pageConfig[key] ?? { x: 0, y: 0, width: 0, height: 0 }) as ElementBox
    return {
      ...pageConfig,
      [key]: { ...cur, ...patch },
    }
  }

  switch (action.type) {
    case "toggle_show": {
      // 标题、页眉、Logo 都支持显隐切换（写入 box.show）
      // watermark 的显隐由 watermark_text 控制
      if (action.layerId === "watermark") {
        return pageConfig
      }
      return updateBox(action.layerId, { show: action.show })
    }
    case "toggle_lock": {
      if (action.layerId === "watermark") {
        return pageConfig
      }
      return updateBox(action.layerId, { locked: action.locked })
    }
    case "move_top": {
      if (action.layerId === "watermark") {
        return pageConfig
      }
      // 取所有图层 z 最高值 + 1
      const layers = buildLayerList(pageConfig)
      const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex), 0)
      return updateBox(action.layerId, { z_index: maxZ + 1 })
    }
    case "move_bottom": {
      if (action.layerId === "watermark") {
        return pageConfig
      }
      const layers = buildLayerList(pageConfig)
      const minZ = layers.reduce((m, l) => Math.min(m, l.zIndex), 0)
      return updateBox(action.layerId, { z_index: minZ - 1 })
    }
    case "move_up": {
      if (action.layerId === "watermark") {
        return pageConfig
      }
      const layers = buildLayerList(pageConfig)
      // 找到当前图层在 z 降序列表中的下一个（即 z 更大的）
      const idx = layers.findIndex((l) => l.id === action.layerId)
      if (idx <= 0) return pageConfig
      const next = layers[idx - 1]
      // 上移到 next 的 z 之上
      const newZ = next.zIndex + 1
      return updateBox(action.layerId, { z_index: newZ })
    }
    case "move_down": {
      if (action.layerId === "watermark") {
        return pageConfig
      }
      const layers = buildLayerList(pageConfig)
      const idx = layers.findIndex((l) => l.id === action.layerId)
      if (idx === -1 || idx >= layers.length - 1) return pageConfig
      const prev = layers[idx + 1]
      const newZ = prev.zIndex - 1
      return updateBox(action.layerId, { z_index: newZ })
    }
    case "reset_position": {
      if (action.layerId === "watermark") {
        return pageConfig
      }
      // 重置位置：把 x/y/width/height 设为 0，让代码回退到默认位置
      const key = boxKeyOf(action.layerId)
      if (!key) return pageConfig
      const cur = pageConfig[key]
      if (!cur) return pageConfig
      const reset: ElementBox = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        show: cur.show,
        locked: cur.locked,
        z_index: cur.z_index,
      }
      return { ...pageConfig, [key]: reset }
    }
    case "show_all": {
      let next = pageConfig
      if (pageConfig.title_box) next = { ...next, title_box: { ...pageConfig.title_box, show: true } }
      if (pageConfig.header_box) next = { ...next, header_box: { ...pageConfig.header_box, show: true } }
      if (pageConfig.logo_box) next = { ...next, logo_box: { ...pageConfig.logo_box, show: true } }
      return next
    }
    case "unlock_all": {
      let next = pageConfig
      if (pageConfig.title_box) next = { ...next, title_box: { ...pageConfig.title_box, locked: false } }
      if (pageConfig.header_box) next = { ...next, header_box: { ...pageConfig.header_box, locked: false } }
      if (pageConfig.logo_box) next = { ...next, logo_box: { ...pageConfig.logo_box, locked: false } }
      return next
    }
    default:
      return pageConfig
  }
}

/* ========== 主组件 ========== */

export interface LayerPanelProps {
  pageConfig: HomeworkPageConfig
  onLayerAction: (action: LayerAction) => void
  selectedLayerId?: LayerId | null
  onSelectLayer?: (id: LayerId | null) => void
  readOnly?: boolean
}

export default function LayerPanel({
  pageConfig,
  onLayerAction,
  selectedLayerId = null,
  onSelectLayer,
  readOnly = false,
}: LayerPanelProps) {
  // 从 pageConfig 派生图层列表
  const layers = useMemo(() => buildLayerList(pageConfig), [pageConfig])

  // 计算每个图层的可操作性（第一层不能上移/置顶，最后一层不能下移/置底）
  const topIndex = 0
  const bottomIndex = layers.length - 1

  return (
    <div className="space-y-2">
      {/* 批量操作工具栏 */}
      <div className="flex items-center gap-1.5">
        <Layers size={12} className="text-slate-500" />
        <span className="text-[11px] font-medium text-slate-700">图层</span>
        <span className="text-[10px] text-slate-400">· {layers.length} 个</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            onClick={() => onLayerAction({ type: "show_all" })}
            disabled={readOnly}
            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40"
            title="全部显示"
          >
            <Eye size={11} />
          </button>
          <button
            onClick={() => onLayerAction({ type: "unlock_all" })}
            disabled={readOnly}
            className="p-1 rounded text-slate-500 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-40"
            title="全部解锁"
          >
            <Unlock size={11} />
          </button>
        </div>
      </div>

      {/* 图层列表（z 降序：最上面是最上层） */}
      <div className="space-y-0.5">
        {layers.length === 0 && (
          <div className="text-[11px] text-slate-400 text-center py-4">
            暂无图层。请先在"页眉 / LOGO"中配置内容。
          </div>
        )}
        {layers.map((layer, idx) => {
          const isSelected = selectedLayerId === layer.id
          const isMovable = layer.movable && !readOnly
          const isFirst = idx === topIndex
          const isLast = idx === bottomIndex
          return (
            <div
              key={layer.id}
              onClick={() => onSelectLayer?.(isSelected ? null : layer.id)}
              className={cn(
                "group flex items-center gap-1 px-1.5 py-1 rounded text-[11px] cursor-pointer transition-colors",
                isSelected
                  ? "bg-blue-50 ring-1 ring-blue-300"
                  : "hover:bg-slate-50",
              )}
              title={`${layer.name}（z=${layer.zIndex}）`}
            >
              {/* 显隐切换 */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onLayerAction({ type: "toggle_show", layerId: layer.id, show: !layer.visible })
                }}
                disabled={!isMovable || layer.id === "title" || layer.id === "watermark"}
                className={cn(
                  "shrink-0 p-0.5 rounded hover:bg-slate-200 disabled:cursor-not-allowed",
                  layer.visible ? "text-slate-600" : "text-slate-300",
                )}
                title={layer.visible ? "隐藏图层" : "显示图层"}
              >
                {layer.visible ? <Eye size={11} /> : <EyeOff size={11} />}
              </button>

              {/* 图标 */}
              <span className={cn("shrink-0", layer.visible ? "text-slate-500" : "text-slate-300")}>
                {layer.icon}
              </span>

              {/* 名称 */}
              <span
                className={cn(
                  "flex-1 truncate",
                  !layer.visible && "text-slate-300 line-through",
                  layer.visible ? "text-slate-700" : "",
                )}
              >
                {layer.name}
              </span>

              {/* 锁定标记 */}
              {layer.locked && (
                <Lock size={10} className="shrink-0 text-amber-500" />
              )}

              {/* 操作按钮（hover 时显示） */}
              {isMovable && (
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  {/* 置顶 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onLayerAction({ type: "move_top", layerId: layer.id }) }}
                    disabled={isFirst}
                    className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="置顶"
                  >
                    <ChevronsUp size={10} />
                  </button>
                  {/* 上移 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onLayerAction({ type: "move_up", layerId: layer.id }) }}
                    disabled={isFirst}
                    className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="上移一层"
                  >
                    <ChevronUp size={10} />
                  </button>
                  {/* 下移 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onLayerAction({ type: "move_down", layerId: layer.id }) }}
                    disabled={isLast}
                    className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="下移一层"
                  >
                    <ChevronDown size={10} />
                  </button>
                  {/* 置底 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onLayerAction({ type: "move_bottom", layerId: layer.id }) }}
                    disabled={isLast}
                    className="p-0.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="置底"
                  >
                    <ChevronsDown size={10} />
                  </button>
                  {/* 重置位置 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onLayerAction({ type: "reset_position", layerId: layer.id }) }}
                    className="p-0.5 rounded text-slate-400 hover:text-orange-600 hover:bg-orange-50"
                    title="重置位置"
                  >
                    <RotateCcw size={10} />
                  </button>
                  {/* 锁定切换 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); onLayerAction({ type: "toggle_lock", layerId: layer.id, locked: !layer.locked }) }}
                    className={cn(
                      "p-0.5 rounded hover:bg-slate-200",
                      layer.locked ? "text-amber-500" : "text-slate-400 hover:text-amber-600",
                    )}
                    title={layer.locked ? "解锁" : "锁定"}
                  >
                    {layer.locked ? <Lock size={10} /> : <Unlock size={10} />}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 提示：图层顺序自下而上叠加 */}
      <div className="text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100">
        提示：图层顺序自下而上叠加，置顶 = 移到最上层。锁定后不可拖动。
      </div>
    </div>
  )
}
