/**
 * QuestionItem — 题库页单题展示项
 *
 * 功能：在题库管理页以"所见即所得"方式完整展示一道题目，
 *       包含题干、选项、图片、解析、知识点标签、属性徽章
 *       渲染风格与分题页（SplitQuestionEditor）保持一致
 * 输入参数：
 *   question: Question — 题目数据
 *   selected: boolean — 是否被勾选
 *   onSelect: (id: string) => void — 点击勾选框回调
 *   onClick: (question: Question) => void — 点击题目主体回调（用于打开编辑弹窗）
 *   onDelete?: (id: string) => void — 删除回调（可选）
 * 返回值：React 节点
 * 使用场景：题库管理页两列布局的题目卡片
 */
import { cn } from "@/utils/cn"
import {
  QUESTION_TYPE_COLORS,
  DIFFICULTY_COLORS,
} from "@/utils/constants"
import { formatQuestionType, formatDifficulty } from "@/utils/format"
import type { Question } from "@/types/question"
import PreviewRenderer from "@/components/question/PreviewRenderer"
import SmartQuestionImage from "@/components/common/SmartQuestionImage"
import {
  Square,
  SquareCheck,
  Trash2,
  BookOpen,
  Image as ImageIcon,
  Table2,
  Sigma,
  Pencil,
} from "lucide-react"

/* ========== 类型定义 ========== */

/** 组件 Props */
interface QuestionItemProps {
  question: Question
  selected: boolean
  onSelect: (id: string) => void
  onClick: (question: Question) => void
  onDelete?: (id: string) => void
}

/* ========== 工具函数 ========== */

/**
 * 图片数据标准化
 *
 * 功能：将后端返回的图片数据（字符串路径 / 字典对象）统一为
 *       { rawPath } 形式，供 SmartQuestionImage 使用
 * 输入参数：images - 原始图片数据数组
 * 返回值：含 rawPath 的对象数组（过滤无效项）
 */
function normalizeImages(images: unknown[]): { rawPath: string }[] {
  if (!images || !Array.isArray(images)) return []
  return images
    .map((item) => {
      if (typeof item === "string") return { rawPath: item }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        return { rawPath: String(obj.path || obj.url || "") }
      }
      return { rawPath: "" }
    })
    .filter((it) => it.rawPath.length > 0)
}

/* ========== 子组件：属性徽章 ========== */

/**
 * 属性徽章
 *
 * 功能：展示题型、难度等简短属性
 * 输入参数：label - 标签文字，bgClass/textClass - 颜色
 * 返回值：徽章节点
 */
function PropertyBadge({
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
        "inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap",
        bgClass,
        textClass,
      )}
    >
      {label}
    </span>
  )
}

/* ========== 主组件 ========== */

/**
 * 单题展示项
 *
 * 功能：渲染一道题目的完整内容，包括题干（Markdown/LaTeX/HTML）、
 *       强制展开的图片、选项（来自tasks.sty格式）、解析、知识点标签
 *       支持点击主体打开编辑弹窗、点击勾选框选中、点击删除按钮删除
 *       图片采用 SmartQuestionImage：依次尝试后端代理 → 原始路径 → 补全 images/ 子目录
 */
