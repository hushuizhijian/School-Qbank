/**
 * AI模型选择器组件
 *
 * 功能：双下拉选择AI供应商和大模型，支持localStorage持久化
 * 布局：🤖 AI 模型: [供应商下拉] [大模型下拉]
 * 输入参数：
 *   - value: { providerId: string, modelId: string } — 当前选中值
 *     modelId 格式：providerName|instanceName|modelName
 *   - onChange: (value: { providerId: string, modelId: string }) => void — 变更回调
 *   - disabled?: boolean — 是否禁用
 * 返回值：React 组件
 * 使用场景：校对工作台顶部标题栏右侧
 *
 * 规则：
 *   - 模型来源：系统设置中已添加的供应商/实例/模型
 *   - 切换供应商时自动选中该供应商的第一个模型
 *   - 选择持久化到 localStorage，刷新后自动恢复
 */

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/utils/cn"
import {
  fetchAddedModels,
  groupModelsByProvider,
  parseModelId,
  buildModelId,
  DEFAULT_AI_MODEL,
} from "@/api/aiProviders"
import type { AIModel } from "@/api/aiProviders"
import { Bot } from "lucide-react"

/* ========== 类型定义 ========== */

/** 选择值结构 */
interface SelectorValue {
  providerId: string                                 // 供应商名称（如 智谱AI / DeepSeek）
  modelId: string                                    // 结构化模型ID（providerName|instanceName|modelName）
}

/** AI模型选择器 Props */
interface AiModelSelectorProps {
  value: SelectorValue                               // 当前选中值
  onChange: (value: SelectorValue) => void           // 选择变更回调
  disabled?: boolean                                 // 是否禁用
}

/* ========== 常量 ========== */

/** localStorage 存储键 */
const STORAGE_KEY = "ai_model_selector"

/* ========== 工具函数 ========== */

/**
 * 从 localStorage 恢复选择值
 *
 * 功能：读取持久化的供应商和模型选择
 * 输入参数：无
 * 返回值：SelectorValue | null
 * 使用场景：组件初始化时恢复上次选择
 */
function loadFromStorage(): SelectorValue | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)     // 读取存储
    if (!raw) return null
    const parsed = JSON.parse(raw) as SelectorValue
    if (parsed.providerId && parsed.modelId) {
      return parsed                                   // 返回有效值
    }
    return null
  } catch {
    return null                                       // 解析失败返回null
  }
}

/**
 * 保存选择值到 localStorage
 *
 * 功能：持久化当前供应商和模型选择
 * 输入参数：value — 要保存的选择值
 * 返回值：无
 * 使用场景：选择变更时持久化
 */
function saveToStorage(value: SelectorValue): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) // 保存到存储
  } catch {
    // 存储失败静默忽略
  }
}

/* ========== 主组件 ========== */

