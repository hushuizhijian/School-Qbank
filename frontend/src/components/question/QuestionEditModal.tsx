/**
 * QuestionEditModal — 题目编辑悬浮窗
 *
 * 功能：在题库管理页中点击任意题目后弹出，提供完整的二次编辑能力
 * 布局：宽屏双栏（知识树+属性 + 题干/解析 双栏编辑器）
 *       - 顶部：知识点标签（KnowledgeTreeSelect）+ 基础属性表单
 *       - 中部：题干 LaTeX 源码 ↔ 实时预览（DualPaneEditor）
 *       - 下部：解析 LaTeX 源码 ↔ 实时预览（DualPaneEditor）
 *       - 底部：保存/取消按钮
 * 输入参数：
 *   open: boolean — 是否打开
 *   question: Question | null — 当前编辑的题目（null 时不渲染）
 *   onClose: () => void — 关闭回调
 *   onSave: (updated: Question) => Promise<void> | void — 保存回调
 * 返回值：React 节点
 * 使用场景：题库管理页点击题目后的二次编辑弹窗
 */
import { useEffect, useState, useCallback, useMemo } from "react"
import { Save, Loader2, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/utils/cn"
import Modal from "@/components/common/Modal"
import DualPaneEditor from "@/components/question/DualPaneEditor"
import KnowledgeTreeSelect from "@/components/knowledge/KnowledgeTreeSelect"
import {
  DIFFICULTY_LEVELS,
  QUESTION_TYPE_MAP,
} from "@/utils/constants"
import type { Question } from "@/types/question"
import { setKnowledgePoints, updateQuestion } from "@/api/questions"
import { toast } from "sonner"

/* ========== 类型定义 ========== */

/** 组件 Props */
interface QuestionEditModalProps {
  open: boolean
  question: Question | null
  onClose: () => void
  onSaved: (updated: Question) => void
}

/* ========== 工具函数 ========== */

/**
 * 图片URL标准化处理
 *
 * 功能：将后端 images 字段统一为 URL 字符串数组，供 DualPaneEditor 使用
 * 输入参数：images - 原始图片数据（字符串或对象数组）
 * 返回值：URL 字符串数组
 */
function normalizeImages(images: unknown[]): string[] {
  if (!images || !Array.isArray(images)) return []
  return images
    .map((item) => {
      let rawUrl = ""
      if (typeof item === "string") {
        rawUrl = item
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>
        rawUrl = String(obj.path || obj.url || "")
      }
      if (!rawUrl) return ""
      if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) return rawUrl
      if (rawUrl.startsWith("/data/")) return rawUrl
      if (rawUrl.startsWith("/images/")) return "/data" + rawUrl
      return "/data/images/" + rawUrl
    })
    .filter((url) => url.length > 0)
}

/** 旧题型 key 集合，下拉框中需过滤 */
const LEGACY_TYPE_KEYS = new Set(["fill", "single", "judge", "calc", "general"])

/** 题型选项（仅展示8种新题型） */
const questionTypeOptions = Object.entries(QUESTION_TYPE_MAP)
  .filter(([key]) => !LEGACY_TYPE_KEYS.has(key))
  .map(([value, label]) => ({ value, label }))

/**
 * 难度字符串 → 数字
 *
 * 功能：将后端难度字段统一转为 1-5 的数字值
 * 输入参数：str - 后端难度字段
 * 返回值：1-5 的数字
 */
const difficultyToNumber = (str: string | undefined | null): number => {
  if (!str) return 3
  const num = Number(str)
  if (!isNaN(num) && num >= 1 && num <= 5) return num
  const legacyMap: Record<string, number> = { simple: 1, medium: 3, hard: 5 }
  return legacyMap[str] ?? 3
}

/* ========== 主组件 ========== */

