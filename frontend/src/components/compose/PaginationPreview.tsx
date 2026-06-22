/**
 * 分页预览组件 — 多页 A4/A3 试卷的实时分页预览
 *
 * 功能：
 *  - 自动估算每道题占用高度，按 A4/A3 纸张分页
 *  - 在画布中垂直堆叠多个 A4/A3 页面，每页显示该页应包含的题目
 *  - 显示页码和分页边界，帮助用户直观掌握内容布局
 *  - 与单页预览的 PaperPreview 共享相同的标题/页眉/水印样式
 *
 * 输入参数：见 PaginationPreviewProps
 * 返回值：分页预览节点
 *
 * 使用场景：HomeworkComposePage 中开启"分页预览"模式时
 */
import { useMemo } from "react"
import { cn } from "@/utils/cn"
import type { Question } from "@/types/question"
import type { Homework, HomeworkPageConfig } from "@/types/homework"
import { paginateQuestions, type PaginationItem } from "@/utils/pagination"
import PreviewRenderer from "@/components/question/PreviewRenderer"

export interface PaginationPreviewProps {
  paperSize: "A3" | "A4"
  pageConfig: HomeworkPageConfig
  homework: Homework
  items: PaginationItem[]
  fontSizes: {
    title: number
    info: number
    question: number
    header: number
    footer: number
    watermark: number
  }
  scale: number
  previewWidth: number
  previewMinHeight: number
}

/**
 * 计算水印网格（与 PaperPreview 保持一致）
 * 输入参数：pageConfig - 页面配置；fontSize - 水印字号；scale - 画布缩放
 * 返回值：水印网格 ReactNode
 * 需求（PDF 1:1 还原）：画布字号 = 配置值 / scale，与 PDF 物理尺寸一致
 */
function renderWatermarkGrid(
  pageConfig: HomeworkPageConfig,
  fontSize: number,
  scale: number,
) {
  if (!pageConfig.watermark_text) return null
  const opacity = Math.max(pageConfig.watermark_opacity ?? 0.08, 0.12)
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => {
        const row = Math.floor(i / 2)
        const col = i % 2
        return (
          <div
            key={i}
            className="absolute text-slate-400 font-bold select-none whitespace-nowrap"
            style={{
              left: `${(25 + col * 50)}%`,
              top: `${(20 + row * 30)}%`,
              transform: `translate(-50%, -50%) rotate(${pageConfig.watermark_angle ?? -30}deg)`,
              fontSize: `${fontSize * scale}px`,
              opacity,
            }}
          >
            {pageConfig.watermark_text}
          </div>
        )
      })}
    </div>
  )
}

/**
 * 渲染单个分页页面的标题区
 * 输入参数：homework - 作业；pageConfig - 页面配置；fontSizes - 各类字号；scale - 画布缩放；showDivider - 是否显示分隔线
 * 返回值：标题区 ReactNode
 */
function renderCoverArea(
  homework: Homework,
  pageConfig: HomeworkPageConfig,
  fontSizes: { title: number; info: number },
  scale: number,
  showDivider: boolean,
) {
  return (
    <div className="relative text-center mb-3">
      <div
        className="font-bold text-slate-900"
        style={{ fontSize: `${fontSizes.title * scale}px`, lineHeight: 1.4 }}
      >
        {homework.title || "（未命名试卷）"}
      </div>
      {(homework.subject || homework.grade) && (
        <div
          className="mt-1 text-slate-500 flex items-center justify-center gap-3"
          style={{ fontSize: `${fontSizes.info * scale}px` }}
        >
          {homework.subject && <span>学科：{homework.subject}</span>}
          {homework.grade && <span>年级：{homework.grade}</span>}
        </div>
      )}
      {pageConfig.show_name_class !== false && (
        <div
          className="mt-1 text-slate-500"
          style={{ fontSize: `${fontSizes.info * scale}px` }}
        >
          姓名：__________   班级：__________   得分：__________
        </div>
      )}
      {pageConfig.show_subject_grade && (homework.subject || homework.grade) && (
        <div
          className="mt-1 text-slate-500"
          style={{ fontSize: `${fontSizes.info * scale * 0.9}px` }}
        >
          学科：{homework.subject || "—"}   年级：{homework.grade || "—"}
        </div>
      )}
      {showDivider && <div className="mt-2 border-t border-slate-400" />}
    </div>
  )
}