export default function QuestionItem({
  question,
  selected,
  onSelect,
  onClick,
  onDelete,
}: QuestionItemProps) {
  /* ========== 数据准备 ========== */

  // 属性配色与文字
  const typeColor = QUESTION_TYPE_COLORS[question.question_type]
  const diffColor = DIFFICULTY_COLORS[question.difficulty]
  const typeLabel = formatQuestionType(question.question_type)
  const diffLabel = formatDifficulty(question.difficulty)

  // 图片列表标准化（仅保留有 rawPath 的项）
  const imageList = normalizeImages(question.images || [])

  // 来源信息
  const sourceInfo = [
    question.source_paper_name,
    question.question_no ? String(question.question_no).padStart(2, "0") : null,
  ]
    .filter(Boolean)
    .join(" ")

  // 是否包含可选内容（用于在题干前显示内联提示）
  const hasOptions = Array.isArray(question.options) && question.options.length > 0

  /* ========== 渲染 ========== */

  return (
    <div
      className={cn(
        "group relative bg-white border rounded-lg transition-all duration-200 overflow-hidden h-full",
        "hover:shadow-md hover:border-blue-300",
        selected
          ? "ring-2 ring-blue-500 border-blue-200"
          : "border-slate-200",
      )}
    >
      {/* 顶部条：勾选 + 属性徽章 + 来源 + 操作按钮 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/50">
        {/* 勾选框 */}
        <button
          onClick={(e) => {
            e.stopPropagation()                                // 阻止冒泡到主体点击
            onSelect(question.id)
          }}
          className="shrink-0 transition-colors"
          title={selected ? "取消选中" : "选中"}
        >
          {selected ? (
            <SquareCheck size={18} className="text-blue-500" />
          ) : (
            <Square size={18} className="text-slate-300 group-hover:text-slate-400" />
          )}
        </button>

        {/* 题型徽章 */}
        {typeColor && (
          <PropertyBadge
            label={typeLabel}
            bgClass={typeColor.bg}
            textClass={typeColor.text}
          />
        )}

        {/* 难度徽章 */}
        {diffColor && (
          <PropertyBadge
            label={diffLabel}
            bgClass={diffColor.bg}
            textClass={diffColor.text}
          />
        )}

        {/* 内容标记：有图 / 有表 / 有公式 */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
          {question.has_figure && (
            <span className="inline-flex items-center gap-0.5" title="含图片">
              <ImageIcon size={11} />
              {imageList.length}
            </span>
          )}
          {question.has_table && (
            <span className="inline-flex items-center gap-0.5 text-orange-600" title="含表格">
              <Table2 size={11} />
            </span>
          )}
          {question.has_formula && (
            <span className="inline-flex items-center gap-0.5 text-purple-600" title="含公式">
              <Sigma size={11} />
            </span>
          )}
        </div>

        {/* 来源（试卷+题号）— 不再 truncate，必要时换行展示以保证可读性 */}
        {sourceInfo && (
          <span
            className="ml-auto text-[11px] text-slate-400 text-right break-all min-w-0 flex-1"
            title={sourceInfo}
          >
            {sourceInfo}
          </span>
        )}

        {/* 编辑按钮（hover 出现） */}
        <button
          onClick={(e) => {
            e.stopPropagation()                                // 阻止冒泡
            onClick(question)
          }}
          className="shrink-0 p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="编辑题目"
        >
          <Pencil size={14} />
        </button>

        {/* 删除按钮（hover 出现） */}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()                              // 阻止冒泡
              onDelete(question.id)
            }}
            className="shrink-0 p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="删除题目"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* 主体：点击打开编辑弹窗 */}
      <div
        onClick={() => onClick(question)}
        className="px-4 py-3 cursor-pointer transition-colors hover:bg-slate-50/30"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick(question)
          }
        }}
      >
        {/* 题干渲染（含 LaTeX 公式、HTML 图片标签、表格） */}
        <div className="preview-renderer prose prose-sm max-w-none text-slate-800 leading-relaxed [&_.katex-display]:my-2 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_img]:max-w-full">
          <PreviewRenderer content={question.stem || ""} />
          {!question.stem?.trim() && (
            <span className="text-slate-300 italic text-sm">（题干为空，点击编辑）</span>
          )}
        </div>

        {/* 图片区：强制展开（与分题页"图片强制全显示"策略一致） */}
        {imageList.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {imageList.map((img, idx) => (
              <SmartQuestionImage
                key={`${question.id}-${idx}`}
                questionId={question.id}
                imageIndex={idx}
                rawPath={img.rawPath}
                alt={`题目图片 ${idx + 1}`}
                className="w-full h-[200px] rounded border border-slate-100 bg-slate-50"
              />
            ))}
          </div>
        )}

        {/* 选项区：当 options 字段存在时单独渲染（tasks.sty 格式可被题干覆盖） */}
        {hasOptions && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-slate-700">
            {((question.options as unknown[]) || []).map((opt, idx) => {
              // 支持 {label, content} / 字符串 / {A: ...} 三种格式
              let label = String.fromCharCode(65 + idx)
              let content = ""
              if (typeof opt === "string") {
                content = opt
              } else if (opt && typeof opt === "object") {
                const obj = opt as Record<string, unknown>
                if (obj.label) label = String(obj.label)
                content = String(obj.content || obj.text || "")
              }
              return (
                <div key={idx} className="flex items-start gap-1.5 min-w-0">
                  <span className="font-medium text-slate-500 shrink-0">{label}.</span>
                  <span className="flex-1 min-w-0 break-words">{content}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* 解析区：有解析内容时显示 */}
        {question.analysis && question.analysis.trim() && (
          <div className="mt-3 p-2.5 rounded bg-amber-50/60 border border-amber-100">
            <div className="text-[11px] font-medium text-amber-700 mb-1">解析</div>
            <div className="preview-renderer prose prose-sm max-w-none text-slate-700 leading-relaxed [&_.katex-display]:my-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_img]:max-w-full">
              <PreviewRenderer content={question.analysis} />
            </div>
          </div>
        )}

        {/* 知识点标签区 */}
        {question.knowledge_points.length > 0 && (
          <div className="mt-3 flex items-start gap-1.5 flex-wrap">
            <BookOpen size={12} className="text-slate-400 mt-1 shrink-0" />
            {question.knowledge_points.map((kp) => (
              <span
                key={kp.id}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-blue-50 text-blue-600 font-medium whitespace-nowrap"
              >
                {kp.name}
              </span>
            ))}
          </div>
        )}

        {/* 底部元信息：分值、地区、来源年份 */}
        {(question.score != null || question.source_region || question.source_year) && (
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
            {question.score != null && <span>分值：{question.score}</span>}
            {question.source_region && <span>地区：{question.source_region}</span>}
            {question.source_year && <span>年份：{question.source_year}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
