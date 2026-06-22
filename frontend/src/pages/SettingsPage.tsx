/** 系统设置页 */
import { useState } from "react"
import { Settings, User, Bell, Database, Palette, Zap, BookOpen } from "lucide-react"
import AIModelSettings from "./settings/AIModelSettings"
import KnowledgeTreeSettings from "./settings/KnowledgeTreeSettings"

export default function SettingsPage() {
  // 当前选中的设置分类（默认显示 AI 模型）
  const [activeTab, setActiveTab] = useState<"aiModel" | "knowledge" | "profile" | "notification" | "storage" | "appearance">("aiModel")
  // 设置分类列表（AI模型 放最上面）
  const tabList = [
    { key: "aiModel" as const, label: "AI模型", icon: Zap },
    { key: "knowledge" as const, label: "知识树管理", icon: BookOpen },
    { key: "profile" as const, label: "个人信息", icon: User },
    { key: "notification" as const, label: "通知设置", icon: Bell },
    { key: "storage" as const, label: "存储管理", icon: Database },
    { key: "appearance" as const, label: "外观设置", icon: Palette },
  ]

  return (
    <div className="flex h-full">
      {/* 左侧设置导航（固定240px宽） */}
      <div className="w-[240px] border-r border-slate-200 bg-white overflow-y-auto shrink-0">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Settings size={18} />
            系统设置
          </h2>
        </div>
        <div className="p-2 space-y-1">
          {tabList.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? "bg-blue-50 text-blue-600"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 右侧设置内容区（flex自适应） */}
      <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <div className={`bg-white rounded-lg border border-slate-200 p-6 ${activeTab === "aiModel" || activeTab === "knowledge" ? "max-w-full h-full" : "max-w-2xl"}`}>
          <h3 className="text-base font-semibold text-slate-800 mb-4">
            {tabList.find((t) => t.key === activeTab)?.label}
          </h3>

          {/* AI模型配置（默认页面，放最上面） */}
          {activeTab === "aiModel" && <AIModelSettings />}

          {/* 知识树管理 — 系统设置页入口 */}
          {activeTab === "knowledge" && <KnowledgeTreeSettings />}

          {/* 个人信息设置占位 */}
          {activeTab === "profile" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">用户名</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入用户名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">邮箱</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入邮箱"
                />
              </div>
              <button className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                保存修改
              </button>
            </div>
          )}

          {/* 通知设置占位 */}
          {activeTab === "notification" && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" defaultChecked />
                解析完成通知
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" defaultChecked />
                导出完成通知
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" />
                系统更新通知
              </label>
            </div>
          )}

          {/* 存储管理占位 */}
          {activeTab === "storage" && (
            <div className="text-center text-slate-400 text-sm py-8">
              <Database size={32} className="mx-auto mb-2 opacity-30" />
              存储管理功能开发中...
            </div>
          )}

          {/* 外观设置占位 */}
          {activeTab === "appearance" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">主题</label>
                <div className="flex gap-2">
                  <button className="px-4 py-2 text-sm border border-blue-500 text-blue-600 rounded-lg">
                    浅色
                  </button>
                  <button className="px-4 py-2 text-sm border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
                    深色
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}