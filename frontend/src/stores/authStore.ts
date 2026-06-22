/** 认证状态管理 */
import { create } from "zustand"

interface AuthState {
  /** 是否已登录 */
  isAuthenticated: boolean
  /** 用户名 */
  username: string | null
  /** 用户角色 */
  role: string | null
  /** 访问令牌 */
  accessToken: string | null

  /** 设置认证信息 */
  setAuth: (token: string, username: string, role: string) => void
  /** 清除认证信息 */
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!localStorage.getItem("access_token"),
  username: localStorage.getItem("username"),
  role: localStorage.getItem("role"),
  accessToken: localStorage.getItem("access_token"),

  setAuth: (token, username, role) => {
    localStorage.setItem("access_token", token)
    localStorage.setItem("username", username)
    localStorage.setItem("role", role)
    set({ isAuthenticated: true, username, role, accessToken: token })
  },

  clearAuth: () => {
    localStorage.removeItem("access_token")
    localStorage.removeItem("username")
    localStorage.removeItem("role")
    set({ isAuthenticated: false, username: null, role: null, accessToken: null })
  },
}))
