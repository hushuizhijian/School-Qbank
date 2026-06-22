/**
 * 插件槽组件
 *
 * 功能：按 mountPoint 分组渲染插件，自动按 priority 排序
 * 输入参数：mountPoint（挂载位置）、pluginProps（注入数据）、plugins（注册清单）
 * 返回值：该插槽下所有插件的渲染结果
 * 使用场景：校对工作台核心渲染中插入 PluginSlot
 */

import { lazy, Suspense } from "react"
import PluginErrorBoundary from "@/components/plugins/PluginErrorBoundary"
import type { PluginMountPoint, PluginProps, PluginRegistration } from "@/types/plugin"
import { Loader2 } from "lucide-react"

/* ========== 类型定义 ========== */

/** 插件槽 Props */
interface PluginSlotProps {
  mountPoint: PluginMountPoint                          // 挂载位置
  pluginProps: PluginProps                              // 注入给插件的数据
  plugins: PluginRegistration[]                         // 插件注册清单
}

/* ========== 加载中占位 ========== */

/**
 * 插件加载中占位组件
 * 功能：插件动态 import 期间的轻量骨架
 */
function PluginLoading() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400">
      <Loader2 size={12} className="animate-spin" />
      加载中...
    </div>
  )
}

/* ========== 主组件 ========== */

/**
 * 插件槽
 *
 * 功能：过滤匹配 mountPoint 的插件 → 按 priority 排序 → 包裹错误边界 + Suspense → 渲染
 */
export default function PluginSlot({ mountPoint, pluginProps, plugins }: PluginSlotProps) {
  // 过滤此插槽的插件，按 priority 排序
  const matched = plugins
    .filter((p) => p.meta.mountPoint === mountPoint)     // 匹配挂载位置
    .sort((a, b) => a.meta.priority - b.meta.priority)   // 按优先级升序

  // 无匹配插件时返回 null
  if (matched.length === 0) return null

  return (
    <>
      {matched.map((registration) => {
        // 动态加载插件组件
        const PluginComponent = lazy(() =>
          registration.loader().then((mod) => {
            // 验证默认导出存在
            if (!mod.default) {
              throw new Error(`插件 "${registration.meta.label}" 缺少默认导出`)
            }
            return mod
          })
        )

        return (
          <PluginErrorBoundary
            key={registration.meta.id}
            pluginId={registration.meta.id}
            pluginLabel={registration.meta.label}
          >
            <Suspense fallback={<PluginLoading />}>
              <PluginComponent {...pluginProps} />
            </Suspense>
          </PluginErrorBoundary>
        )
      })}
    </>
  )
}