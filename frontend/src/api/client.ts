/** Axios 实例 + 拦截器 */
import axios from "axios"
import { toast } from "sonner"

/** 创建 Axios 实例 */
const client = axios.create({
  baseURL: "",
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
})

/** 请求拦截器：自动添加 Token */
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token")
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** 响应拦截器：统一错误处理 + Toast 提示 */
client.interceptors.response.use(
  (response) => response,
  (error) => {
    // 网络错误（服务器无响应 / 断网）
    if (error.code === "ERR_NETWORK") {
      toast.error("网络连接失败，请检查网络后重试")
      return Promise.reject(error)
    }

    // 请求超时
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      toast.error("请求超时，请稍后重试")
      return Promise.reject(error)
    }

    const status = error.response?.status

    // 401 未授权：清除 Token 并跳转登录
    if (status === 401) {
      localStorage.removeItem("access_token")
      window.location.href = "/login"
      return Promise.reject(error)
    }

    // 4xx 客户端错误
    if (status >= 400 && status < 500) {
      const detail = error.response?.data?.detail
      // 关键修复：detail 可能是 Pydantic 校验错误（数组 [{type, loc, msg, ...}]）
      // 直接 toast.error(数组) 会让 sonner 把对象当 React child 渲染 → 整个组件树崩溃
      // 必须把 detail 统一转成字符串再 toast
      const message = formatErrorDetail(detail)
      toast.error(message)
      return Promise.reject(error)
    }

    // 5xx 服务端错误
    if (status >= 500) {
      toast.error("服务器异常，请稍后重试")
      return Promise.reject(error)
    }

    // 其他未知错误
    toast.error("请求失败，请稍后重试")
    return Promise.reject(error)
  }
)

/**
 * 把后端错误 detail 统一转成可读字符串
 * 输入参数：detail - 后端 detail 字段（可能是 string / array / object）
 * 返回值：可直接 toast 的字符串
 * 使用场景：axios 拦截器 / 任何需要展示后端错误的场景
 */
function formatErrorDetail(detail: unknown): string {
  if (!detail) return "请求参数错误"
  if (typeof detail === "string") return detail
  if (Array.isArray(detail)) {
    // Pydantic 校验错误数组：每项含 {type, loc, msg, input, ctx}
    return detail
      .map((item) => {
        if (item && typeof item === "object") {
          const loc = Array.isArray(item.loc) ? item.loc.join(".") : ""
          const msg = item.msg || "字段错误"
          return loc ? `${loc}: ${msg}` : msg
        }
        return String(item)
      })
      .join("；")
  }
  if (typeof detail === "object") {
    try { return JSON.stringify(detail) } catch { return "请求参数错误" }
  }
  return String(detail)
}

export default client
