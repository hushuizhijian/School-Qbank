/**
 * SystemSetting — 系统默认模型设置（参照 ragflow 的 system-setting）
 * 功能：使用 ModelTreeSelect 按供应商分组下拉选择各类型默认模型
 * 输入：refreshKey（刷新计数器）
 * 返回值：系统模型设置面板 JSX
 * 使用场景：AIModelSettings 左侧面板顶部
 */
import { useState, useEffect } from "react"
import { HelpCircle } from "lucide-react"
import client from "@/api/client"
import { ModelTreeSelect } from "@/components/ModelTreeSelect"
import type { ModelOption } from "@/components/ModelTreeSelect"

// 模型类型字段映射（参照 ragflow 的 FieldToModelType）
const modelFields = [
  { id: "llm_id", label: "LLM", type: "chat", required: true, tip: "用于对话、题目分析等场景" },
  { id: "embd_id", label: "Embedding", type: "embedding", required: false, tip: "用于文本向量化和语义搜索" },
  { id: "img2txt_id", label: "VLM", type: "image2text", required: false, tip: "用于识别图片中的题目内容" },
  { id: "asr_id", label: "ASR", type: "speech2text", required: false, tip: "用于语音转文字" },
  { id: "rerank_id", label: "Rerank", type: "rerank", required: false, tip: "用于搜索结果重排序" },
  { id: "tts_id", label: "TTS", type: "tts", required: false, tip: "用于文字转语音" },
]

interface SystemSettingProps {
  refreshKey?: number
}

export default function SystemSetting({ refreshKey }: SystemSettingProps) {
  // 默认模型字典 {llm_id: "provider|instance|model"}
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({})
  // 可用模型列表
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
  // 加载状态
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [refreshKey])

  /** 加载默认模型和可用模型 */
  async function loadData() {
    setLoading(true)
    try {
      // 并行加载
      const [defaultRes, modelsRes] = await Promise.all([
        client.get<Record<string, string>>("/api/ai/default-model").catch(() => ({ data: {} })),
        client.get<ModelOption[]>("/api/ai/all-models").catch(() => ({ data: [] })),
      ])
      setDefaultModels(defaultRes.data || {})
      setAvailableModels(modelsRes.data || [])
    } catch {
      // 忽略
    }
    setLoading(false)
  }

  /** 处理模型变更（自动持久化） */
  async function handleChange(field: typeof modelFields[number], value: string) {
    setDefaultModels((prev) => ({ ...prev, [field.id]: value }))

    // 持久化到后端
    try {
      if (!value) {
        await client.put("/api/ai/default-model", {
          items: [{ model_type: field.type, model_provider: "", model_instance: "", model_name: "" }],
        })
      } else {
        const [provider, instance, model] = value.split("|")
        await client.put("/api/ai/default-model", {
          items: [{
            model_type: field.type,
            model_provider: provider,
            model_instance: instance,
            model_name: model,
          }],
        })
      }
    } catch {
      // 静默失败
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <article className="rounded-lg w-full">
      {/* 标题 */}
      <header className="py-4">
        <h2 className="text-xl font-semibold text-slate-800">设置默认模型</h2>
        <p className="mt-1 text-sm text-slate-400">请在开始之前完成这些设置</p>
      </header>

      {/* 模型选择列表 */}
      <div className="px-5 py-4 space-y-4 border border-slate-200 rounded-lg">
        {modelFields.map((field) => (
          <div key={field.id} className="flex gap-3 items-center">
            {/* 标签 */}
            <label className="w-1/4 text-sm text-slate-600 flex items-center gap-1">
              {field.required && <span className="text-red-400">*</span>}
              {field.label}
              {field.tip && (
                <span title={field.tip} className="cursor-help">
                  <HelpCircle size={12} className="text-slate-300" />
                </span>
              )}
            </label>
            {/* 选择器 */}
            <div className="w-3/4">
              <ModelTreeSelect
                modelTypes={[field.type]}
                value={defaultModels[field.id] || ""}
                onChange={(v) => handleChange(field, v)}
                placeholder="请选择模型"
                showSearch
                allowClear={!field.required}
                options={availableModels}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  )
}