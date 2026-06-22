/**
 * 主布局 — 侧边栏 + 内容区 + 全局SSE日志窗
 *
 * 修复点：
 *  - <Outlet> 加 key={location.pathname}：路由切换时强制重挂载，
 *    避免同一组件实例在不同路由间共享状态导致的"页面丢失"
 *    （典型场景：从 /homework/A/compose 跳到 /homework 列表页时，
 *    旧组件残留的 dnd-kit 监听器 / 自动保存计时器等可能干扰新页面渲染）
 */
import { Outlet, useLocation } from "react-router-dom"
import Sidebar from "@/components/common/Sidebar"
import GlobalSSEPanel from "@/components/common/GlobalSSEPanel"

/** 主布局组件：左侧边栏 + 右侧内容区 + 右下角全局日志 */
export default function MainLayout() {
  // 当前路由路径，用于给 Outlet 加 key 强制重挂载
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* 左侧边栏 */}
      <Sidebar />

      {/* 右侧内容区 — key 保证不同路由下使用不同实例，彻底隔离旧组件残留状态 */}
      <main className="flex-1 overflow-auto">
        <Outlet key={location.pathname} />
      </main>

      {/* 右下角全局 SSE 日志悬浮窗 */}
      <GlobalSSEPanel />
    </div>
  )
}