/**
 * 渲染单个题目
 * 输入参数：item - 题目项；index - 题目序号；fontSize - 题目字号
 * 返回值：题目 ReactNode
 */
function renderQuestionItem(item: PaginationItem, index: number, fontSize: number) {
  return (
    <div key={item.hqId} className="mb-2">
      <div className="flex items-start gap-1.5">
        <span
          className="text-[13px] font-semibold text-slate-700 leading-tight shrink-0"
          style={{ minWidth: "1.4em", textAlign: "center" }}
        >
          {index + 1}.
        </span>
        <div
          className="flex-1 min-w-0 prose prose-sm max-w-none text-slate-800 leading-relaxed [&_.katex-display]:my-1 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_img]:max-w-full"
          style={{ fontSize: `${fontSize}px` }}
        >
          <PreviewRenderer content={item.question.stem || ""} />
          {item.question.options && Array.isArray(item.question.options) && item.question.options.length > 0 && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 not-prose">
              {((item.question.options as unknown[]) || []).map((opt, idx) => {
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
                  <div key={idx} className="flex items-start gap-1 min-w-0">
                    <span className="font-medium text-slate-500 shrink-0">{label}.</span>
                    <span className="flex-1 min-w-0 break-words">{content}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {/* 留白行 */}
      {item.blankLines > 0 && (
        <div className="pl-6 space-y-2 mt-1">
          {Array.from({ length: item.blankLines }).map((_, i) => (
            <div key={i} className="border-b border-slate-300 h-4" />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PaginationPreview({
  paperSize,
  pageConfig,
  homework,
  items,
  fontSizes,
  scale,
  previewWidth,
  previewMinHeight,
}: PaginationPreviewProps) {
  // A3 双列 / A4 单列 视觉参数（与 PaperPreview 保持一致）
  const isA3 = paperSize === "A3"
  const marginL = isA3 ? 18 : 15
  const marginR = isA3 ? 18 : 15
  const marginT = isA3 ? 22 : 20
  const marginB = isA3 ? 18 : 15

  // 计算分页
  const pages = useMemo(() => {
    return paginateQuestions({
      items,
      paperSize,
      questionFontSize: fontSizes.question,
      titleFontSize: fontSizes.title,
      infoFontSize: fontSizes.info,
      showNameClass: pageConfig.show_name_class !== false,
      showSubjectGrade: pageConfig.show_subject_grade ?? true,
      hasCover: !!(homework.title || homework.subject || homework.grade),
    })
  }, [items, paperSize, fontSizes.question, fontSizes.title, fontSizes.info, pageConfig.show_name_class, pageConfig.show_subject_grade, homework.title, homework.subject, homework.grade])

  return (
    <div className="flex flex-col items-center gap-6">
      {pages.map((page, pageIdx) => {
        // 计算该页是否有封面
        const hasCover = pageIdx === 0 && (homework.title || homework.subject || homework.grade)
        // 全局题目序号：在所有页上累加
        let questionNo = 0
        for (let i = 0; i < pageIdx; i++) {
          for (const col of pages[i].columns) {
            questionNo += col.length
          }
        }
        return (
          <div
            key={pageIdx}
            className="relative bg-white shadow-2xl border border-slate-200"
            data-pdf-export-target=""
            style={{
              width: `${previewWidth}px`,
              minHeight: `${previewMinHeight}px`,
              padding: `${marginT * 3.78 * scale}px ${marginR * 3.78 * scale}px ${marginB * 3.78 * scale}px ${marginL * 3.78 * scale}px`,
            }}
          >
            {/* 水印 */}
            {renderWatermarkGrid(pageConfig, fontSizes.watermark, scale)}

            {/* 需求（图层化）：第一页支持 title_box 独立定位
               - 配置了 title_box：按 title_box 的 (x, y, width, height) 绝对定位
               - 未配置 title_box：使用居中标题布局（向下兼容） */}
            {pageIdx === 0 && homework.title && pageConfig.title_box && pageConfig.title_box.show !== false && (
              <div
                className="absolute flex flex-col items-center justify-center text-center overflow-hidden"
                style={{
                  left: `${pageConfig.title_box.x}px`,
                  top: `${pageConfig.title_box.y}px`,
                  width: `${pageConfig.title_box.width}px`,
                  height: `${pageConfig.title_box.height}px`,
                }}
              >
                <div
                  className="font-bold text-slate-900 leading-tight"
                  style={{ fontSize: `${fontSizes.title * scale}px`, lineHeight: 1.4 }}
                >
                  {homework.title}
                </div>
                {homework.subject && (
                  <div
                    className="mt-0.5 text-slate-500"
                    style={{ fontSize: `${fontSizes.info * scale * 0.8}px` }}
                  >
                    {homework.subject} · {homework.grade}
                  </div>
                )}
              </div>
            )}

            {/* 标题区（仅首页）
               - 当 title_box 已配置且显示时：只渲染下方的辅助信息行（学科年级/姓名班级/分隔线）
               - 当 title_box 未配置时：渲染完整封面（标题+信息行+分隔线） */}
            {hasCover && (
              pageConfig.title_box && pageConfig.title_box.show !== false
                ? (pageIdx === 0 && (
                    <div className="relative text-center mt-3">
                      {(homework.subject || homework.grade) && (
                        <div
                          className="mt-1 text-slate-500 flex items-center justify-center gap-3"
                          style={{ fontSize: `${fontSizes.info * scale}px` }}
                        >
                          {homework.subject && <span>学科：{homework.subject}</span>}
                          {homework.grade && <span>年级：{homework.grade}</span>}
                        </div>
                      )}
                      {pageConfig.show_name_class !== false && (
                        <div
                          className="mt-1 text-slate-500"
                          style={{ fontSize: `${fontSizes.info * scale}px` }}
                        >
                          姓名：__________   班级：__________   得分：__________
                        </div>
                      )}
                      {pageConfig.show_subject_grade && (homework.subject || homework.grade) && (
                        <div
                          className="mt-1 text-slate-500"
                          style={{ fontSize: `${fontSizes.info * scale * 0.9}px` }}
                        >
                          学科：{homework.subject || "—"}   年级：{homework.grade || "—"}
                        </div>
                      )}
                      <div className="mt-2 border-t border-slate-400" />
                    </div>
                  ))
                : renderCoverArea(homework, pageConfig, fontSizes, scale, true)
            )}

            {/* 题目区：双列用 flex，单列用单列 */}
            {isA3 ? (
              <div className="flex gap-3">
                {page.columns.map((col, colIdx) => (
                  <div key={colIdx} className={cn("flex-1 min-w-0", colIdx === 1 && "border-l border-slate-200 pl-3")}>
                    {col.length === 0 ? (
                      <div className="text-center text-slate-300 text-xs py-8">（本页无题目）</div>
                    ) : (
                      col.map((it) => {
                        questionNo += 1
                        return renderQuestionItem(it, questionNo - 1, fontSizes.question * scale)
                      })
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {page.columns[0].length === 0 ? (
                  <div className="text-center text-slate-300 text-xs py-8">（本页无题目）</div>
                ) : (
                  page.columns[0].map((it) => {
                    questionNo += 1
                    return renderQuestionItem(it, questionNo - 1, fontSizes.question * scale)
                  })
                )}
              </div>
            )}

            {/* 页码标签：右下角 */}
            <div
              className="absolute bottom-1 right-2 text-slate-300 text-[10px] select-none"
              style={{ fontSize: `${fontSizes.info * scale * 0.7}px` }}
            >
              第 {page.pageIndex} 页 / 共 {pages.length} 页
            </div>
          </div>
        )
      })}
    </div>
  )
}
