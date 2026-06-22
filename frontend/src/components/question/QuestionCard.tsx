/**
 * 题目卡片组件
 *
 * 功能：题库页的题目卡片展示，包含选择框、标签、题干预览（支持公式渲染）、缩略图、知识点标签、操作按钮
 * 输入参数：question（题目数据）、selected（是否选中）、onSelect/onEdit/onPreview/onDelete/onAddToHomework（各类回调）
 * 返回值：React 组件
 * 使用场景：题库管理页列表中，以卡片形式展示每道题目
 */
import { cn } from "@/utils/cn"
import { formatQuestionType, formatDifficulty } from "@/utils/format"
import { QUESTION_TYPE_COLORS, DIFFICULTY_COLORS } from "@/utils/constants"
import { latexToPreview } from "@/utils/latexConverter"
import type { Question } from "@/types/question"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import rehypeKatex from "rehype-katex"
import "katex/dist/katex.min.css"
import {
  Eye,
  Pencil,
  BookPlus,
  Trash2,
  SquareCheck,
  Square,
} from "lucide-react"

/* ========== 类型定义 ========== */

/** 组件 Props */
interface QuestionCardProps {
  question: Question // 题目数据
  selected?: boolean // 是否被选中
  onSelect?: (id: string) => void // 选中回调
  onEdit?: (id: string) => void // 编辑回调
  onPreview?: (id: string) => void // 预览回调
  onDelete?: (id: string) => void // 删除回调
  onAddToHomework?: (id: string) => void // 加入组卷回调
}

/* ========== 工具函数 ========== */

/**
 * 图片URL标准化处理
 *
 * 功能：将相对路径补全为完整URL，确保图片可正常加载
 * 输入参数：images - 原始图片数据数组（字符串或对象）
 * 返回值：标准化后的URL字符串数组
 * 使用场景：题目卡片缩略图、校对工作台预览
 */
function normalizeImages(images: unknown[]): string[] {
  if (!images || !Array.isArray(images)) return [] // 空值或非数组直接返回
  return images.map((item) => {
    // 提取原始路径字符串
    let rawUrl = "" // 原始URL
    if (typeof item === "string") {
      rawUrl = item // 字符串格式直接使用
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown> // 对象格式提取path或url
      rawUrl = String(obj.path || obj.url || "") // 优先取path，其次url
    }
    // 根据路径前缀补全URL
    if (!rawUrl) return "" // 空路径跳过
    if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl // 绝对URL原样使用
    if (rawUrl.startsWith("/data/")) return rawUrl // 已有/data/前缀，Vite代理会处理
    if (rawUrl.startsWith("/images/")) return "/data" + rawUrl // /images/ → /data/images/
    return "/data/images/" + rawUrl // 其他相对路径补全为 /data/images/ + 路径
  }).filter((url) => url.length > 0) // 过滤空字符串
}

/* ========== 子组件：TagBadge ========== */

/**
 * 标签徽章组件
 *
 * 输入参数：label - 标签文字，bgClass - 背景色类名，textClass - 文字色类名
 * 返回值：React 节点
 */
function TagBadge({
  label,
  bgClass,
  textClass,
}: {
  label: string
  bgClass: string
  textClass: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium",
        bgClass,
        textClass
      )}
    >
      {label}
    </span>
  )
}

/* ========== 主组件 ========== */

/**
 * 题目卡片
 *
 * 功能：展示题目选择框、题型/难度标签、题干预览（支持LaTeX公式渲染）、图片缩略图、知识点标签、底部操作按钮
 * 输入参数：详见 QuestionCardProps
 * 返回值：React 组件
 */
