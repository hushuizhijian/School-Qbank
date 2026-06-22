/**
 * 入库检查组组件
 *
 * 功能：左侧面板第二区域的入库检查项，包含查看解析参数、待入库、入库前组题、
 *       知识点缺失、题图挂载异常等检查项，支持点击触发对应操作
 * 输入参数：
 *   - checks: 检查数据对象（canViewParams/pendingBankCount/canGroupBeforeBank/missingKnowledgeIds/figureMountIssues）
 *   - onCheckAction: (action: string, data?: unknown) => void — 点击检查项的回调
 * 返回值：React 组件
 * 使用场景：校对工作台左侧面板，入库质量检查区域
 */

import { cn } from "@/utils/cn"
import {
  CheckSquare,
  Eye,
  Inbox,
  Package,
  AlertTriangle,
  Image,
} from "lucide-react"

/* ========== 类型定义 ========== */

/** 检查数据结构 */
interface ChecksData {
  canViewParams: boolean                             // 是否可查看解析参数
  pendingBankCount: number                           // 待入库题目数量
  canGroupBeforeBank: boolean                        // 是否可入库前组题
  missingKnowledgeIds: string[]                      // 知识点缺失的题目ID列表
  figureMountIssues: string[]                        // 题图挂载异常的题目ID列表
}

/** 入库检查组 Props */
interface QualityCheckGroupProps {
  checks: ChecksData                                 // 检查数据
  onCheckAction: (action: string, data?: unknown) => void // 点击检查项回调
}

/* ========== 子组件：检查项按钮 ========== */

/**
 * 单个检查项按钮
 *
 * 功能：渲染一个可点击的检查项，支持普通和警告两种样式
 * 输入参数：icon/label/count/action/warning/onClick
 * 返回值：React 节点
 */
function CheckItem({
  Icon,
  label,
  count,
  action,
  warning = false,
  onClick,
}: {
  Icon: React.ComponentType<{ size?: number; className?: string }> // 图标组件
  label: string                                      // 检查项标签
  count?: number                                     // 数量（可选）
  action: string                                     // 触发的动作标识
  warning?: boolean                                  // 是否为警告样式
  onClick: (action: string) => void                  // 点击回调
}) {
  return (
    <button
      onClick={() => onClick(action)}                // 点击触发动作
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
        warning
          ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-100" // 警告：黄色背景
          : "text-slate-600 hover:bg-slate-50"                  // 普通：默认样式
      )}
    >
      <Icon size={14} className={warning ? "text-yellow-500" : "text-slate-400"} /> {/* 图标 */}
      <span className="flex-1 text-left">{label}</span>  {/* 标签文字 */}
      {count != null && count > 0 && (
        <span className={cn(
          "text-[11px] font-medium",
          warning ? "text-yellow-600" : "text-slate-400"  // 数量文字颜色
        )}>
          ({count}题)                                   // 显示数量
        </span>
      )}
    </button>
  )
}

/* ========== 主组件 ========== */

/**
 * 入库检查组
 *
 * 功能：展示入库相关的检查项列表，根据数据条件动态显示
 * 布局：标题栏 → 检查项列表
 */
export default function QualityCheckGroup({
  checks,
  onCheckAction,
}: QualityCheckGroupProps) {
  /* ========== 渲染 ========== */

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
        <CheckSquare size={14} className="text-slate-500" />  {/* 标题图标 */}
        <span className="text-xs font-semibold text-slate-700">入库检查</span>
      </div>

      {/* 检查项列表 */}
      <div className="divide-y divide-slate-100">
        {/* 查看解析参数：仅在可查看时显示 */}
        {checks.canViewParams && (
          <CheckItem
            Icon={Eye}
            label="查看解析参数"
            action="view_params"
            onClick={onCheckAction}                    // 点击查看解析参数
          />
        )}

        {/* 待入库：仅在有待入库题目时显示 */}
        {checks.pendingBankCount > 0 && (
          <CheckItem
            Icon={Inbox}
            label="待入库"
            count={checks.pendingBankCount}            // 待入库数量
            action="pending_bank"
            onClick={onCheckAction}                    // 点击查看待入库
          />
        )}

        {/* 入库前组题：仅在可组题时显示 */}
        {checks.canGroupBeforeBank && (
          <CheckItem
            Icon={Package}
            label="入库前组题"
            action="group_before_bank"
            onClick={onCheckAction}                    // 点击入库前组题
          />
        )}

        {/* 知识点缺失：黄色警告样式 */}
        {checks.missingKnowledgeIds.length > 0 && (
          <CheckItem
            Icon={AlertTriangle}
            label="知识点缺失"
            count={checks.missingKnowledgeIds.length}  // 缺失数量
            action="missing_knowledge"
            warning={true}                             // 警告样式
            onClick={onCheckAction}                    // 点击查看知识点缺失
          />
        )}

        {/* 题图挂载异常：黄色警告样式 */}
        {checks.figureMountIssues.length > 0 && (
          <CheckItem
            Icon={Image}
            label="题图挂载异常"
            count={checks.figureMountIssues.length}    // 异常数量
            action="figure_mount_issues"
            warning={true}                             // 警告样式
            onClick={onCheckAction}                    // 点击查看题图异常
          />
        )}
      </div>
    </div>
  )
}
