/**
 * SmartQuestionImage — 智能回退式题目配图组件
 *
 * 功能：按优先级尝试多个 URL 加载同一张题目图片，
 *       解决历史数据中图片路径失效 / paper_id 缺失导致的 404 问题
 * 加载顺序：
 *   1. 后端代理接口 /api/questions/{questionId}/image?index={imageIndex}
 *      （后端会按 paper_id + 文件名在 data/papers 中智能查找真实文件）
 *   2. 原始 rawPath（直接请求，兼容外部资源 / uploads）
 *   3. rawPath 缺失 images/ 子目录时自动补全后再试一次
 * 输入参数：
 *   questionId — 题目 ID（用于后端代理）
 *   imageIndex — 题目 images 数组下标
 *   rawPath — 题目 images 字段中的原始路径（来自接口）
 *   alt — 替代文本
 *   className — 容器样式
 * 返回值：JSX 图片节点
 * 使用场景：题库管理页 / 校对工作台等需要稳定显示历史题目图片的位置
 *
 * 实现要点：父级传入 questionId/imageIndex/rawPath 变化时，组件应彻底
 *           重置内部状态。通过为子组件加 key 强制重挂载，避开
 *           useEffect 中调用 setState 触发的级联渲染问题。
 */
import { useMemo, useState } from "react"
import { ImageOff } from "lucide-react"
import { cn } from "@/utils/cn"

/** 组件属性 */
interface SmartQuestionImageProps {
  /** 题目 ID — 必填，用于后端代理接口 */
  questionId: string
  /** 题目 images 数组下标，默认 0 */
  imageIndex?: number
  /** 题目 images 字段中的原始路径（用于回退） */
  rawPath?: string
  /** 替代文本 */
  alt?: string
  /** 容器样式 */
  className?: string
}

/**
 * 根据 rawPath 与基地址拼出可访问的回退 URL 列表
 * 规则：
 *   - 已带协议 / data/uploads 等保持原样
 *   - /data/papers/{id}/xxx.jpg 同时给出 /data/papers/{id}/images/xxx.jpg
 *   - 其他以 /data/ 开头的直接使用
 */
function buildFallbackUrls(rawPath: string | undefined): string[] {
  if (!rawPath) return []
  if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
    return [rawPath]
  }
  if (rawPath.startsWith("/data/")) {
    const urls = [rawPath]
    // 为 /data/papers/{id}/xxx 补一个 /data/papers/{id}/images/xxx 回退
    const match = rawPath.match(/^\/data\/papers\/([^/]+)\/([^/]+)$/)
    if (match) {
      const [, paperId, filename] = match
      urls.push(`/data/papers/${paperId}/images/${filename}`)
    }
    return urls
  }
  // 兼容旧数据：裸文件名
  if (!rawPath.startsWith("/")) {
    return [`/data/images/${rawPath}`]
  }
  return [rawPath]
}

/**
 * 内部渲染单元 — 通过为自身加 key 强制重挂载以重置全部状态
 */
function ImageSlot({
  questionId,
  imageIndex,
  rawPath,
  alt,
  className,
}: SmartQuestionImageProps) {
  // 后端代理 URL（最高优先级，由后端在文件系统层面解析真实文件）
  const proxyUrl = `/api/questions/${questionId}/image?index=${imageIndex}`

  // 回退 URL 列表
  const fallbackUrls = useMemo(() => buildFallbackUrls(rawPath), [rawPath])

  // 所有候选 URL：proxy + 回退列表（去重）
  const candidates = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const u of [proxyUrl, ...fallbackUrls]) {
      if (u && !seen.has(u)) {
        seen.add(u)
        list.push(u)
      }
    }
    return list
  }, [proxyUrl, fallbackUrls])

  // 当前正在尝试的 URL 下标
  const [attempt, setAttempt] = useState(0)
  // 是否所有 URL 均失败
  const [isFailed, setIsFailed] = useState(false)
  // 是否正在加载中
  const [isLoading, setIsLoading] = useState(true)

  // 当前正在加载的 URL
  const currentSrc = candidates[attempt] || ""

  /**
   * 图片加载错误：尝试下一个候选 URL；全部失败后切换到占位态
   */
  const handleError = () => {
    if (attempt < candidates.length - 1) {
      setAttempt((prev) => prev + 1)                      // 尝试下一个候选 URL
      setIsLoading(true)
    } else {
      setIsFailed(true)                                   // 全部失败
      setIsLoading(false)
    }
  }

  /**
   * 图片加载完成
   */
  const handleLoad = () => {
    setIsLoading(false)
    setIsFailed(false)
  }

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-slate-50",
        className,
      )}
    >
      {/* 加载中占位 — 仅在第一次加载且未失败时显示 */}
      {isLoading && !isFailed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {/* 加载失败占位 */}
      {isFailed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 text-xs gap-1">
          <ImageOff size={20} />
          <span>图片加载失败</span>
        </div>
      )}

      {/* 真实图片（key 变化时强制重挂载以触发新 URL 加载） */}
      {!isFailed && currentSrc && (
        <img
          key={currentSrc}
          src={currentSrc}
          alt={alt}
          loading="lazy"
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            "w-full h-full object-contain transition-opacity duration-200",
            isLoading ? "opacity-0" : "opacity-100",
          )}
        />
      )}
    </div>
  )
}

/**
 * 智能回退式题目配图组件
 * 外层为 props 变化时通过 key 强制重置内部状态
 */
export default function SmartQuestionImage(props: SmartQuestionImageProps) {
  // props 变化（questionId/imageIndex/rawPath）整体重挂载以重置 attempt
  const resetKey = `${props.questionId}::${props.imageIndex ?? 0}::${props.rawPath ?? ""}`
  return <ImageSlot key={resetKey} {...props} />
}