export default function QuestionCard({
  question,
  selected = false,
  onSelect,
  onEdit,
  onPreview,
  onDelete,
  onAddToHomework,
}: QuestionCardProps) {
  /* ========== 数据提取 ========== */

  const typeColor = QUESTION_TYPE_COLORS[question.question_type] // 题型配色
  const diffColor = DIFFICULTY_COLORS[question.difficulty] // 难度配色
  const typeLabel = formatQuestionType(question.question_type) // 题型中文
  const diffLabel = formatDifficulty(question.difficulty) // 难度中文

  // 题干预览：使用 latexToPreview 转换为可渲染的 Markdown
  const stemMarkdown = latexToPreview(question.stem) // LaTeX → Markdown（含公式标记）

  // 来源信息：试卷名 + 题号
  const sourceInfo = [
    question.source_paper_name,
    question.question_no ? String(question.question_no).padStart(2, "0") : null,
  ]
    .filter(Boolean)
    .join(" ")

  // 图片缩略图：取第一张标准化后的图片
  const normalizedImages = normalizeImages(question.images || []) // 标准化图片URL
  const thumbnailUrl = question.has_figure && normalizedImages.length > 0 // 带图且有图片数据
    ? normalizedImages[0]
    : null

  /* ========== 渲染 ========== */

  return (
    <div
      className={cn(
        "group relative bg-white border rounded-lg transition-all duration-200",
        "hover:shadow-md -translate-y-0", // hover 阴影加深
        "hover:-translate-y-0.5", // hover 微上浮
        selected
          ? "ring-2 ring-blue-500 border-blue-200" // 选中：蓝色边框
          : "border-slate-200" // 未选中：默认边框
      )}
    >
      {/* 头部：选择框 + 标签 + 来源 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        {/* 选择框 */}
        <button
          onClick={() => onSelect?.(question.id)} // 点击选中/取消
          className="shrink-0 transition-colors"
        >
          {selected ? (
            <SquareCheck size={18} className="text-blue-500" /> // 选中图标
          ) : (
            <Square size={18} className="text-slate-300 group-hover:text-slate-400" /> // 未选中图标
          )}
        </button>

        {/* 题型标签 */}
        {typeColor && (
          <TagBadge
            label={typeLabel}
            bgClass={typeColor.bg}
            textClass={typeColor.text}
          />
        )}

        {/* 难度标签 */}
        {diffColor && (
          <TagBadge
            label={diffLabel}
            bgClass={diffColor.bg}
            textClass={diffColor.text}
          />
        )}

        {/* 来源信息（右侧，修复 truncate 与 shrink-0 冲突） */}
        {sourceInfo && (
          <span className="ml-auto text-[11px] text-slate-400 min-w-0 max-w-[120px] truncate">
            {sourceInfo}
          </span>
        )}
      </div>

      {/* 题干预览区（最多3行，支持 LaTeX 公式渲染） */}
      <div className="px-3 py-2.5">
        <div className="text-sm text-slate-700 leading-relaxed line-clamp-3 preview-renderer prose prose-sm max-w-none [&_.katex-display]:my-0 [&_.katex]:text-sm [&_p]:m-0 [&_p]:leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {stemMarkdown}
          </ReactMarkdown>
        </div>
      </div>

      {/* 图片缩略图区域（仅带图题目显示） */}
      {thumbnailUrl && (
        <div className="px-3 pb-2">
          <img
            src={thumbnailUrl} // 第一张图片的缩略图
            alt="题目图片"
            className="max-h-[80px] object-contain rounded" // 最大高度80px，等比缩放，圆角
          />
        </div>
      )}

      {/* 知识点标签区 */}
      {question.knowledge_points.length > 0 && (
        <div className="px-3 py-1.5 border-t border-slate-50">
          <div className="flex items-center gap-1 flex-wrap">
            {question.knowledge_points.map((kp) => (
              <span
                key={kp.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-blue-50 text-blue-600 font-medium" // 蓝色小标签
              >
                {kp.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 底部操作按钮 */}
      <div className="px-3 py-2 border-t border-slate-100">
        <div className="flex items-center gap-1">
          {/* 预览按钮（回调为空时不渲染） */}
          {onPreview && (
            <button
              onClick={() => onPreview(question.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 rounded hover:bg-slate-50 hover:text-blue-600 transition-colors"
            >
              <Eye size={13} />
              预览
            </button>
          )}

          {/* 编辑按钮（回调为空时不渲染） */}
          {onEdit && (
            <button
              onClick={() => onEdit(question.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 rounded hover:bg-slate-50 hover:text-blue-600 transition-colors"
            >
              <Pencil size={13} />
              编辑
            </button>
          )}

          {/* 加入组卷按钮（回调为空时不渲染） */}
          {onAddToHomework && (
            <button
              onClick={() => onAddToHomework(question.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 rounded hover:bg-slate-50 hover:text-blue-600 transition-colors"
            >
              <BookPlus size={13} />
              加入组卷
            </button>
          )}

          {/* 删除按钮 */}
          {onDelete && (
            <button
              onClick={() => onDelete(question.id)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 rounded hover:bg-red-50 hover:text-red-600 transition-colors ml-auto" // 右侧对齐
            >
              <Trash2 size={13} />
              删除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
