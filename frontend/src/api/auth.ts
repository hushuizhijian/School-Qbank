/** 认证 API */
import client from "./client"

/** 登录 */
export const login = async (username: string, password: string) => {
  const res = await client.post("/api/auth/login", { username, password })
  return res.data
}

/** 获取当前用户信息 */
export const getMe = async () => {
  const res = await client.get("/api/auth/me")
  return res.data
}

/** 登出 */
export const logout = async () => {
  const res = await client.post("/api/auth/logout")
  return res.data
}
