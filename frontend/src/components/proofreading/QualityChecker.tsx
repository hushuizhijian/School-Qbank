/**
 * 入库质量检查组件
 *
 * 功能：右侧抽屉面板，自动检测四类质量问题（题干为空/答案缺失/知识点为空/题型未设置），
 *       以分类列表展示，支持点击跳转和一键修复题型
 * 输入参数：
 *   - open: boolean — 是否打开抽屉
 *   - onClose: () => void — 关闭回调
 *   - paperId: string — 试卷ID
 *   - questions: Question[] — 题目列表
 *   - onNavigate: (id: string) => void — 点击问题项跳转到对应题目
 *   - onFixApplied: () => void — 修复后刷新回调
 * 返回值：React 组件
 * 使用场景：校对工作台右侧质量检查面板
 */

import { useState, useMemo } from "react"
import { cn } from "@/utils/cn"
import { updateQuestion } from "@/api/questions"
import type { Question } from "@/types/question"
import { X, ChevronDown, ChevronRight, Wrench, AlertCircle } from "lucide-react"

/* ========== 类型定义 ========== */

/** 质量检查组件 Props */
interface QualityCheckerProps {
  open: boolean                                    // 是否打开抽屉
  onClose: () => void                              // 关闭回调
  paperId: string                                  // 试卷ID
  questions: Question[]                            // 题目列表
  onNavigate: (id: string) => void                 // 点击问题项跳转到对应题目
  onFixApplied: () => void                         // 修复后刷新回调
}

/** 问题项结构 */
interface IssueItem {
  id: string                                       // 题目ID
  questionNo: number                               // 题号
  stemPreview: string                              // 题干预览
}

/** 四类问题分类 */
interface IssueCategories {
  emptyStem: IssueItem[]                           // 题干为空
  missingAnswer: IssueItem[]                       // 答案缺失
  missingKp: IssueItem[]                           // 知识点为空
  missingType: IssueItem[]                         // 题型未设置
}

/** 问题分类配置：键、标签、图标颜色、emoji */
const ISSUE_CATEGORIES = [
  { key: "emptyStem" as const, label: "题干为空", color: "text-red-500", emoji: "🔴" },     // 红色-严重
  { key: "missingAnswer" as const, label: "答案缺失", color: "text-orange-500", emoji: "🟠" }, // 橙色-重要
  { key: "missingKp" as const, label: "知识点为空", color: "text-yellow-500", emoji: "🟡" },   // 黄色-提醒
  { key: "missingType" as const, label: "题型未设置", color: "text-blue-500", emoji: "🔵" },   // 蓝色-建议
] as const

/* ========== 工具函数：从 questions 数组计算质量问题 ========== */

/**
 * 计算质量问题分类
 *
 * 功能：遍历题目列表，检测四类质量问题并分类
 * 输入参数：questions — 题目数组
 * 返回值：IssueCategories 四类问题分类
 * 使用场景：组件内 useMemo 计算
 */
function computeIssues(questions: Question[]): IssueCategories {
  const categories: IssueCategories = {
    emptyStem: [],        // 题干为空列表
    missingAnswer: [],    // 答案缺失列表
    missingKp: [],        // 知识点为空列表
    missingType: [],      // 题型未设置列表
  }

  for (const q of questions) {
    // 构造问题项
    const item: IssueItem = {
      id: q.id,                                                   // 题目ID
      questionNo: q.question_no,                                  // 题号
      stemPreview: (q.stem || "").slice(0, 50),                   // 题干预览前50字
    }

    // 检查题干是否为空
    if (!q.stem || !q.stem.trim()) {
      categories.emptyStem.push(item)  // 加入题干为空
    }

    // 检查答案是否缺失
    if (!q.answer || !q.answer.trim()) {
      categories.missingAnswer.push(item)  // 加入答案缺失
    }

    // 检查知识点是否为空
    if (!q.knowledge_points || q.knowledge_points.length === 0) {
      categories.missingKp.push(item)  // 加入知识点为空
    }

    // 检查题型是否未设置（general 表示未设置）
    if (!q.question_type || q.question_type === "general") {
      categories.missingType.push(item)  // 加入题型未设置
    }
  }

  return categories
}

