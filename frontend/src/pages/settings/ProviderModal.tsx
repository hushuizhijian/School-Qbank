/**
 * ProviderModal — 供应商配置弹窗（参照 ragflow 的 ProviderModal）
 * 功能：支持新增实例（addMode）和修改 API Key（editMode）两种模式
 * 输入：visible、llmFactory、initialValues、mode、onOk、onVerify、hideModal
 * 返回值：弹窗 JSX
 * 使用场景：AIModelSettings 中点击添加供应商 / API-Key 按钮
 */
import { useState, useEffect } from "react"
import { RefreshCw, CheckCircle, XCircle, ArrowUpRight, Plus } from "lucide-react"
import { ProviderIcon } from "@/components/ProviderIcon"
import { cn } from "@/utils/cn"

// API Key 获取链接
const APIMapUrl: Record<string, string> = {
  OpenAI: "https://platform.openai.com/api-keys",
  DeepSeek: "https://platform.deepseek.com/api_keys",
  "ZHIPU-AI": "https://open.bigmodel.cn/usercenter/apikeys",
  Moonshot: "https://platform.moonshot.cn/console/api-keys",
  "Tongyi-Qianwen": "https://dashscope.console.aliyun.com/apiKey",
  MinerU: "https://mineru.net/apiManage/tokens",
  SILICONFLOW: "https://cloud.siliconflow.cn/account/ak",
  Anthropic: "https://console.anthropic.com/settings/keys",
  Gemini: "https://aistudio.google.com/app/apikey",
  Groq: "https://console.groq.com/keys",
  TogetherAI: "https://api.together.xyz/settings/api-keys",
  Voyage: "https://www.voyageai.com/",
  Cohere: "https://dashboard.cohere.com/api-keys",
  Mistral: "https://console.mistral.ai/api-keys/",
  MiniMax: "https://platform.minimaxi.com/",
  Replicate: "https://replicate.com/account/api-tokens",
  讯飞星辰MaaS: "https://maas.xfyun.cn/packageSubscription",
}

// Token-only 供应商（无 base_url）
const TOKEN_ONLY_PROVIDERS = ["MinerU", "PaddleOCR", "OpenDataLoader"]

interface VerifyResult {
  success: boolean
  message: string
  latency_ms: number
}

interface ProviderModalProps {
  visible: boolean
  llmFactory: string
  instanceUrl: string
  initialValues?: {
    instance_name?: string
    api_key?: string
    base_url?: string
  }
  /** 模式：add（新增实例）/ edit（修改 API Key） */
  mode?: "add" | "edit"
  onOk: (values: { instance_name: string; api_key: string; base_url: string }) => Promise<void>
  onVerify: (values: { api_key: string; base_url: string }) => Promise<VerifyResult>
  hideModal: () => void
}

