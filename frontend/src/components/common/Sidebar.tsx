/** 侧边栏导航 — 业务分组版 + 主题切换 */
import { useLocation, useNavigate } from "react-router-dom"
import { cn } from "@/utils/cn"
import { useUiStore } from "@/stores/uiStore"
import ThemeSwitch from "@/components/theme-switch"
import {
  BookOpen, Upload, FileText, PenTool, FileDown, BarChart3, Settings,
  ChevronLeft, ChevronRight, LogOut,
} from "lucide-react"

/** 菜单分组定义 */
const menuGroups = [
  {
    icon: "📚",
    title: "题库中心",
    items: [
      { label: "题库管理", path: "/", icon: BookOpen },
      { label: "解析记录", path: "/papers", icon: FileText },
      { label: "套卷智能解析", path: "/papers/upload", icon: Upload },
    ],
  },
  {
    icon: "📝",
    title: "组卷中心",
    items: [
      { label: "作业组卷", path: "/homework", icon: PenTool },
      { label: "PDF导出", path: "/exports", icon: FileDown },
    ],
  },
  {
    icon: "📊",
    title: "数据看板",
    items: [
      { label: "题库统计", path: "/stats", icon: BarChart3 },
    ],
  },
  {
    icon: "⚙️",
    title: null, // 系统设置不带分组标题
    items: [
      { label: "系统设置", path: "/settings", icon: Settings },
    ],
  },
]

/** 侧边栏组件 */
export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { sidebarCollapsed, toggleSidebar } = useUiStore()

  return (
    <aside
      className={cn(
        "flex flex-col bg-slate-900 text-slate-300 transition-all duration-200 shrink-0",
        sidebarCollapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo 区域 */}
      <div className="flex items-center h-14 px-4 border-b border-slate-700">
        {!sidebarCollapsed && (
          <span className="text-base font-semibold text-white truncate">
            小学数学题库
          </span>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            "p-1 rounded hover:bg-slate-700 transition-colors",
            !sidebarCollapsed && "ml-auto"
          )}
        >
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* 菜单区域 */}
      <nav className="flex-1 overflow-y-auto py-2">
        {menuGroups.map((group, gi) => (
          <div key={gi} className="mb-2">
            {/* 分组标题 */}
            {group.title && !sidebarCollapsed && (
              <div className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                {group.icon} {group.title}
              </div>
            )}
            {group.title && sidebarCollapsed && (
              <div className="mx-2 my-1 border-t border-slate-700" />
            )}

            {/* 菜单项 */}
            {group.items.map((item) => {
              const isActive = location.pathname === item.path
              const Icon = item.icon
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    "flex items-center w-full px-4 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-blue-600 text-white"
                      : "hover:bg-slate-700 text-slate-300",
                    sidebarCollapsed && "justify-center px-0"
                  )}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="ml-3 truncate">{item.label}</span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      {/* 底部用户信息 + 主题切换 */}
      <div className="border-t border-slate-700">
        {/* 主题切换按钮 */}
        <div className={cn(
          "px-2 py-2",
          sidebarCollapsed && "flex justify-center"
        )}>
          {sidebarCollapsed ? (
            <ThemeSwitch />
          ) : (
            <ThemeSwitch />
          )}
        </div>

        {/* 用户信息 */}
        <div className="px-4 py-3 flex items-center border-t border-slate-700">
          {!sidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">张老师</div>
                <div className="text-xs text-slate-500">管理员</div>
              </div>
              <button
                onClick={() => navigate("/login")}
                className="p-1.5 rounded hover:bg-slate-700 transition-colors"
                title="退出登录"
              >
                <LogOut size={16} />
              </button>
            </>
          )}
          {sidebarCollapsed && (
            <button
              onClick={() => navigate("/login")}
              className="p-1.5 rounded hover:bg-slate-700 transition-colors mx-auto"
              title="退出登录"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
