/**
 * 属性编辑面板组件
 *
 * 功能：校对工作台中栏的属性编辑面板，支持编辑题型、难度(AI/用户双框 0.1~1.0)、分值、知识点(搜索+AI智能创建)、题图管理、AI操作等
 * 输入参数：
 *   - question: Question | null — 当前题目
 *   - onUpdateField: (field: string, value: unknown) => void — 更新字段回调
 *   - onToggleBank: () => void — 切换入库状态回调
 *   - onKnowledgeChange: (items: KnowledgePointItem[]) => void — 知识点变更回调
 *   - onAiAction?: (action: string) => void — AI操作回调（可选）
 *   - onBatchBankImport?: (ids: string[]) => void — 批量入库回调（可选）
 *   - onDeleteQuestion?: () => void — 删除题目回调（可选）
 *   - selectedIds?: string[] — 当前选中的题目ID列表（可选）
 *   - paperSubject?: string — 试卷学科（默认"数学"），用于智能创建时挂到正确学科
 *   - aiSelection?: { providerKey, instanceName, modelKey } — AI 供应商选择
 * 返回值：React 组件
 * 使用场景：校对工作台中栏，选中题目后展示属性编辑区
 */

import { useState, useMemo } from "react"
import { cn } from "@/utils/cn"
import { QUESTION_TYPE_MAP } from "@/utils/constants"
import type { Question, KnowledgePointItem } from "@/types/question"
import KnowledgePointPicker, { type AiSelection } from "@/components/knowledge/KnowledgePointPicker"
import ImageManagerPanel from "@/components/question/ImageManagerPanel"
import type { QuestionImage } from "@/components/question/ImageManagerPanel"
import { Database, Trash2, ClipboardList } from "lucide-react"

/* ========== 类型定义 ========== */

/** 属性编辑面板 Props */
interface AttributePanelProps {
  question: Question | null                                             // 当前题目
  onUpdateField: (field: string, value: unknown) => void               // 更新字段回调
  onToggleBank: () => void                                             // 切换入库状态回调
  onKnowledgeChange: (items: KnowledgePointItem[]) => void               // 知识点变更回调（传入完整对象列表）
  onBatchBankImport?: (ids: string[]) => void                          // 批量入库回调（可选）
  onDeleteQuestion?: () => void                                        // 删除题目回调（可选）
  selectedIds?: string[]                                               // 当前选中的题目ID列表（可选）
  paperSubject?: string                                                // 试卷学科（默认"数学"）
  aiSelection?: AiSelection                                            // AI 供应商/模型选择
}

/* ========== 常量 ========== */

/** 旧题型 key 集合（合并到新 6 类，下拉框中需隐藏） */
const LEGACY_TYPE_KEYS = new Set([
  // 合并到 choice
  "single_choice", "multi_choice", "single",
  // 合并到 fill_blank
  "fill",
  // 合并到 true_false
  "judge",
  // 合并到 calculation
  "calc",
  // 合并到 operation
  "operate",
  // 合并到 application
  "solution", "general",
])

/** 题型选项列表 — 仅展示 6 种新题型（顺序：选择/填空/判断/计算/操作/解决问题） */
const questionTypeOptions = Object.entries(QUESTION_TYPE_MAP)
  .filter(([key]) => !LEGACY_TYPE_KEYS.has(key)) // 过滤合并到新 key 的旧 key
  .map(([value, label]) => ({ value, label }))   // 转为 { value, label } 格式

/* ========== 工具函数 ========== */

/**
 * 根据分数获取难度配色（0.1~1.0）
 * 功能：根据 0.1~1.0 的难度分数返回对应色阶
 * 输入参数：score — 难度分数 0.1~1.0
 * 返回值：{ bg, text, bar } 颜色配置
 */
const getScoreColors = (score: number | null | undefined) => {
  const s = score ?? 0.5                                              // 默认 0.5
  if (s <= 0.3) return { bar: "bg-green-500", text: "text-green-700" }
  if (s <= 0.5) return { bar: "bg-lime-500", text: "text-lime-700" }
  if (s <= 0.7) return { bar: "bg-yellow-500", text: "text-yellow-700" }
  if (s <= 0.9) return { bar: "bg-orange-500", text: "text-orange-700" }
  return { bar: "bg-red-500", text: "text-red-700" }
}

/**
 * 题目 images 字段转换为 QuestionImage[]
 * 功能：将 Question.images 转为 ImageManagerPanel 所需格式
 *       兼容两种后端格式：
 *       - string[]: 纯URL字符串数组
 *       - {path, type}[]: 对象格式（后端 _extract_question_images 产出）
 * 输入参数：images — 图片数据（字符串数组或对象数组）
 * 返回值：QuestionImage 数组
 */
const toQuestionImages = (images: unknown[]): QuestionImage[] => {
  if (!images || !Array.isArray(images)) return []
  return images.reduce<QuestionImage[]>((acc, item, index) => {
    if (typeof item === "string") {
      acc.push({
        id: `img_${index}_${item.slice(-8)}`,
        url: item,
        sort_order: index,
      })
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>
      const url = String(obj.path || obj.url || "")
      if (url) {
        acc.push({
          id: `img_${index}_${url.slice(-8)}`,
          url,
          sort_order: index,
        })
      }
    }
    return acc
  }, [])
}