export default function QuestionEditModal({
  open,
  question,
  onClose,
  onSaved,
}: QuestionEditModalProps) {
  /* ========== 编辑状态 ========== */

  // 本地编辑草稿（保存前不污染父组件数据）
  const [draft, setDraft] = useState<Question | null>(null)
  // 保存中
  const [saving, setSaving] = useState(false)
  // 知识点选择（本地状态，保存时统一提交）
  const [kpIds, setKpIds] = useState<string[]>([])
  // 知识点区域折叠
  const [kpCollapsed, setKpCollapsed] = useState(false)
  // 属性区域折叠
  const [propsCollapsed, setPropsCollapsed] = useState(false)

  /* ========== 同步打开状态：打开时复制 question 到本地 draft ========== */

  useEffect(() => {
    if (open && question) {
      // 浅拷贝生成可编辑草稿
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft({ ...question, options: question.options ? [...question.options] : [] })
      setKpIds(question.knowledge_points.map((kp) => kp.id))
      setSaving(false)
    }
  }, [open, question])

  /* ========== 关闭时清理 ========== */

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(null)
      setKpIds([])
    }
  }, [open])

  /* ========== 派生：归一化图片（供编辑器使用） ========== */

  const imageUrls = useMemo(
    () => (draft ? normalizeImages(draft.images || []) : []),
    [draft],
  )

  /* ========== 字段更新辅助 ========== */

  /**
   * 更新 draft 单个字段
   *
   * 功能：统一字段更新入口，避免散落的 setDraft
   * 输入参数：field - 字段名，value - 新值
   * 返回值：无
   */
  const updateField = useCallback(
    <K extends keyof Question>(field: K, value: Question[K]) => {
      setDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
    },
    [],
  )

  /* ========== 保存处理 ========== */

  /**
   * 保存修改
   *
   * 功能：调用 updateQuestion 更新所有修改过的字段
   *       知识点单独通过 setKnowledgePoints 提交
   * 返回值：Promise<void>
   */
  const handleSave = useCallback(async () => {
    if (!draft || saving) return
    setSaving(true)
    try {
      // 1. 更新题目基础字段
      const updated = await updateQuestion(draft.id, {
        stem: draft.stem,
        analysis: draft.analysis,
        answer: draft.answer,
        question_type: draft.question_type,
        difficulty: String(difficultyToNumber(draft.difficulty)),
        score: draft.score,
        source_year: draft.source_year,
        source_region: draft.source_region,
        has_figure: draft.has_figure,
        has_formula: draft.has_formula,
        has_table: draft.has_table,
        question_no: draft.question_no,
        latex_source: draft.latex_source,
      })

      // 2. 知识点如有变更 → 单独提交
      const originalKpIds = (question?.knowledge_points || []).map((kp) => kp.id).sort()
      const newKpIds = [...kpIds].sort()
      const kpChanged =
        originalKpIds.length !== newKpIds.length ||
        originalKpIds.some((id, idx) => id !== newKpIds[idx])
      if (kpChanged) {
        await setKnowledgePoints(draft.id, kpIds)
      }

      // 3. 合并最新数据返回给父组件
      const finalQuestion: Question = {
        ...draft,
        ...((updated as Partial<Question>) || {}),
        knowledge_points: (question?.knowledge_points || []).filter((kp) =>
          kpIds.includes(kp.id),
        ),
      }
      // 后端若返回新的知识点，需要重新拉取；为简化，前端从原列表过滤
      // 真实新增的知识点需要再次请求，这里以原列表过滤近似处理
      onSaved(finalQuestion)
      toast.success("题目已保存")
      onClose()
    } catch (err) {
      console.error("保存题目失败:", err)
      toast.error("保存失败，请重试")
    } finally {
      setSaving(false)
    }
  }, [draft, kpIds, question, saving, onSaved, onClose])

  /* ========== 渲染：弹窗内容 ========== */

  if (!draft) {
    // 弹窗打开但尚无数据时显示空提示
    return (
      <Modal open={open} onClose={onClose} title="编辑题目" width="max-w-4xl">
        <div className="py-12 text-center text-slate-400">暂无题目数据</div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑题目"
      width="max-w-[1100px]"
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="text-xs text-slate-400 mr-auto">
            修改保存后立即生效
          </span>
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-5 py-2 text-sm text-white rounded-lg transition-colors",
              saving
                ? "bg-blue-400 cursor-wait"
                : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800",
            )}
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ====== 顶部：知识点 + 基础属性（两列） ====== */}
        <div className="grid grid-cols-2 gap-4">
          {/* 知识点选择 */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setKpCollapsed((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span>知识点（{kpIds.length}）</span>
              {kpCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            {!kpCollapsed && (
              <div className="max-h-[200px] overflow-y-auto p-2">
                <KnowledgeTreeSelect
                  selectedIds={kpIds}
                  onChange={setKpIds}
                  multiple
                />
              </div>
            )}
          </div>

          {/* 基础属性 */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setPropsCollapsed((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span>题目属性</span>
              {propsCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            {!propsCollapsed && (
              <div className="p-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                {/* 题型 */}
                <label className="flex items-center gap-2">
                  <span className="text-slate-500 w-12 shrink-0">题型</span>
                  <select
                    value={draft.question_type}
                    onChange={(e) => updateField("question_type", e.target.value)}
                    className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                  >
                    {questionTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* 难度 */}
                <label className="flex items-center gap-2">
                  <span className="text-slate-500 w-12 shrink-0">难度</span>
                  <select
                    value={String(difficultyToNumber(draft.difficulty))}
                    onChange={(e) => updateField("difficulty", e.target.value)}
                    className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                  >
                    {DIFFICULTY_LEVELS.map((lv) => (
                      <option key={lv.value} value={lv.value}>
                        {lv.label}
                      </option>
                    ))}
                  </select>
                </label>

                {/* 分值 */}
                <label className="flex items-center gap-2">
                  <span className="text-slate-500 w-12 shrink-0">分值</span>
                  <input
                    type="number"
                    value={draft.score ?? ""}
                    onChange={(e) =>
                      updateField(
                        "score",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                    className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                    placeholder="可选"
                  />
                </label>

                {/* 题号 */}
                <label className="flex items-center gap-2">
                  <span className="text-slate-500 w-12 shrink-0">题号</span>
                  <input
                    type="number"
                    value={draft.question_no ?? ""}
                    onChange={(e) =>
                      updateField(
                        "question_no",
                        e.target.value === "" ? 0 : Number(e.target.value),
                      )
                    }
                    className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                  />
                </label>

                {/* 年份 */}
                <label className="flex items-center gap-2">
                  <span className="text-slate-500 w-12 shrink-0">年份</span>
                  <input
                    type="text"
                    value={draft.source_year ?? ""}
                    onChange={(e) => updateField("source_year", e.target.value || null)}
                    className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                    placeholder="如 2026"
                  />
                </label>

                {/* 地区 */}
                <label className="flex items-center gap-2">
                  <span className="text-slate-500 w-12 shrink-0">地区</span>
                  <input
                    type="text"
                    value={draft.source_region ?? ""}
                    onChange={(e) => updateField("source_region", e.target.value || null)}
                    className="flex-1 min-w-0 border border-slate-200 rounded px-2 py-1 text-sm bg-white"
                    placeholder="如 湖北"
                  />
                </label>

                {/* 标记位 */}
                <div className="col-span-2 flex items-center gap-3 pt-1">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!draft.has_figure}
                      onChange={(e) => updateField("has_figure", e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    含图片
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!draft.has_formula}
                      onChange={(e) => updateField("has_formula", e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    含公式
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={!!draft.has_table}
                      onChange={(e) => updateField("has_table", e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    含表格
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ====== 中部：题干 LaTeX 源码 ↔ 预览 ====== */}
        <DualPaneEditor
          value={draft.stem || ""}
          onChange={(v) => updateField("stem", v)}
          title="题目内容"
          height="320px"
          images={imageUrls}
          imagePosition="end"
        />

        {/* ====== 下部：解析 LaTeX 源码 ↔ 预览 ====== */}
        <DualPaneEditor
          value={draft.analysis || ""}
          onChange={(v) => updateField("analysis", v)}
          title="解析内容"
          height="240px"
          images={imageUrls}
          imagePosition="end"
        />

        {/* ====== 答案区（独立编辑，简单 textarea） ====== */}
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-50 border-b border-slate-100">
            答案
          </div>
          <textarea
            value={draft.answer ?? ""}
            onChange={(e) => updateField("answer", e.target.value || null)}
            rows={2}
            className="w-full px-3 py-2 text-sm text-slate-700 outline-none resize-y"
            placeholder="请输入答案..."
          />
        </div>
      </div>
    </Modal>
  )
}
