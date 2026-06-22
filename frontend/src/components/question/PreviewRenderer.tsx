/**
 * PreviewRenderer — 实时渲染预览组件
 *
 * 功能：将含 LaTeX 公式的 Markdown 文本实时渲染为格式化预览，
 *       V2新增：支持 HTML img 标签渲染（通过 rehype-raw 插件）
 * 输入参数：
 *   content: string — 含 LaTeX/HTML 的 Markdown 文本（$...$ 行内，$$...$$ 块级，<img> 标签）
 *   className?: string — 额外样式类名
 * 返回值：JSX 渲染结果
 * 使用场景：校对工作台右栏各编辑区的实时预览面板
 */
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import rehypeRaw from "rehype-raw"
import "katex/dist/katex.min.css"

interface PreviewRendererProps {
  /** 含 LaTeX 的 Markdown 文本 */
  content: string
  /** 额外样式类名 */
  className?: string
}

/** 实时渲染预览组件 */
export default function PreviewRenderer({ content, className }: PreviewRendererProps) {
  // 空内容时显示占位提示
  if (!content?.trim()) {
    return (
      <div className={`flex items-center justify-center text-slate-300 text-sm italic ${className || ""}`}>
        暂无内容
      </div>
    )
  }

  return (
    <div className={`preview-renderer prose prose-sm max-w-none ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
