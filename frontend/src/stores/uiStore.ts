/** UI 状态管理 */
import { create } from "zustand"

interface UiState {
  /** 侧边栏是否折叠 */
  sidebarCollapsed: boolean
  /** 切换侧边栏折叠 */
  toggleSidebar: () => void
  /** 设置侧边栏折叠 */
  setSidebarCollapsed: (collapsed: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) =>
    set({ sidebarCollapsed: collapsed }),
}))