export default function ProviderModal({
  visible,
  llmFactory,
  instanceUrl,
  initialValues,
  mode = "add",
  onOk,
  onVerify,
  hideModal,
}: ProviderModalProps) {
  // 表单
  const [instanceName, setInstanceName] = useState("default")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  // 状态
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ instanceName?: string; apiKey?: string }>({})

  const isTokenOnly = TOKEN_ONLY_PROVIDERS.includes(llmFactory)
  const isEditMode = mode === "edit"

  // 弹窗打开时重置
  useEffect(() => {
    if (visible) {
      setInstanceName(initialValues?.instance_name || "default")
      setApiKey(initialValues?.api_key || "")
      setBaseUrl(initialValues?.base_url || instanceUrl || "")
      setVerifyResult(null)
      setErrors({})
    }
  }, [visible, initialValues, instanceUrl])

  /** 表单验证 */
  const validate = (): boolean => {
    const newErrors: { instanceName?: string; apiKey?: string } = {}
    if (!isEditMode && !instanceName.trim()) newErrors.instanceName = "请输入实例名称"
    if (!apiKey.trim()) newErrors.apiKey = `请输入${isTokenOnly ? "Token" : "API Key"}`
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  /** 验证连接 */
  const handleVerify = async () => {
    if (!apiKey.trim()) {
      setErrors({ apiKey: `请先输入${isTokenOnly ? "Token" : "API Key"}` })
      return
    }
    setVerifying(true)
    setVerifyResult(null)
    try {
      const result = await onVerify({ api_key: apiKey, base_url: baseUrl })
      setVerifyResult(result)
    } catch {
      setVerifyResult({ success: false, message: "验证请求失败", latency_ms: 0 })
    }
    setVerifying(false)
  }

  /** 保存 */
  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await onOk({ instance_name: instanceName, api_key: apiKey, base_url: baseUrl })
      hideModal()
    } catch {
      // 外部处理
    }
    setSaving(false)
  }

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl w-[520px] max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-200">
          <ProviderIcon name={llmFactory} />
          <div className="flex flex-1 gap-1 items-center">
            <span className="font-medium text-base text-slate-800">{llmFactory}</span>
            {APIMapUrl[llmFactory] && (
              <a
                href={APIMapUrl[llmFactory]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-blue-500"
                title="获取 API Key"
              >
                <ArrowUpRight size={16} />
              </a>
            )}
          </div>
        </div>

        {/* 标题 */}
        <div className="px-5 pt-4">
          <h3 className="text-base font-medium text-slate-800">
            {isEditMode ? "修改 API Key" : "配置供应商"}
          </h3>
        </div>

        {/* 表单 */}
        <div className="p-5 space-y-4">
          {/* 实例名称（仅新增模式显示） */}
          {!isEditMode && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                实例名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={instanceName}
                onChange={(e) => { setInstanceName(e.target.value); setErrors((prev) => ({ ...prev, instanceName: undefined })) }}
                placeholder="如：default"
                className={cn(
                  "w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                  errors.instanceName ? "border-red-300" : "border-slate-200"
                )}
              />
              {errors.instanceName && <p className="mt-1 text-xs text-red-400">{errors.instanceName}</p>}
            </div>
          )}

          {/* 编辑模式显示当前实例名 */}
          {isEditMode && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">实例名称</label>
              <div className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 text-slate-700">
                {instanceName}
              </div>
            </div>
          )}

          {/* API Key / Token */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1.5">
              {isTokenOnly ? "Token" : "API Key"} <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setErrors((prev) => ({ ...prev, apiKey: undefined })) }}
              placeholder={isEditMode ? "留空表示不修改" : (isTokenOnly ? "输入 MinerU Token" : "输入 API Key")}
              className={cn(
                "w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500",
                errors.apiKey ? "border-red-300" : "border-slate-200"
              )}
            />
            {errors.apiKey && <p className="mt-1 text-xs text-red-400">{errors.apiKey}</p>}
          </div>

          {/* Base URL */}
          {!isTokenOnly && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">API 地址</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="如：https://api.deepseek.com/v1"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* 验证 */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <button
                onClick={handleVerify}
                disabled={verifying}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors text-slate-600"
              >
                <RefreshCw size={14} className={cn(verifying && "animate-spin")} />
                {verifying ? "验证中..." : "验证"}
              </button>

              {verifyResult && (
                <span className={cn("text-sm", verifyResult.success ? "text-emerald-600" : "text-red-500")}>
                  {verifyResult.success ? "验证通过" : "验证失败"}
                </span>
              )}
            </div>

            {verifyResult && (
              <div
                className={cn(
                  "mt-2 p-3 rounded-lg text-xs",
                  verifyResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                )}
              >
                <div className="flex items-center gap-2">
                  {verifyResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  <span>{verifyResult.message}</span>
                  {verifyResult.success && verifyResult.latency_ms > 0 && (
                    <span className="text-emerald-500 ml-auto">{verifyResult.latency_ms}ms</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={hideModal}
            className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors text-slate-600"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "保存中..." : "确定"}
          </button>
        </div>
      </div>
    </div>
  )
}