/**
 * 插件系统类型定义
 *
 * 功能：定义校对工作台插件架构所需的类型
 * 使用场景：插件注册、PluginSlot、PluginErrorBoundary、插件组件改造
 */

import type { Question, KnowledgePointItem } from "@/types/question"
import type { AiProviderSelection } from "@/api/ai"

/* ========== 挂载位置 ========== */

/** 插件挂载位置枚举 */
export type PluginMountPoint =
  | "attribute-panel"   // 中栏属性面板内
  | "editor-bottom"     // 右栏双栏编辑器下方
  | "editor-side"       // 右栏双栏编辑器侧边
  | "toolbar"           // 底部 BatchActionBar 右侧
  | "analysis-editor"   // 右栏解析内容区（替代原内置 DualPaneEditor）
  | "image-manager"     // 中栏题图管理（原内置 ImageManagerPanel）
  | "left-panel"        // 左栏额外区域（预留）
  | "modal"             // 全局弹窗形态（预留）
  | "title-right"       // 双栏编辑器标题栏右侧（如 word编辑）

/* ========== 插件元数据 ========== */

/** 插件元数据：每个插件组件必须导出 */
export interface PluginMeta {
  id: string                    // 唯一标识
  mountPoint: PluginMountPoint  // 挂载位置
  priority: number              // 同插槽排序（越小越靠前）
  label: string                 // 显示名称，用于错误占位
}

/* ========== 插件 Props ========== */

/** 插件 Props：核心注入的基础数据 */
export interface PluginProps {
  paperId: string                                          // 当前试卷 ID
  currentQuestion: Question | null                         // 当前选中的题目
  questions: Question[]                                    // 全部题目列表
  onUpdateField: (field: string, value: unknown) => void   // 更新题目字段
  onToggleBank: () => void                                 // 切换入库状态
  onRefresh: () => void                                    // 刷新题目列表
  onNavigate: (questionId: string) => void                 // 跳转到指定题目
  onKnowledgeChange: (items: KnowledgePointItem[]) => void         // 更新知识点（专用 API，传入完整对象列表）
  aiSelection?: AiProviderSelection                        // AI 供应商/模型选择（AI 插件使用）
  selectedIds?: string[]                                   // 多选题目 ID 列表（批量操作插件使用）
}

/* ========== 插件注册 ========== */

/** 插件注册条目：静态清单中每一项 */
export interface PluginRegistration {
  meta: PluginMeta                                          // 插件元数据
  loader: () => Promise<{ default: React.ComponentType<PluginProps> }>  // 动态加载器
}