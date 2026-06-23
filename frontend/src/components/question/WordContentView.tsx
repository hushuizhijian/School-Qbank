/**
 * WordContentView — word_content 只读渲染器
 *
 * 功能：把 WordEditor 保存的 { html, images } 在组卷画布中以保存的形式显示
 *       文字部分 = HTML 渲染；图片部分 = 绝对定位浮层
 *       A4 整体按可用宽度等比缩放
 * 输入参数：见 WordContentViewProps
 * 返回值：富文本块
 * 使用场景：组卷页 HomeworkComposePage 渲染题干（替代/并排原 stem 预览）
 *
 * 数据约定：
 *   - 原始 A4 尺寸固定 794×1123px（与 WordEditor DEFAULT 一致）
 *   - 图片坐标/尺寸基于此坐标系，渲染时按 displayScale 等比缩放
 */
import type { WordContent, WordImage } from "@/components/question/WordEditor"

/* ========== 常量 ========== */

/** A4 原始尺寸（必须与 WordEditor 一致） */
const A4_WIDTH = 794
const A4_HEIGHT = 1123

/* ========== 类型 ========== */

/** 组件 Props */
interface WordContentViewProps {
  /** word_content 数据（来自 question.word_content，宽松类型避免使用方需要强转） */
  content: unknown
  /** 容器最大宽度（CSS px），用于等比缩放 A4 */
  maxWidth: number
  /** 容器最大高度（CSS px），超出时整体缩小 */
  maxHeight?: number
  /** 额外 className */
  className?: string
}

/**
 * 把 unknown 安全规整成 WordContent
 * 功能：宽松地校验 word_content 结构，缺字段用兜底值
 * 输入参数：raw — 来自 question.word_content
 * 返回值：WordContent | null（结构不合法时返回 null）
 */
function toWordContent(raw: unknown): WordContent | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const html = typeof obj.html === "string" ? obj.html : ""
  const imagesRaw = Array.isArray(obj.images) ? obj.images : []
  const images: WordImage[] = []
  for (const it of imagesRaw) {
    if (!it || typeof it !== "object") continue
    const im = it as Record<string, unknown>
    if (typeof im.url !== "string") continue
    const srcW = Number(im.srcW) || 0
    const srcH = Number(im.srcH) || 0
    if (srcW <= 0 || srcH <= 0) continue
    const crop = (im.crop && typeof im.crop === "object") ? (im.crop as Record<string, unknown>) : null
    images.push({
      id: String(im.id || im.url),
      url: im.url,
      x: Number(im.x) || 0,
      y: Number(im.y) || 0,
      w: Number(im.w) || srcW,
      h: Number(im.h) || srcH,
      srcW,
      srcH,
      crop: crop ? {
        x: Number(crop.x) || 0,
        y: Number(crop.y) || 0,
        w: Number(crop.w) || srcW,
        h: Number(crop.h) || srcH,
      } : { x: 0, y: 0, w: srcW, h: srcH },
    })
  }
  // 完全没有内容时直接返回 null
  if (!html.trim() && images.length === 0) return null
  return { html, images }
}

/* ========== 工具：URL 补全 ========== */

/**
 * 补全图片 URL（与 WordEditor / ProofreadingWorkbench 行为一致）
 * 输入参数：url — 原始 URL
 * 返回值：可访问的 URL
 */
function normalizeUrl(url: string): string {
  if (!url) return url
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  if (url.startsWith("/data/")) return url
  if (url.startsWith("/images/")) return "/data" + url
  return "/data/images/" + url
}

/* ========== 主组件 ========== */

/**
 * word_content 只读渲染器
 * 功能：把 A4 富文本按 displayScale 等比缩放后渲染
 *       文字层用 dangerouslySetInnerHTML；图片层用绝对定位浮层
 */
export default function WordContentView({
  content,
  maxWidth,
  maxHeight,
  className,
}: WordContentViewProps) {
  // 宽松规整未知数据；结构不合法或为空时显示占位
  const data = toWordContent(content)
  if (!data) {
    return (
      <div className={`text-slate-300 text-xs italic ${className || ""}`}>
        暂无 Word 版式
      </div>
    )
  }

  // 计算缩放：按可用宽 + 可用高取较小值（保证不超出）
  const wScale = maxWidth / A4_WIDTH
  const hScale = maxHeight ? maxHeight / A4_HEIGHT : wScale
  const scale = Math.min(wScale, hScale, 1)
  const dispW = A4_WIDTH * scale
  const dispH = A4_HEIGHT * scale

  return (
    <div
      className={`relative bg-white ${className || ""}`}
      style={{ width: dispW, height: dispH }}
    >
      {/* 文字层（z-index 1） */}
      <div
        className="absolute inset-0 p-12 text-slate-800 leading-relaxed prose prose-sm max-w-none"
        style={{
          fontSize: 16 * scale,
          padding: 48 * scale,
          zIndex: 1,
        }}
        dangerouslySetInnerHTML={{ __html: data.html || "" }}
      />

      {/* 图片层（z-index 10，浮于文字之上） */}
      {data.images && data.images.length > 0 && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
          {data.images.map((im) => (
            <ImageNodeView key={im.id} image={im} scale={scale} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ========== 子组件：单张图片只读节点 ========== */

/** 单张图片节点 Props */
interface ImageNodeViewProps {
  image: WordImage
  scale: number
}

/**
 * 单张图片节点（只读）
 * 功能：用 background-image + background-position 实现裁剪显示
 * 备注：与 WordEditor.ImageNode 同源，但只读无控点
 */
function ImageNodeView({ image, scale }: ImageNodeViewProps) {
  // 缩放后所有尺寸
  const x = image.x * scale
  const y = image.y * scale
  const w = image.w * scale
  const h = image.h * scale
  // 裁剪框 → 背景图比例：先把整张原图缩放到 (srcW*scale) 大小，再按裁剪框取区域
  const baseScale = w / image.srcW
  const bgW = image.srcW * baseScale
  const bgH = image.srcH * baseScale
  const bgX = -image.crop.x * baseScale
  const bgY = -image.crop.y * baseScale

  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
      }}
    >
      <div
        className="w-full h-full"
        style={{
          backgroundImage: `url(${normalizeUrl(image.url)})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: `${bgW}px ${bgH}px`,
          backgroundPosition: `${bgX}px ${bgY}px`,
        }}
      />
    </div>
  )
}
