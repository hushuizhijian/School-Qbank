/**
 * KaTeXPreviewPanel — KaTeX 公式渲染预览面板
 *
 * 功能：将 LaTeX 源字符串渲染为格式化预览，支持防抖、图片显示和错误提示
 * 输入参数：
 *   latex: string — LaTeX 源字符串
 *   images?: string[] — 题目图片URL列表
 *   imagePosition?: 'after-stem' | 'end' — 图片插入位置
 *   height?: string | number — 预览区域高度
 *   className?: string — 自定义 CSS 类名
 * 返回值：JSX 渲染结果
 * 使用场景：公式编辑器的实时预览面板，需要防抖避免频繁重渲染
 */
import { useState, useEffect, useMemo } from "react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeRaw from "rehype-raw"
import "katex/dist/katex.min.css"
import { useDebounce } from "@/hooks/useDebounce"
import { latexToPreview, type ImagePosition, type TasksRenderOptions } from "@/utils/latexConverter"

/** 组件属性接口 */
interface KaTeXPreviewPanelProps {
  /** LaTeX 源字符串 */
  latex: string
  /** 题目图片URL列表 */
  images?: string[]
  /** 图片插入位置：after-stem=题干后选项前，end=末尾 */
  imagePosition?: ImagePosition
  /** tasks 块渲染选项（是否显示 ABCD 标签、列间距等） */
  tasksRenderOptions?: TasksRenderOptions
  /** 预览区域高度，默认 '100%' */
  height?: string | number
  /** 自定义 CSS 类名 */
  className?: string
}

/** KaTeX 公式渲染预览面板 */
export default function KaTeXPreviewPanel({ latex, images, imagePosition, tasksRenderOptions, height = "100%", className }: KaTeXPreviewPanelProps) {
  // 防抖后的 LaTeX 源，避免频繁重渲染
  const debouncedLatex = useDebounce(latex, 500)

  // 公式解析错误状态
  const [error, setError] = useState(false)

  // 源内容变化时重置错误状态
  useEffect(() => {
    setError(false)
  }, [latex])

  // 将 LaTeX 源码转换为可渲染的 Markdown
  const previewContent = useMemo(() => {
    return latexToPreview(debouncedLatex, images, imagePosition, tasksRenderOptions)
  }, [debouncedLatex, images, tasksRenderOptions])

  // 渲染错误提示
  if (error) {
    return (
      <div
        className={`katex-preview ${className || ""}`}
        style={{
          padding: "16px",
          overflowY: "auto",
          fontSize: "14px",
          lineHeight: "1.8",
          height,
          color: "#ef4444",
        }}
      >
        公式解析失败，请检查 LaTeX 语法
      </div>
    )
  }

  // 空内容时显示占位提示
  if (!debouncedLatex?.trim() && (!images || images.length === 0)) {
    return (
      <div
        className={`katex-preview ${className || ""}`}
        style={{
          padding: "16px",
          overflowY: "auto",
          fontSize: "14px",
          lineHeight: "1.8",
          height,
          color: "#94a3b8",
          fontStyle: "italic",
        }}
      >
        暂无公式内容
      </div>
    )
  }

  // 正常渲染：使用 ReactMarkdown + remarkMath + rehypeKatex
  return (
    <div
      className={`katex-preview ${className || ""}`}
      style={{
        padding: "16px",
        overflowY: "auto",
        fontSize: "14px",
        lineHeight: "1.8",
        height,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
      >
        {previewContent}
      </ReactMarkdown>
    </div>
  )
}