/**
 * QuestionImage[] 转换回 string[]
 * 功能：将 ImageManagerPanel 输出的图片列表转回 URL 字符串数组
 * 输入参数：questionImages — QuestionImage 数组
 * 返回值：URL 字符串数组
 */
const toStringImages = (questionImages: QuestionImage[]): string[] => {
  return questionImages.map((img) => img.url)                          // 提取URL
}

/* ========== 子组件：难度输入框（AI/用户 双框） ========== */

/**
 * 难度输入框（双框）
 *
 * 功能：左侧展示 AI 自动打的难度（只读）；右侧让用户手动打难度（可编辑 0.1~1.0）
 * 输入参数：aiScore（AI 难度分）、userScore（用户难度分）、onUserChange（用户输入变更）
 * 返回值：React 节点
 */
function DifficultyInputRow({
  aiScore,
  userScore,
  onUserChange,
}: {
  aiScore: number | null                                               // AI 难度分
  userScore: number | null                                             // 用户难度分
  onUserChange: (val: number | null) => void                           // 用户输入变更
}) {
  /* ========== 用户输入本地状态（用于受控输入） ========== */
  const [userInput, setUserInput] = useState<string>(
    userScore != null ? String(userScore) : ""                          // 初始化为当前分
  )

  /* ========== 颜色配置 ========== */
  const aiColors = getScoreColors(aiScore)
  const userColors = getScoreColors(
    userInput && !isNaN(Number(userInput)) ? Number(userInput) : null
  )

  /* ========== 用户输入失焦时提交 ========== */
  const commitUserInput = () => {
    if (!userInput.trim()) {
      onUserChange(null)                                                // 空 → 清空
      return
    }
    const v = Number(userInput)
    if (isNaN(v)) {
      // 非法值 → 回退
      setUserInput(userScore != null ? String(userScore) : "")
      return
    }
    // 限制 0.1~1.0，保留 1 位小数
    const clamped = Math.round(Math.max(0.1, Math.min(1.0, v)) * 10) / 10
    setUserInput(String(clamped))
    onUserChange(clamped)
  }

  /* ========== 渲染 ========== */
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* 左框：AI 难度（只读） */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-slate-400">AI</span>
          <span className="text-[10px] text-slate-400">只读</span>
        </div>
        <div
          className={cn(
            "h-8 px-2 flex items-center justify-between rounded border bg-slate-50",
            "border-slate-200 cursor-not-allowed"
          )}
          title="AI 自动打的难度，不支持修改"
        >
          {aiScore != null ? (
            <>
              <span className={cn("text-sm font-semibold", aiColors.text)}>
                {aiScore.toFixed(1)}
              </span>
              <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", aiColors.bar)}
                  style={{ width: `${aiScore * 100}%` }}
                />
              </div>
            </>
          ) : (
            <span className="text-xs text-slate-400">未生成</span>
          )}
        </div>
      </div>

      {/* 右框：用户难度（可编辑） */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-[10px] text-slate-400">用户</span>
          <span className="text-[10px] text-slate-400">0.1~1.0</span>
        </div>
        <input
          type="number"
          min={0.1}
          max={1.0}
          step={0.1}
          value={userInput}
          placeholder="未打分"
          onChange={(e) => setUserInput(e.target.value)}                 // 受控输入
          onBlur={commitUserInput}                                       // 失焦提交
          onKeyDown={(e) => {
            if (e.key === "Enter") commitUserInput()                     // 回车提交
          }}
          className={cn(
            "w-full h-8 px-2 text-sm border border-slate-300 rounded",
            "focus:outline-none focus:ring-1 focus:ring-blue-400",
            userInput && !isNaN(Number(userInput)) ? userColors.text : "text-slate-400"
          )}
          title="手动打难度：0.1=最简单，1.0=最难"
        />
      </div>
    </div>
  )
}

/* ========== 主组件 ========== */

/**
 * 属性编辑面板
 *
 * 功能：展示和编辑当前选中题目的属性信息
 * 布局：题号+状态 → 题型 → 难度(AI/用户双框) → 知识点(搜索+标签) → 题图管理 → AI操作按钮
 */
