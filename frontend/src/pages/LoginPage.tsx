/** 登录页 — 居中登录表单 */
import { useState } from "react"
import { LogIn, Eye, EyeOff } from "lucide-react"

export default function LoginPage() {
  // 用户名
  const [username, setUsername] = useState("")
  // 密码
  const [password, setPassword] = useState("")
  // 密码可见性
  const [showPassword, setShowPassword] = useState(false)
  // 加载状态
  const [loading] = useState(false)

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      {/* 登录卡片 */}
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-8">
        {/* 标题区 */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <LogIn size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">欢迎使用题库系统</h1>
          <p className="text-sm text-slate-500 mt-1">请登录您的账号</p>
        </div>

        {/* 表单区 */}
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          {/* 用户名输入 */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* 密码输入 */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">密码</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                className="w-full px-4 py-2.5 pr-10 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* 记住我 + 忘记密码 */}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="rounded" />
              记住我
            </label>
            <button type="button" className="text-sm text-blue-600 hover:underline">
              忘记密码？
            </button>
          </div>

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "登录中..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  )
}
