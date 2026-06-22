/**
 * AIModelSettings — AI 模型配置主页面（参照 ragflow 的 setting-model）
 * 功能：左侧 SystemSetting + UsedModel，右侧 AvailableModels，弹窗 ProviderModal
 * 输入：无
 * 返回值：AI 模型配置面板 JSX
 * 使用场景：SettingsPage 中 "AI模型" 标签页
 */
import { useState, useEffect, useCallback } from "react"
import client from "@/api/client"
import SystemSetting from "./SystemSetting"
import UsedModel from "./UsedModel"
import AvailableModels from "./AvailableModels"
import ProviderModal from "./ProviderModal"

/** 系统可用供应商（ragflow 格式） */
interface SystemProvider {
  name: string
  model_types: string[]
  url: { default: string; [key: string]: string }
}

/** 实例 */
interface Instance {
  id: string
  instance_name: string
  api_key: string
  status: string
}

/** AI 模型配置组件 */
export default function AIModelSettings() {
  // 系统可用供应商列表
  const [availableProviders, setAvailableProviders] = useState<SystemProvider[]>([])
  // 加载状态
  const [loading, setLoading] = useState(true)
  // 弹窗状态
  const [showModal, setShowModal] = useState(false)
  // 当前正在配置的供应商
  const [currentProvider, setCurrentProvider] = useState<SystemProvider | null>(null)
  // 弹窗模式
  const [modalMode, setModalMode] = useState<"add" | "edit">("add")
  // 弹窗初始值
  const [modalInitialValues, setModalInitialValues] = useState<{
    instance_name?: string
    api_key?: string
    base_url?: string
  }>({})
  // UsedModel 刷新计数器
  const [refreshKey, setRefreshKey] = useState(0)

  // 加载可用供应商
  useEffect(() => {
    loadData()
    // 首次加载时自动迁移已添加但无实例的供应商
    autoMigrate()
  }, [])

  /** 自动迁移接口：初始化已添加但无实例的供应商 */
  async function autoMigrate() {
    try {
      await client.post("/api/ai/migrate-instances")
    } catch {
      // 静默
    }
  }

  /** 加载可用供应商列表 */
  const loadData = async () => {
    setLoading(true)
    try {
      const res = await client.get<SystemProvider[]>("/api/ai/providers?available=true")
      setAvailableProviders(res.data)
    } catch (err) {
      console.error("加载供应商列表失败:", err)
    }
    setLoading(false)
  }

  /** 点击添加供应商（右侧面板）→ 弹出配置弹窗 */
  const handleAddModel = useCallback(
    async (provider: SystemProvider) => {
      setCurrentProvider(provider)
      setModalMode("add")
      setModalInitialValues({ base_url: provider.url?.default || "" })
      // 先尝试添加到租户（幂等）
      try {
        await client.put("/api/ai/providers", { provider_name: provider.name })
      } catch (err: any) {
        if (err?.response?.status !== 400) {
          alert("添加失败，请重试")
          return
        }
      }
      setShowModal(true)
    },
    []
  )

  /** 点击 "API-Key" 按钮 → 弹出修改密钥弹窗 */
  const handleEditApiKey = useCallback(
    (providerName: string, instance: Instance) => {
      const provider = availableProviders.find((p) => p.name === providerName)
      if (provider) {
        setCurrentProvider(provider)
      } else {
        // 用一个最小可用的 provider 对象
        setCurrentProvider({
          name: providerName,
          model_types: [],
          url: { default: "" },
        })
      }
      setModalMode("edit")
      setModalInitialValues({
        instance_name: instance.instance_name,
        api_key: instance.api_key,
      })
      setShowModal(true)
    },
    [availableProviders]
  )

  /** 点击 "添加实例" 按钮 */
  const handleAddInstance = useCallback(
    (providerName: string) => {
      const provider = availableProviders.find((p) => p.name === providerName)
      if (provider) {
        setCurrentProvider(provider)
        setModalMode("add")
        setModalInitialValues({ base_url: provider.url?.default || "" })
        setShowModal(true)
      }
    },
    [availableProviders]
  )

  /** 保存实例（根据模式走 add 或 update） */
  const handleSave = useCallback(
    async (values: { instance_name: string; api_key: string; base_url: string }) => {
      if (!currentProvider) return

      if (modalMode === "edit") {
        // 修改 API Key
        await client.put(
          `/api/ai/providers/${currentProvider.name}/instances/${values.instance_name}/apikey`,
          {
            api_key: values.api_key,
            base_url: values.base_url,
          }
        )
      } else {
        // 新增实例
        await client.post(`/api/ai/providers/${currentProvider.name}/instances`, {
          instance_name: values.instance_name,
          api_key: values.api_key,
          base_url: values.base_url,
        })
      }
      setRefreshKey((k) => k + 1)
    },
    [currentProvider, modalMode]
  )

  /** 验证连接 */
  const handleVerify = useCallback(
    async (values: { api_key: string; base_url: string }) => {
      if (!currentProvider) throw new Error("无供应商")
      const res = await client.post(`/api/ai/providers/${currentProvider.name}/connection`, {
        api_key: values.api_key,
        base_url: values.base_url,
      })
      return res.data as { success: boolean; message: string; latency_ms: number }
    },
    [currentProvider]
  )

  /** 关闭弹窗 */
  const hideModal = useCallback(() => {
    setShowModal(false)
    setCurrentProvider(null)
    setModalInitialValues({})
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex w-full border border-slate-200 rounded-lg overflow-hidden" style={{ minHeight: "550px" }}>
      {/* 左侧面板 — 系统模型设置 + 已添加的模型 */}
      <section className="flex flex-col gap-4 w-3/5 px-5 border-r border-slate-200 overflow-auto bg-white">
        <SystemSetting refreshKey={refreshKey} />
        <UsedModel
          refreshKey={refreshKey}
          onEditApiKey={handleEditApiKey}
          onAddInstance={handleAddInstance}
        />
      </section>

      {/* 右侧面板 — 可添加的模型 */}
      <section className="flex flex-col w-2/5 overflow-auto bg-white">
        <AvailableModels
          providers={availableProviders}
          onAddModel={handleAddModel}
        />
      </section>

      {/* 供应商配置弹窗 */}
      <ProviderModal
        visible={showModal}
        llmFactory={currentProvider?.name || ""}
        instanceUrl={currentProvider?.url?.default || ""}
        initialValues={modalInitialValues}
        mode={modalMode}
        onOk={handleSave}
        onVerify={handleVerify}
        hideModal={hideModal}
      />
    </div>
  )
}