export default function AttributePanel({
  question,
  onUpdateField,
  onToggleBank,
  onKnowledgeChange,
  onBatchBankImport,
  onDeleteQuestion,
  selectedIds,
  paperSubject,
  aiSelection,
}: AttributePanelProps) {
  /* ========== 题图列表转换 ========== */

  const questionImages = useMemo(
    () => question ? toQuestionImages(question.images) : [], // string[] → QuestionImage[]
    [question]
  )

  /* ========== 无题目时显示占位 ========== */

  if (!question) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        请选择一道题目
      </div>
    )
  }

  /* ========== 知识点对象列表（供 KnowledgePointPicker 显示） ========== */

  // 过滤掉 null/无 id 的脏数据；正常情况下后端已通过 _hydrate_knowledge_points
  // 把 ID 列表补全为 KnowledgePointItem 对象列表。
  const knowledgeItems = (question.knowledge_points || [])
    .filter((kp): kp is NonNullable<typeof kp> => kp != null)
    .filter((kp) => typeof (kp as { id?: string }).id === "string" && (kp as { id: string }).id.length > 0)

  /* ========== 题图变更处理 ========== */

  const handleImagesChange = (newImages: QuestionImage[]) => {
    onUpdateField("images", toStringImages(newImages)) // QuestionImage[] → string[]
  }

  /* ========== 渲染 ========== */

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-700">属性编辑</h3>
      </div>

      <div className="flex-1 px-4 py-3 space-y-4">
        {/* 题号 + 入库状态 */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">
            第 {question.question_no} 题
          </span>
          {question.in_bank && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium
                             bg-emerald-50 text-emerald-600 rounded-full">
              <Database size={10} />已入库
            </span>
          )}
        </div>

        {/* 题型下拉 — 仅展示 6 种新题型（选择/填空/判断/计算/操作/解决问题） */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">题型</label>
          <select
            value={question.question_type}
            onChange={(e) => onUpdateField("question_type", e.target.value)} // 题型变更
            className="w-full h-8 px-2 text-sm border border-slate-300 rounded
                       bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {questionTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 难度：AI / 用户双框（0.1~1.0 小数） */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">难度（0.1~1.0）</label>
          <DifficultyInputRow
            key={`${question.id}-${question.user_difficulty ?? "none"}`}  // 外部值变化时重新挂载
            aiScore={question.ai_difficulty}
            userScore={question.user_difficulty}
            onUserChange={(val) => onUpdateField("user_difficulty", val)} // 用户难度变更
          />
        </div>

        {/* 知识点：搜索 + 展示框（同一列上下排布） */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">知识点（最多 3 个）</label>
          <KnowledgePointPicker
            selectedItems={knowledgeItems}
            onChange={onKnowledgeChange}                                 // 知识点变更
            subject={paperSubject || "数学"}                              // 学科
            aiSelection={aiSelection}                                    // AI 供应商
          />
          {/* 未选择知识点时显示警告 */}
          {knowledgeItems.length === 0 && (
            <div className="mt-2 bg-yellow-50 border border-yellow-200 text-yellow-700
                            text-xs px-3 py-2 rounded">
              ⚠️ 请至少添加一个知识点后再入库
            </div>
          )}
        </div>

        {/* 题图管理面板 */}
        {question && (
          <ImageManagerPanel
            questionId={question.id}
            images={questionImages}
            onImagesChange={handleImagesChange}                          // 题图变更
            layoutMode="auto"
          />
        )}
      </div>

      {/* 底部AI操作按钮区 — 3行2列布局 */}
      <div className="px-4 py-3 border-t border-slate-200 space-y-2">
        {/* 第1行：批量入库 + 保存入库 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              if (onBatchBankImport && selectedIds && selectedIds.length > 0) {
                onBatchBankImport(selectedIds) // 批量入库已选中
              }
            }}
            disabled={!onBatchBankImport || !selectedIds || selectedIds.length === 0} // 无选中时禁用
            className={cn(
              "flex items-center justify-center gap-1 py-2 text-xs font-medium rounded transition-colors",
              selectedIds && selectedIds.length > 0
                ? "bg-blue-500 text-white hover:bg-blue-600" // 有选中：蓝色可用
                : "bg-slate-100 text-slate-300 cursor-not-allowed" // 无选中：灰色禁用
            )}
          >
            <input
              type="checkbox"
              checked={selectedIds && selectedIds.length > 0}
              readOnly // 只读，点击按钮触发
              className="w-3 h-3 accent-blue-500"
            />
            批量入库已选中
          </button>
          <button
            onClick={onToggleBank} // 保存入库
            className={cn(
              "flex items-center justify-center gap-1 py-2 text-xs font-medium rounded transition-colors",
              question.in_bank
                ? "bg-slate-100 text-slate-500 hover:bg-slate-200" // 已入库：灰色"取消入库"
                : "bg-blue-500 text-white hover:bg-blue-600" // 未入库：蓝色"保存入库"
            )}
          >
            💾 {question.in_bank ? "取消入库" : "保存入库"}
          </button>
        </div>

        {/* 第2行：加入组卷篮 + 删除题目 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled // 组卷篮暂未实现
            className="flex items-center justify-center gap-1 py-2 text-xs font-medium rounded
                       bg-slate-100 text-slate-300 cursor-not-allowed transition-colors"
          >
            <ClipboardList size={14} />加入组卷篮
          </button>
          <button
            onClick={onDeleteQuestion} // 删除题目
            disabled={!onDeleteQuestion} // 无回调时禁用
            className={cn(
              "flex items-center justify-center gap-1 py-2 text-xs font-medium rounded transition-colors",
              onDeleteQuestion
                ? "bg-red-50 text-red-600 hover:bg-red-100" // 有回调：红色可用
                : "bg-slate-100 text-slate-300 cursor-not-allowed" // 无回调：灰色禁用
            )}
          >
            <Trash2 size={14} />删除题目
          </button>
        </div>
      </div>
    </div>
  )
}
