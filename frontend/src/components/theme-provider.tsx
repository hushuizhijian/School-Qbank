/**
 * ThemeProvider — 主题状态管理组件
 * 功能：管理全局暗色/亮色主题状态，持久化到 localStorage
 * 输入：children 子组件
 * 使用场景：App.tsx 根组件包裹
 * 借鉴自：ragflow 项目的 theme-provider.tsx
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

/** 主题枚举 */
export type Theme = "light" | "dark"

/** 主题上下文类型 */
interface ThemeContextType {
  theme: Theme                    // 当前主题
  setTheme: (theme: Theme) => void  // 切换主题
  isDark: boolean                 // 是否为暗色模式
}

/** 主题上下文 */
const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  isDark: false,
})

/** 主题存储键名 */
const STORAGE_KEY = "math-tools-theme"

/** 主题提供者组件 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // 从 localStorage 读取初始主题，默认亮色
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "dark" || stored === "light") return stored
    // 跟随系统偏好
    if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
      return "dark"
    }
    return "light"
  })

  // 主题变更时同步到 DOM 和 localStorage
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const isDark = theme === "dark"

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

/** 使用主题的 Hook */
export function useTheme() {
  return useContext(ThemeContext)
}

/** 使用暗色判断的 Hook */
export function useIsDark() {
  const { isDark } = useContext(ThemeContext)
  return isDark
}