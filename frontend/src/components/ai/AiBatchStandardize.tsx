/**
 * AI 批量标准化弹窗
 *
 * 功能：批量选择题目，勾选 AI 操作（题干标准化/匹配知识点/难度标注），
 *   逐题调用 AI 接口并展示进度，完成后汇总结果
 * 输入参数：open（是否打开）、onClose（关闭回调）、questionIds（题目ID列表）、
 *   onComplete（全部完成回调）、aiSelection（AI 供应商/实例/模型选择）
 * 返回值：React 组件
 * 使用场景：题库管理页面，批量对多道题目执行 AI 标准化操作
 */
import { useState, useEffect, useCallback } from "react"
import { Loader2, CheckCircle2, XCircle, Clock, Cpu } from "lucide-react"
import Modal from "@/components/common/Modal"
import { aiBatchStandardize } from "@/api/ai"
import type { AiProviderSelection } from "@/api/ai"
import { cn } from "@/utils/cn"

/* ========== Props 类型 ========== */

export interface AiBatchStandardizeProps {
  open: boolean // 是否打开
  onClose: () => void // 关闭回调
  questionIds: string[] // 要处理的题目ID列表
  onComplete: () => void // 全部完成回调
  /** AI 供应商/实例/模型选择 — 为空时按后端三级优先级回退 */
  aiSelection?: AiProviderSelection
}

/* ========== 操作选项配置 ========== */

/** 可选 AI 操作定义 */
const ACTION_OPTIONS: {
  key: string // 操作标识
  label: string // 中文标签
  description: string // 操作说明
}[] = [
  {
    key: "standardize_stem",
    label: "题干标准化",
    description: "统一题干格式、修正标点与排版",
  },
  {
    key: "match_knowledge",
    label: "匹配知识点",
    description: "自动匹配最相关的知识点编码",
  },
  {
    key: "auto_difficulty",
    label: "难度标注",
    description: "AI 评估题目难度等级",
  },
]

/* ========== 单题处理状态类型 ========== */

/** 每道题的处理状态 */
type ItemStatus = "pending" | "processing" | "success" | "error"

/** 单题处理结果 */
interface ItemResult {
  questionId: string // 题目ID
  index: number // 序号（从1开始）
  status: ItemStatus // 当前状态
  message?: string // 错误信息或结果摘要
}

/* ========== 阶段枚举 ========== */

/** 弹窗所处阶段 */
type Phase = "select" | "processing" | "done"

/* ========== 主组件 ========== */

