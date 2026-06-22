/**
 * ProviderIcon — 供应商图标（占位组件）
 * 功能：使用首字母 + 背景色生成简单的供应商图标
 * 输入：name（供应商名称）
 * 返回值：图标 JSX
 * 使用场景：供应商卡片图标
 */
import { cn } from "@/utils/cn"

// 供应商对应的颜色配置
const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: "bg-emerald-500",
  DeepSeek: "bg-blue-500",
  "ZHIPU-AI": "bg-indigo-500",
  Moonshot: "bg-rose-500",
  "Tongyi-Qianwen": "bg-orange-500",
  Anthropic: "bg-amber-600",
  Gemini: "bg-blue-400",
  Mistral: "bg-red-500",
  Cohere: "bg-purple-500",
  Groq: "bg-orange-400",
  TogetherAI: "bg-emerald-400",
  SILICONFLOW: "bg-cyan-500",
  xAI: "bg-slate-700",
  "Tencent Hunyuan": "bg-blue-600",
  BaiduYiyan: "bg-blue-500",
  StepFun: "bg-pink-500",
  MinerU: "bg-amber-500",
  PaddleOCR: "bg-blue-500",
  "OpenAI-API-Compatible": "bg-purple-500",
  Voyage: "bg-violet-500",
  MiniMax: "bg-red-400",
  GPUStack: "bg-green-500",
  LongCat: "bg-emerald-600",
  Bedrock: "bg-amber-600",
  "Azure-OpenAI": "bg-blue-500",
  NovitaAI: "bg-pink-400",
  PPIO: "bg-indigo-400",
  CometAPI: "bg-cyan-400",
  Jina: "bg-violet-400",
  Replicate: "bg-slate-600",
  讯飞星辰MaaS: "bg-cyan-500",
}

interface ProviderIconProps {
  name: string
  className?: string
}

export function ProviderIcon({ name, className }: ProviderIconProps) {
  const colorClass = PROVIDER_COLORS[name] || "bg-slate-400"
  const letter = name.charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        "w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0",
        colorClass,
        className
      )}
    >
      {letter}
    </div>
  )
}