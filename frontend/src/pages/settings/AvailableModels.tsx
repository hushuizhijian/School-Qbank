/**
 * AvailableModels — 可添加的模型列表（参照 ragflow）
 * 功能：展示系统可用供应商，支持搜索和标签筛选
 * 输入：providers、onAddModel
 * 返回值：供应商列表 JSX
 * 使用场景：AIModelSettings 右侧面板
 */
import { Search, Plus, ArrowUpRight } from "lucide-react"
import { useMemo, useState } from "react"
import { ProviderIcon } from "@/components/ProviderIcon"

// 模型类型映射
export const mapModelKey: Record<string, string> = {
  image2text: "VLM",
  speech2text: "ASR",
  chat: "LLM",
  vision: "VLM",
  embedding: "Embedding",
  asr: "ASR",
  rerank: "Rerank",
  tts: "TTS",
  ocr: "OCR",
}

const orderMap: Record<string, number> = {
  chat: 1, embedding: 2, rerank: 3, tts: 4, asr: 5,
  speech2text: 5, image2text: 6, vision: 6, ocr: 7,
}

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

function sortModelTypes(modelTypes: string[]): string[] {
  return [...modelTypes].sort((a, b) => (orderMap[a] || 999) - (orderMap[b] || 999))
}

interface SystemProvider {
  name: string
  model_types: string[]
  url: { default: string; [key: string]: string }
}

interface AvailableModelsProps {
  providers: SystemProvider[]
  onAddModel: (provider: SystemProvider) => void
}

export default function AvailableModels({ providers, onAddModel }: AvailableModelsProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // 搜索过滤
  const searchedModels = useMemo(() => {
    return providers.filter((p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [providers, searchTerm])

  // 标签过滤
  const filteredModels = useMemo(() => {
    if (selectedTag === null) return searchedModels
    return searchedModels.filter((p) =>
      p.model_types?.some((type) => type === selectedTag)
    )
  }, [searchedModels, selectedTag])

  // 标签计数
  const tagCounts = useMemo(() => {
    return searchedModels.reduce<Record<string, number>>((acc, p) => {
      new Set(p.model_types || []).forEach((type) => {
        acc[type] = (acc[type] || 0) + 1
      })
      return acc
    }, {})
  }, [searchedModels])

  // 所有标签
  const allTags = useMemo(() => {
    const tagsSet = new Set<string>()
    providers.forEach((p) => {
      p.model_types?.forEach((type) => tagsSet.add(type))
    })
    return sortModelTypes(Array.from(tagsSet))
  }, [providers])

  return (
    <aside className="text-slate-800 h-full flex flex-col">
      {/* 头部 */}
      <header className="p-4 space-y-3">
        <h3 className="text-base font-semibold text-slate-800">可选模型</h3>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            type="text"
            placeholder="搜索"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
        {/* 标签筛选 */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedTag(null)}
            className={`text-xs px-1.5 py-0.5 rounded-sm transition-colors ${
              selectedTag === null
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All
            <span className="ml-1 opacity-60">{searchedModels.length}</span>
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`text-xs px-1.5 py-0.5 rounded-sm transition-colors ${
                selectedTag === tag
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {mapModelKey[tag] || tag}
              <span className="ml-1 opacity-60">{tagCounts[tag] ?? 0}</span>
            </button>
          ))}
        </div>
      </header>

      {/* 供应商列表 */}
      <div className="p-4 pt-0 flex flex-col gap-3 overflow-auto h-full">
        {filteredModels.map((provider) => (
          <div
            key={provider.name}
            className="group border border-slate-200 rounded-lg p-3 hover:bg-slate-50 transition-colors cursor-pointer"
            onClick={() => onAddModel(provider)}
          >
            <div className="flex items-center gap-2 mb-2">
              {/* 供应商图标 */}
              <ProviderIcon name={provider.name} />
              <div className="flex flex-1 gap-1 items-center min-w-0">
                <span className="font-medium text-sm text-slate-800 truncate">
                  {provider.name}
                </span>
                {APIMapUrl[provider.name] && (
                  <a
                    href={APIMapUrl[provider.name]}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-slate-400 hover:text-blue-500 shrink-0"
                  >
                    <ArrowUpRight size={14} />
                  </a>
                )}
              </div>
              <button className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 shrink-0">
                <Plus size={12} className="inline mr-0.5" />
                添加
              </button>
            </div>
            {/* 模型类型标签 */}
            <div className="flex flex-wrap gap-1">
              {sortModelTypes(provider.model_types || []).map((type) => (
                <span
                  key={type}
                  className="px-1 flex items-center h-5 text-xs bg-slate-100 text-slate-500 rounded"
                >
                  {mapModelKey[type] || type}
                </span>
              ))}
            </div>
          </div>
        ))}
        {filteredModels.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">未找到匹配的供应商</div>
        )}
      </div>
    </aside>
  )
}