export default function AiBatchStandardize({
  open,
  onClose,
  questionIds,
  onComplete,
  aiSelection,
}: AiBatchStandardizeProps) {
  /* ========== 状态 ========== */

  const [phase, setPhase] = useState<Phase>("select") // 当前阶段
  const [selectedActions, setSelectedActions] = useState<string[]>([]) // 已勾选操作
  const [results, setResults] = useState<ItemResult[]>([]) // 逐题处理结果
  const [currentIndex, setCurrentIndex] = useState(0) // 当前处理到的索引

  /* ========== 打开时重置状态 ========== */

  useEffect(() => {
    if (open) {
      setPhase("select") // 重置为选择阶段
      setSelectedActions([]) // 清空勾选
      setResults([]) // 清空结果
      setCurrentIndex(0) // 重置索引
    }
  }, [open])

  /* ========== 勾选操作切换 ========== */

  const toggleAction = (key: string) => {
    setSelectedActions((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key) // 取消勾选
        : [...prev, key] // 添加勾选
    )
  }

  /* ========== 开始批量处理 ========== */

  const handleStart = async () => {
    if (selectedActions.length === 0) return // 未勾选操作则跳过
    if (questionIds.length === 0) return // 无题目则跳过

    // 初始化每道题的状态为等待
    const initResults: ItemResult[] = questionIds.map((id, i) => ({
      questionId: id,
      index: i + 1,
      status: "pending",
    }))

    setResults(initResults) // 设置初始结果
    setPhase("processing") // 切换到处理阶段

    // 逐题调用批量接口
    for (let i = 0; i < questionIds.length; i++) {
      setCurrentIndex(i) // 更新当前索引

      // 标记当前题为处理中
      setResults((prev) =>
        prev.map((r, idx) =>
          idx === i ? { ...r, status: "processing" as ItemStatus } : r
        )
      )

      try {
        // 调用批量接口，单题 + 已选操作
        // 传入 aiSelection 使后端走用户指定的供应商/模型
        const res = await aiBatchStandardize(
          [questionIds[i]], // 单题ID
          selectedActions, // 已选操作列表
          aiSelection, // AI 供应商/实例/模型选择
        )

        // 根据返回结果更新状态
        const isSuccess = res?.success !== false // 接口未显式失败则视为成功
        const msg = res?.message || ""

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? {
                  ...r,
                  status: (isSuccess ? "success" : "error") as ItemStatus,
                  message: msg,
                }
              : r
          )
        )
      } catch (err) {
        // 捕获异常，标记为失败
        const errMsg =
          err instanceof Error ? err.message : "请求失败"

        setResults((prev) =>
          prev.map((r, idx) =>
            idx === i
              ? { ...r, status: "error" as ItemStatus, message: errMsg }
              : r
          )
        )
      }
    }

    // 全部处理完成
    setCurrentIndex(questionIds.length) // 索引指向末尾
    setPhase("done") // 切换到完成阶段
  }

  /* ========== 统计数据计算 ========== */

  const successCount = results.filter((r) => r.status === "success").length // 成功数
  const errorCount = results.filter((r) => r.status === "error").length // 失败数
  const totalCount = questionIds.length // 总数
  const progressPercent =
    totalCount > 0
      ? Math.round(
          ((results.filter((r) => r.status === "success" || r.status === "error")
            .length) /
            totalCount) *
            100
        )
      : 0 // 进度百分比

  /* ========== 关闭弹窗 ========== */

  const handleClose = () => {
    if (phase === "done") {
      onComplete() // 完成阶段触发回调
    }
    onClose() // 关闭弹窗
  }

  /* ========== 渲染：操作选择阶段 ========== */

  const renderSelectPhase = () => (
    <div className="space-y-4">
      {/* 提示文字 */}
      <p className="text-sm text-slate-500">
        选择要对 <span className="font-semibold text-slate-700">{totalCount}</span> 道题目执行的 AI 操作：
      </p>

      {/* 操作勾选列表 */}
      <div className="space-y-2">
        {ACTION_OPTIONS.map((opt) => {
          const checked = selectedActions.includes(opt.key) // 是否已勾选

          return (
            <label
              key={opt.key}
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                checked
                  ? "border-blue-300 bg-blue-50" // 勾选态：蓝色边框+浅蓝背景
                  : "border-slate-200 bg-white hover:border-slate-300" // 未勾选态：灰色边框
              )}
            >
              {/* 复选框 */}
              <input
                type="checkbox"
                checked={checked} // 勾选状态
                onChange={() => toggleAction(opt.key)} // 切换勾选
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />

              {/* 标签与说明 */}
              <div>
                <div className="text-sm font-medium text-slate-800">
                  {opt.label} {/* 操作名称 */}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {opt.description} {/* 操作说明 */}
                </div>
              </div>
            </label>
          )
        })}
      </div>
    </div>
  )

  /* ========== 渲染：状态图标 ========== */

  const renderStatusIcon = (status: ItemStatus) => {
    switch (status) {
      case "pending":
        return <Clock size={16} className="text-slate-400" /> // 等待图标
      case "processing":
        return <Loader2 size={16} className="animate-spin text-blue-500" /> // 处理中旋转
      case "success":
        return <CheckCircle2 size={16} className="text-green-500" /> // 成功图标
      case "error":
        return <XCircle size={16} className="text-red-500" /> // 失败图标
    }
  }

  /* ========== 渲染：处理中阶段 ========== */

  const renderProcessingPhase = () => (
    <div className="space-y-4">
      {/* 进度条区域 */}
      <div className="space-y-2">
        {/* 进度文字 */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">
            已完成 {successCount + errorCount} / {totalCount}
          </span>
          <span className="text-slate-500">{progressPercent}%</span>
        </div>

        {/* 进度条 */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }} // 动态宽度
          />
        </div>

        {/* 当前处理提示 */}
        {phase === "processing" && currentIndex < totalCount && (
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Cpu size={14} /> {/* 处理图标 */}
            <span>
              正在处理第 {currentIndex + 1} 题...
            </span>
          </div>
        )}
      </div>

      {/* 题目处理列表 */}
      <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {results.map((r) => (
          <div
            key={r.questionId}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            {/* 状态图标 */}
            {renderStatusIcon(r.status)}

            {/* 题号 */}
            <span className="text-slate-600 w-16 shrink-0">
              第 {r.index} 题
            </span>

            {/* 状态文字 */}
            <span
              className={cn(
                "flex-1 truncate",
                r.status === "success" && "text-green-600", // 成功绿色
                r.status === "error" && "text-red-600", // 失败红色
                r.status === "processing" && "text-blue-600", // 处理中蓝色
                r.status === "pending" && "text-slate-400" // 等待灰色
              )}
            >
              {r.status === "pending" && "等待处理"}
              {r.status === "processing" && "处理中..."}
              {r.status === "success" && "处理成功"}
              {r.status === "error" && (r.message || "处理失败")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  /* ========== 渲染：完成阶段 ========== */

  const renderDonePhase = () => (
    <div className="space-y-4">
      {/* 汇总统计 */}
      <div className="flex items-center justify-center gap-6 py-4">
        {/* 成功数 */}
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-green-600">
            {successCount}
          </span>
          <span className="text-xs text-slate-500 mt-1">成功</span>
        </div>

        {/* 分隔线 */}
        <div className="h-8 w-px bg-slate-200" />

        {/* 失败数 */}
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-red-600">
            {errorCount}
          </span>
          <span className="text-xs text-slate-500 mt-1">失败</span>
        </div>

        {/* 分隔线 */}
        <div className="h-8 w-px bg-slate-200" />

        {/* 总数 */}
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-slate-700">
            {totalCount}
          </span>
          <span className="text-xs text-slate-500 mt-1">总计</span>
        </div>
      </div>

      {/* 结果列表 */}
      <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {results.map((r) => (
          <div
            key={r.questionId}
            className="flex items-center gap-3 px-3 py-2 text-sm"
          >
            {/* 状态图标 */}
            {renderStatusIcon(r.status)}

            {/* 题号 */}
            <span className="text-slate-600 w-16 shrink-0">
              第 {r.index} 题
            </span>

            {/* 结果文字 */}
            <span
              className={cn(
                "flex-1 truncate",
                r.status === "success" && "text-green-600", // 成功绿色
                r.status === "error" && "text-red-600" // 失败红色
              )}
            >
              {r.status === "success" && "处理成功"}
              {r.status === "error" && (r.message || "处理失败")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  /* ========== 渲染：底部操作栏 ========== */

  const renderFooter = () => {
    // 选择阶段：开始按钮
    if (phase === "select") {
      return (
        <>
          <button
            onClick={onClose} // 取消关闭
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleStart} // 开始处理
            disabled={selectedActions.length === 0 || totalCount === 0} // 未勾选或无题目时禁用
            className={cn(
              "px-4 py-2 text-sm rounded-md transition-colors",
              selectedActions.length > 0 && totalCount > 0
                ? "bg-blue-600 text-white hover:bg-blue-700" // 可用：蓝色
                : "bg-slate-100 text-slate-400 cursor-not-allowed" // 禁用：灰色
            )}
          >
            开始批量处理
          </button>
        </>
      )
    }

    // 处理中阶段：无操作按钮
    if (phase === "processing") {
      return null
    }

    // 完成阶段：关闭按钮
    return (
      <button
        onClick={handleClose} // 关闭并触发回调
        className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
      >
        关闭
      </button>
    )
  }

  /* ========== 动态标题 ========== */

  const getTitle = () => {
    if (phase === "select") return "AI 批量标准化" // 选择阶段标题
    if (phase === "processing") return "批量处理中..." // 处理中标题
    return "批量处理完成" // 完成阶段标题
  }

  /* ========== 主渲染 ========== */

  return (
    <Modal
      open={open}
      onClose={phase === "processing" ? () => {} : handleClose} // 处理中禁止关闭
      title={getTitle()}
      width="max-w-xl"
      footer={renderFooter()}
    >
      {phase === "select" && renderSelectPhase()}
      {phase === "processing" && renderProcessingPhase()}
      {phase === "done" && renderDonePhase()}
    </Modal>
  )
}