/* ========== 主组件 ========== */

/**
 * 入库质量检查抽屉面板
 *
 * 功能：右侧滑出抽屉，展示四类质量问题，支持跳转和一键修复
 * 布局：标题栏 → 问题分类列表（可折叠） → 底部操作栏
 */
export default function QualityChecker({
  open,
  onClose,
  paperId,
  questions,
  onNavigate,
  onFixApplied,
}: QualityCheckerProps) {
  /* ========== 状态 ========== */

  // 折叠状态：记录每个分类是否展开
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(ISSUE_CATEGORIES.map((c) => c.key))  // 默认全部展开
  )

  // 一键修复加载状态
  const [fixing, setFixing] = useState(false)  // 是否正在修复

  // 错误提示
  const [fixError, setFixError] = useState<string | null>(null)  // 修复错误信息

  /* ========== 计算质量问题 ========== */

  const issues = useMemo(() => computeIssues(questions), [questions])  // 依赖 questions 变化重新计算

  // 总问题数
  const totalIssues = useMemo(
    () => (ISSUE_CATEGORIES.reduce((sum, c) => sum + issues[c.key].length, 0)),  // 累加四类问题数
    [issues]
  )

  // 可修复数量（题型未设置的题目数）
  const fixableCount = issues.missingType.length  // 只有题型未设置可自动修复

  /* ========== 折叠切换 ========== */

  /**
   * 切换分类折叠状态
   *
   * 功能：点击分类标题时，展开/折叠该分类下的列表
   * 输入参数：key — 分类键名
   * 返回值：无
   */
  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)  // 复制当前集合
      if (next.has(key)) {
        next.delete(key)  // 已展开则折叠
      } else {
        next.add(key)  // 已折叠则展开
      }
      return next  // 返回新集合
    })
  }

  /* ========== 一键修复处理 ========== */

  /**
   * 一键设置默认题型
   *
   * 功能：将所有题型未设置（general）的题目批量修改为 fill_blank（填空）
   * 输入参数：无
   * 返回值：无
   */
  const handleAutoFix = async () => {
    setFixing(true)       // 开始修复
    setFixError(null)     // 清空错误

    try {
      // 逐题调用 API 修改题型
      const targets = issues.missingType  // 需要修复的题目列表
      for (const item of targets) {
        await updateQuestion(item.id, { question_type: "fill_blank" })  // 调用API设置题型为填空
      }

      // 修复完成，通知父组件刷新数据
      onFixApplied()  // 触发刷新回调
    } catch (err) {
      // 修复失败，显示错误提示
      setFixError(err instanceof Error ? err.message : "修复失败，请重试")  // 设置错误信息
    } finally {
      setFixing(false)  // 结束修复状态
    }
  }

  /* ========== 渲染 ========== */

  return (
    <>
      {/* 遮罩层：抽屉打开时显示半透明背景 */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"  // 打开时可见，关闭时隐藏
        )}
        onClick={onClose}  // 点击遮罩关闭
      />

      {/* 抽屉面板 */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-[360px] bg-white shadow-xl",
          "flex flex-col transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "translate-x-full"  // 打开时滑入，关闭时滑出
        )}
      >
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-slate-600" />  {/* 标题图标 */}
            <h3 className="text-sm font-semibold text-slate-700">质量检查</h3>
            {/* 总问题数 badge */}
            {totalIssues > 0 && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-600 rounded-full">
                {totalIssues}  {/* 问题总数 */}
              </span>
            )}
          </div>
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-200 transition-colors"
          >
            <X size={16} className="text-slate-500" />  {/* 关闭图标 */}
          </button>
        </div>

        {/* 内容区：四类问题分类列表 */}
        <div className="flex-1 overflow-y-auto">
          {/* 无问题时显示提示 */}
          {totalIssues === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <span className="text-3xl mb-2">✅</span>  {/* 通过图标 */}
              <p className="text-sm">所有题目质量检查通过</p>
            </div>
          ) : (
            /* 有问题时渲染分类列表 */
            <div className="py-2">
              {ISSUE_CATEGORIES.map((cat) => {
                const items = issues[cat.key]  // 该分类下的问题列表
                const isExpanded = expandedKeys.has(cat.key)  // 是否展开

                return (
                  <div key={cat.key} className="border-b border-slate-100">
                    {/* 分类标题行（可点击折叠） */}
                    <button
                      onClick={() => toggleExpand(cat.key)}  // 切换折叠
                      className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      {/* 折叠箭头 */}
                      {isExpanded ? (
                        <ChevronDown size={14} className="text-slate-400" />  // 展开箭头
                      ) : (
                        <ChevronRight size={14} className="text-slate-400" />  // 折叠箭头
                      )}
                      {/* emoji + 标签 */}
                      <span className="text-sm">{cat.emoji}</span>  {/* 分类emoji */}
                      <span className={cn("text-sm font-medium", cat.color)}>{cat.label}</span>  {/* 分类标签 */}
                      {/* 数量 badge */}
                      {items.length > 0 && (
                        <span className={cn(
                          "ml-auto px-1.5 py-0.5 text-xs font-medium rounded-full",
                          cat.key === "emptyStem" && "bg-red-100 text-red-600",       // 红色badge
                          cat.key === "missingAnswer" && "bg-orange-100 text-orange-600", // 橙色badge
                          cat.key === "missingKp" && "bg-yellow-100 text-yellow-600",     // 黄色badge
                          cat.key === "missingType" && "bg-blue-100 text-blue-600",       // 蓝色badge
                        )}>
                          {items.length}  {/* 该分类问题数 */}
                        </span>
                      )}
                    </button>

                    {/* 问题列表（展开时显示） */}
                    {isExpanded && items.length > 0 && (
                      <div className="pb-1">
                        {items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => onNavigate(item.id)}  // 点击跳转到对应题目
                            className="w-full text-left px-4 pl-10 py-2 hover:bg-blue-50 transition-colors group"
                          >
                            <div className="flex items-center gap-2">
                              {/* 题号 */}
                              <span className="text-xs font-medium text-slate-500 shrink-0">
                                第{item.questionNo}题  {/* 显示题号 */}
                              </span>
                              {/* 题干预览 */}
                              <span className="text-xs text-slate-400 truncate group-hover:text-blue-600 transition-colors">
                                {item.stemPreview || "（无题干内容）"}  {/* 题干预览或占位 */}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* 展开但无问题时显示提示 */}
                    {isExpanded && items.length === 0 && (
                      <div className="px-10 py-2 text-xs text-slate-300">
                        无此类问题  {/* 无问题提示 */}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 space-y-2">
          {/* 错误提示 */}
          {fixError && (
            <div className="px-3 py-2 text-xs text-red-600 bg-red-50 rounded">
              {fixError}  {/* 显示修复错误信息 */}
            </div>
          )}

          {/* 一键修复按钮 */}
          <button
            onClick={handleAutoFix}  // 点击修复
            disabled={fixing || fixableCount === 0}  // 修复中或无可修复项时禁用
            className={cn(
              "w-full flex items-center justify-center gap-2 py-2 text-sm font-medium rounded transition-colors",
              fixing || fixableCount === 0
                ? "bg-slate-100 text-slate-400 cursor-not-allowed"  // 禁用状态
                : "bg-blue-500 text-white hover:bg-blue-600"         // 可用状态
            )}
          >
            <Wrench size={14} />  {/* 修复图标 */}
            {fixing
              ? "修复中..."  // 修复中文字
              : `一键设置默认题型${fixableCount > 0 ? ` (${fixableCount}题)` : ""}`  // 修复按钮文字
            }
          </button>

          {/* 统计摘要 */}
          <div className="text-center text-xs text-slate-400">
            共 {questions.length} 题，{totalIssues} 个问题  {/* 统计信息 */}
          </div>
        </div>
      </div>
    </>
  )
}