export default function AiModelSelector({
  value,
  onChange,
  disabled = false,
}: AiModelSelectorProps) {
  /* ========== 状态 ========== */

  // 已加载的全部模型（按供应商分组）
  const [grouped, setGrouped] = useState<Array<{ provider: { id: string; name: string; provider_key: string; models_count?: number }; models: AIModel[] }>>([])
  // 加载状态
  const [loading, setLoading] = useState(true)
  // 是否已初始化
  const [initialized, setInitialized] = useState(false)

  /* ========== 加载系统设置中的模型列表 ========== */

  useEffect(() => {
    let cancelled = false                             // 取消标志

    const loadModels = async () => {
      try {
        setLoading(true)
        const models = await fetchAddedModels()       // 从后端加载用户已添加的模型
        if (!cancelled) {
          setGrouped(groupModelsByProvider(models))   // 按供应商分组
        }
      } catch {
        if (!cancelled) {
          setGrouped([])                              // 加载失败置空
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadModels()                                      // 执行加载
    return () => { cancelled = true }                 // 清理
  }, [])                                              // 仅挂载时执行

  /* ========== 初始化：恢复 localStorage 或使用默认值 ========== */

  useEffect(() => {
    if (loading || initialized) return                // 加载中或已初始化则跳过
    if (grouped.length === 0) {
      // 系统设置中没有任何模型：直接使用默认值（兜底）
      onChange(DEFAULT_AI_MODEL)
      saveToStorage(DEFAULT_AI_MODEL)
      setInitialized(true)
      return
    }
    const saved = loadFromStorage()                   // 尝试从存储恢复
    if (saved) {
      // 校验保存的供应商是否在列表中
      const providerGroup = grouped.find((g) => g.provider.name === saved.providerId)
      if (providerGroup && providerGroup.models.length > 0) {
        // 校验保存的模型是否在该供应商的模型列表中
        const modelExists = providerGroup.models.some((m) => m.id === saved.modelId)
        if (modelExists) {
          onChange(saved)                             // 恢复选择
        } else {
          // 模型已被删除，选中该供应商的第一个模型
          const first = providerGroup.models[0]
          const newValue = { providerId: providerGroup.provider.name, modelId: first.id }
          onChange(newValue)
          saveToStorage(newValue)
        }
      } else {
        // 供应商不存在，使用第一个供应商的第一个模型
        const firstGroup = grouped[0]
        const first = firstGroup.models[0]
        const newValue = { providerId: firstGroup.provider.name, modelId: first.id }
        onChange(newValue)
        saveToStorage(newValue)
      }
    } else {
      // 无存储记录：使用第一个供应商的第一个模型（来自系统设置）
      const firstGroup = grouped[0]
      const first = firstGroup.models[0]
      const newValue = { providerId: firstGroup.provider.name, modelId: first.id }
      onChange(newValue)
      saveToStorage(newValue)
    }
    setInitialized(true)                              // 标记已初始化
  }, [loading, grouped, initialized, onChange])

  /* ========== 当前选中供应商的模型列表 ========== */

  const currentProvider = grouped.find((g) => g.provider.name === value.providerId)
  const currentModels = currentProvider?.models || []

  /* ========== 供应商切换处理 ========== */

  const handleProviderChange = useCallback(
    (newProviderName: string) => {
      // 切换供应商时，自动选中该供应商的第一个模型
      const targetGroup = grouped.find((g) => g.provider.name === newProviderName)
      if (!targetGroup || targetGroup.models.length === 0) return
      const firstModel = targetGroup.models[0]
      const newValue = { providerId: newProviderName, modelId: firstModel.id }
      onChange(newValue)                              // 更新选择
      saveToStorage(newValue)                         // 持久化
    },
    [grouped, onChange]
  )

  /* ========== 模型切换处理 ========== */

  const handleModelChange = useCallback(
    (newModelId: string) => {
      const newValue = { providerId: value.providerId, modelId: newModelId }
      onChange(newValue)                              // 更新选择
      saveToStorage(newValue)                         // 持久化
    },
    [value.providerId, onChange]
  )

  /* ========== 渲染 ========== */

  // 当前模型的多实例信息（用于下拉显示）
  const renderModelLabel = (m: AIModel) => {
    // 如果同一供应商有多个实例，在模型名后追加实例名以区分
    const sameProviderGroups = grouped.filter((g) => g.provider.name === m.provider_name)
    if (sameProviderGroups.length > 0 && sameProviderGroups[0].models.length > 0) {
      // 简化：直接显示 model_name + instance_name
      return m.instance_name && m.instance_name !== "default"
        ? `${m.model_key} (${m.instance_name})`
        : m.model_key
    }
    return m.model_key
  }

  return (
    <div className="flex items-center gap-2">
      {/* 标签 */}
      <div className="flex items-center gap-1 shrink-0">
        <Bot size={14} className="text-slate-500" />  {/* 机器人图标 */}
        <span className="text-xs text-slate-600 font-medium">AI 模型:</span>
      </div>

      {/* 供应商下拉 */}
      <select
        value={value.providerId}
        onChange={(e) => handleProviderChange(e.target.value)} // 切换供应商
        disabled={disabled || grouped.length === 0}   // 禁用条件
        className={cn(
          "h-7 px-2 text-xs border border-slate-300 rounded bg-white",
          "focus:outline-none focus:ring-1 focus:ring-blue-400",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {grouped.length === 0 ? (
          <option value="" disabled>
            {loading ? "加载中..." : "暂无可用模型"}
          </option>
        ) : (
          <>
            <option value="" disabled>
              选择供应商
            </option>
            {grouped.map((g) => (
              <option key={g.provider.id} value={g.provider.name}>
                {g.provider.name} ({g.models.length})
              </option>
            ))}
          </>
        )}
      </select>

      {/* 大模型下拉 */}
      <select
        value={value.modelId}
        onChange={(e) => handleModelChange(e.target.value)} // 切换模型
        disabled={disabled || currentModels.length === 0 || !value.providerId} // 禁用条件
        className={cn(
          "h-7 px-2 text-xs border border-slate-300 rounded bg-white",
          "focus:outline-none focus:ring-1 focus:ring-blue-400",
          "disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {currentModels.length === 0 ? (
          <option value="" disabled>
            选择模型
          </option>
        ) : (
          <>
            <option value="" disabled>
              选择模型
            </option>
            {currentModels.map((m) => (
              <option key={m.id} value={m.id}>
                {renderModelLabel(m)}
              </option>
            ))}
          </>
        )}
      </select>
    </div>
  )
}

// 导出结构化模型ID的解析/构造工具，方便其他组件复用
export { parseModelId, buildModelId }
