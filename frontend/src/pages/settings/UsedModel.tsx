/**
 * UsedModel — 已添加的模型列表（参照 ragflow）
 * 功能：展示已添加供应商，每个供应商下显示实例，实例行可展开模型列表
 * 输入：refreshKey、onEditApiKey、onAddInstance
 * 返回值：已添加模型列表 JSX
 * 使用场景：AIModelSettings 左侧面板
 */
import { useState, useEffect, useCallback } from "react"
import { ChevronDown, ChevronUp, Trash2, Key, Plus } from "lucide-react"
import { ProviderIcon } from "@/components/ProviderIcon"
import client from "@/api/client"
import { mapModelKey } from "./AvailableModels"

/** 实例 */
interface Instance {
  id: string
  instance_name: string
  api_key: string
  status: string
}

/** 已添加供应商 */
interface AddedProvider {
  id: string
  name: string
  instance_count: number
  instances: Instance[]
}

/** 模型 */
interface Model {
  id: string
  model_name: string
  model_type: string
  max_tokens: number
  status: string
}

interface UsedModelProps {
  refreshKey?: number
  /** 点击 API-Key 按钮（重新输入密钥） */
  onEditApiKey?: (providerName: string, instance: Instance) => void
  /** 点击添加实例按钮 */
  onAddInstance?: (providerName: string) => void
}

export default function UsedModel({ refreshKey, onEditApiKey, onAddInstance }: UsedModelProps) {
  const [providers, setProviders] = useState<AddedProvider[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await client.get<AddedProvider[]>("/api/ai/providers")
      setProviders(res.data)
    } catch {
      // 忽略
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData, refreshKey])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full gap-4 mb-4">
      <div className="text-lg font-semibold text-slate-800 mt-2">添加了的模型</div>
      {providers.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <p className="text-sm">暂无已添加的供应商</p>
          <p className="text-xs mt-1">从右侧列表中选择供应商开始配置</p>
        </div>
      ) : (
        providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onEditApiKey={onEditApiKey}
            onAddInstance={onAddInstance}
            onRefresh={loadData}
          />
        ))
      )}
    </div>
  )
}

/** 供应商卡片 */
function ProviderCard({
  provider,
  onEditApiKey,
  onAddInstance,
  onRefresh,
}: {
  provider: AddedProvider
  onEditApiKey?: (providerName: string, instance: Instance) => void
  onAddInstance?: (providerName: string) => void
  onRefresh: () => void
}) {
  /** 删除整个供应商（含所有实例） */
  const handleDeleteProvider = async () => {
    if (!confirm(`确定删除供应商 "${provider.name}" 及其所有实例吗？`)) return
    try {
      await client.delete(`/api/ai/providers/${encodeURIComponent(provider.name)}`)
      onRefresh()
    } catch {
      alert("删除供应商失败")
    }
  }

  const hasInstances = provider.instances.length > 0

  return (
    <div className="w-full rounded-lg border border-slate-200">
      {/* 供应商头部 */}
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <ProviderIcon name={provider.name} className="!w-7 !h-7" />
          <span className="font-medium text-lg text-slate-800">{provider.name}</span>
        </div>
        {/* 删除供应商按钮 */}
        <button
          onClick={handleDeleteProvider}
          className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
          title="删除供应商"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 有实例：显示实例列表 */}
      {hasInstances && (
        <div className="border-t border-slate-200">
          {provider.instances.map((instance) => (
            <InstanceRow
              key={instance.id}
              instance={instance}
              providerName={provider.name}
              onEditApiKey={onEditApiKey}
              onRefresh={onRefresh}
            />
          ))}
          {/* 添加实例按钮 */}
          <div className="px-4 py-3 border-t border-slate-100">
            <button
              onClick={() => onAddInstance?.(provider.name)}
              className="text-xs text-slate-500 hover:text-blue-500 flex items-center gap-1"
            >
              <Plus size={12} />
              添加实例
            </button>
          </div>
        </div>
      )}

      {/* 无实例：显示提示 + 添加实例按钮 */}
      {!hasInstances && (
        <div className="border-t border-slate-200 px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-400">暂无实例配置</span>
          <button
            onClick={() => onAddInstance?.(provider.name)}
            className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
          >
            <Plus size={12} />
            添加实例
          </button>
        </div>
      )}
    </div>
  )
}

