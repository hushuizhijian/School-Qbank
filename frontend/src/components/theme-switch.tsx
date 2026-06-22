/**
 * ThemeSwitch — 主题切换开关组件
 * 功能：一键切换暗色/亮色模式，带太阳/月亮图标
 * 输入：无（从 ThemeContext 获取状态）
 * 使用场景：侧边栏底部
 * 借鉴自：ragflow 项目的 theme-switch.tsx
 */
import { Sun, Moon } from "lucide-react"
import { useTheme } from "@/components/theme-provider"
import { cn } from "@/utils/cn"

/** 主题切换按钮 */
export default function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "relative flex items-center gap-2 px-3 py-2 rounded-lg transition-colors",
        "text-slate-400 hover:text-slate-200 hover:bg-slate-700",
        "w-full"
      )}
      title={isDark ? "切换到亮色模式" : "切换到暗色模式"}
    >
      {/* 太阳/月亮图标带切换动画 */}
      <div className="relative w-5 h-5 shrink-0">
        <Sun
          size={18}
          className={cn(
            "absolute inset-0 transition-all duration-300",
            isDark
              ? "opacity-0 rotate-90 scale-50"
              : "opacity-100 rotate-0 scale-100"
          )}
        />
        <Moon
          size={18}
          className={cn(
            "absolute inset-0 transition-all duration-300",
            isDark
              ? "opacity-100 rotate-0 scale-100"
              : "opacity-0 -rotate-90 scale-50"
          )}
        />
      </div>

      {/* 标签文字 */}
      <span className="text-sm">
        {isDark ? "暗色模式" : "亮色模式"}
      </span>
    </button>
  )
}