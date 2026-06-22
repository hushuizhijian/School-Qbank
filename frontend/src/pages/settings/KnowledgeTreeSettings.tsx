/**
 * KnowledgeTreeSettings — 知识树管理设置页（重构版）
 *
 * 功能：使用 KnowledgeGraphTree 渲染可视化的知识图谱，支持新增/重命名/移动/删除
 * 输入参数：refreshKey（外部触发刷新）
 * 返回值：知识图谱面板 JSX
 * 使用场景：系统设置 → 知识树管理
 *
 * 说明：原"一键初始化 / 强制覆盖 / 刷新统计"等按钮已移除（用户确认），
 *       改用可视化的树形编辑器直接管理节点。
 */
import KnowledgeGraphTree from "@/components/knowledge/KnowledgeGraphTree"

/** 组件属性 */
interface KnowledgeTreeSettingsProps {
  refreshKey?: number
}

/**
 * 知识树管理主组件
 *
 * 功能：渲染可视化的知识图谱编辑器
 * 输入参数：refreshKey 外部触发刷新
 * 返回值：知识图谱面板 JSX
 * 使用场景：系统设置 → 知识树管理
 */
export default function KnowledgeTreeSettings({ refreshKey: _refreshKey }: KnowledgeTreeSettingsProps) {
  return (
    <article className="rounded-lg w-full h-full flex flex-col">
      {/* 标题 */}
      <header className="py-2 mb-3">
        <h2 className="text-xl font-semibold text-slate-800">知识树管理</h2>
        <p className="mt-1 text-sm text-slate-400">
          可视化管理知识点层级结构：点击节点定位 · 悬停节点查看操作按钮（新增子节点 / 重命名 / 移动 / 删除）
        </p>
      </header>

      {/* 知识图谱主体 */}
      <div className="flex-1 min-h-0 border border-slate-200 rounded-lg overflow-hidden">
        <KnowledgeGraphTree
          mode="edit"
          subject="数学"
          defaultExpandAll={true}
          showBreadcrumb={true}
          showSearch={true}
          showAddRoot={true}
        />
      </div>
    </article>
  )
}
