/**
 * 通用模态弹窗组件
 *
 * 功能：提供居中弹窗容器，支持遮罩关闭、ESC 关闭、进入/退出动画
 * 输入参数：open（是否打开）、onClose（关闭回调）、title（标题）、children（内容区）、
 *   footer（底部操作栏）、width（宽度）、showClose（是否显示关闭按钮）
 * 返回值：React 组件（通过 Portal 渲染到 body）
 * 使用场景：确认对话框、表单弹窗、详情查看等需要模态交互的场景
 */
import { useEffect, useState, useCallback, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/utils/cn"

/* ========== 类型定义 ========== */

/** Modal 组件 Props */
export interface ModalProps {
  open: boolean // 是否打开弹窗
  onClose: () => void // 关闭回调（允许undefined时由外部处理）
  title: string // 弹窗标题
  children: ReactNode // 内容区
  footer?: ReactNode // 底部操作栏（可选）
  width?: string // 宽度类名，默认 max-w-lg
  showClose?: boolean // 是否显示关闭按钮，默认 true
}

/* ========== 常量 ========== */

/** 动画时长（毫秒），与 CSS transition 保持一致 */
const ANIMATION_MS = 150

/* ========== 子组件：Overlay ========== */

/**
 * 遮罩层组件
 *
 * 功能：半透明黑色遮罩，点击触发关闭
 * 输入参数：visible（是否可见）、onClick（点击回调）
 * 返回值：React 节点
 */
function Overlay({
  visible,
  onClick,
}: {
  visible: boolean // 是否可见（用于动画控制）
  onClick: () => void // 点击遮罩回调
}) {
  return (
    <div
      onClick={onClick} // 点击遮罩关闭
      className={cn(
        "fixed inset-0 z-50 bg-black/50 transition-opacity duration-150",
        visible ? "opacity-100" : "opacity-0" // 淡入/淡出
      )}
    />
  )
}

/* ========== 子组件：CloseButton ========== */

/**
 * 关闭按钮组件
 *
 * 功能：右上角 X 按钮，点击触发关闭
 * 输入参数：onClick（点击回调）
 * 返回值：React 节点
 */
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick} // 点击关闭
      className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
      aria-label="关闭" // 无障碍标签
    >
      <X size={18} />
    </button>
  )
}

/* ========== 主组件 ========== */

/**
 * 通用模态弹窗
 *
 * 功能：居中弹窗 + 遮罩 + 标题栏 + 内容区 + 底部操作栏 + 进入/退出动画
 * 输入参数：详见 ModalProps
 * 返回值：React 组件（Portal 渲染）
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg", // 默认宽度
  showClose = true, // 默认显示关闭按钮
}: ModalProps) {
  /* ========== 状态 ========== */

  // 动画可见状态：true 时显示，false 时播放退出动画后卸载
  const [visible, setVisible] = useState(false)
  // 是否真正挂载到 DOM：控制退出动画完成后才卸载
  const [mounted, setMounted] = useState(false)

  /* ========== 打开动画控制 ========== */

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMounted(true) // 先挂载 DOM
      // 下一帧设置 visible，触发进入动画
      requestAnimationFrame(() => {
        setVisible(true)
      })
    } else if (mounted) {
      setVisible(false) // 触发退出动画
      // 等动画结束后卸载 DOM
      const timer = setTimeout(() => {
        setMounted(false)
      }, ANIMATION_MS)
      return () => clearTimeout(timer) // 清理定时器
    }
  }, [open, mounted]) // 依赖 open 和 mounted

  /* ========== ESC 键关闭 ========== */

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") { // ESC 键
        onClose() // 触发关闭
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown) // 监听键盘
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown) // 移除监听
    }
  }, [open, handleKeyDown])

  /* ========== 打开时锁定 body 滚动 ========== */

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden" // 禁止背景滚动
    }
    return () => {
      document.body.style.overflow = "" // 恢复滚动
    }
  }, [open])

  /* ========== 未挂载时不渲染 ========== */

  if (!mounted) return null

  /* ========== 渲染 ========== */

  return createPortal(
    <>
      {/* 遮罩层 */}
      <Overlay visible={visible} onClick={onClose} />

      {/* 弹窗容器 */}
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-150",
          visible
            ? "opacity-100 scale-100" // 进入状态
            : "opacity-0 scale-95" // 退出状态
        )}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose() // 点击容器空白区关闭
        }}
      >
        {/* 弹窗面板 */}
        <div
          className={cn(
            "relative bg-white rounded-xl shadow-xl w-full flex flex-col max-h-[85vh]",
            width // 动态宽度
          )}
          onClick={(e) => e.stopPropagation()} // 阻止点击穿透到遮罩
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            {/* 左侧标题 */}
            <h2 className="text-lg font-semibold text-slate-800 truncate">
              {title}
            </h2>

            {/* 右侧关闭按钮 */}
            {showClose && <CloseButton onClick={onClose} />}
          </div>

          {/* 内容区：可滚动 */}
          <div className="p-6 overflow-y-auto flex-1">
            {children}
          </div>

          {/* 底部操作栏（可选） */}
          {footer && (
            <div className="border-t border-slate-100 px-6 py-3 flex justify-end gap-2 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body // Portal 挂载到 body
  )
}