/** 实例行 */
function InstanceRow({
  instance,
  providerName,
  onEditApiKey,
  onRefresh,
}: {
  instance: Instance
  providerName: string
  onEditApiKey?: (providerName: string, instance: Instance) => void
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [models, setModels] = useState<Model[]>([])
  const [loadingModels, setLoadingModels] = useState(false)

  /** 删除实例 */
  const handleDelete = async () => {
    if (!confirm(`确定删除实例 "${instance.instance_name}" 吗？`)) return
    try {
      await client.delete(
        `/api/ai/providers/${encodeURIComponent(providerName)}/instances`,
        { data: { instances: [instance.instance_name] } }
      )
      onRefresh()
    } catch {
      alert("删除失败")
    }
  }

  /** 切换展开 */
  const toggleExpand = async () => {
    if (!expanded && models.length === 0) {
      setLoadingModels(true)
      try {
        const res = await client.get<Model[]>(
          `/api/ai/providers/${encodeURIComponent(providerName)}/instances/${encodeURIComponent(instance.instance_name)}/models`
        )
        setModels(res.data)
      } catch {
        // 忽略
      }
      setLoadingModels(false)
    }
    setExpanded(!expanded)
  }

  /** 切换模型状态 */
  const handleStatusChange = async (modelName: string, status: string) => {
    const newStatus = status === "active" ? "inactive" : "active"
    try {
      await client.patch(
        `/api/ai/providers/${encodeURIComponent(providerName)}/instances/${encodeURIComponent(instance.instance_name)}/models/${encodeURIComponent(modelName)}/status`,
        { status: newStatus }
      )
      setModels((prev) =>
        prev.map((m) =>
          m.model_name === modelName ? { ...m, status: newStatus } : m
        )
      )
    } catch {
      // 忽略
    }
  }

  /** 删除模型 */
  const handleDeleteModel = async (modelName: string) => {
    if (!confirm(`确定从实例中删除模型 "${modelName}" 吗？`)) return
    try {
      await client.delete(
        `/api/ai/providers/${encodeURIComponent(providerName)}/instances/${encodeURIComponent(instance.instance_name)}/models`,
        { data: { model_names: [modelName] } }
      )
      setModels((prev) => prev.filter((m) => m.model_name !== modelName))
    } catch {
      alert("删除模型失败")
    }
  }

  const modelTypes = [...new Set(models.map((m) => m.model_type))]

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <div className="flex items-center justify-between p-4">
        <span className="font-medium text-slate-700">{instance.instance_name}</span>
        <div className="flex items-center gap-2">
          {/* API-Key 按钮（重新输入） */}
          <button
            onClick={() => onEditApiKey?.(providerName, instance)}
            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-600 flex items-center gap-1"
          >
            <Key size={12} />
            API-Key
          </button>
          {/* 展开/收起按钮 */}
          <button
            onClick={toggleExpand}
            className="px-2 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 text-slate-600 flex items-center gap-1"
          >
            {expanded ? "隐藏模型" : "展示更多模型"}
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {/* 删除实例按钮 */}
          <button
            onClick={handleDelete}
            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
            title="删除实例"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4">
          {loadingModels ? (
            <div className="flex justify-center py-3">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {modelTypes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {modelTypes.map((type) => (
                    <span key={type} className="px-2 py-0.5 text-xs bg-slate-100 text-slate-500 rounded">
                      {mapModelKey[type] || type}
                    </span>
                  ))}
                </div>
              )}
              <div className="bg-slate-50 rounded-lg max-h-80 overflow-auto">
                {models.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">暂无模型</div>
                ) : (
                  <ul>
                    {models.map((model) => (
                      <li
                        key={model.id}
                        className="flex items-center justify-between p-3 border-b border-slate-200 last:border-b-0 hover:bg-white transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-sm text-slate-700">
                            {model.model_name}
                          </span>
                          {model.model_type && (
                            <span className="px-1.5 py-0.5 text-xs bg-slate-200 text-slate-500 rounded">
                              {mapModelKey[model.model_type] || model.model_type}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {/* 状态切换开关 */}
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={model.status === "active"}
                              onChange={() => handleStatusChange(model.model_name, model.status)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                          </label>
                          {/* 删除模型按钮 */}
                          <button
                            onClick={() => handleDeleteModel(model.model_name)}
                            className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500"
                            title="删除模型"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}