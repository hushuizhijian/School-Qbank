/**
 * 全局 SSE 日志 Store
 * 任何页面都可以推送日志，SSELogPanel 在 MainLayout 中全局订阅
 */
import { create } from "zustand"

export interface SSELogEntry {
  time: string
  message: string
  level: "info" | "ok" | "warn" | "err"
}

interface SSEStore {
  logs: SSELogEntry[]
  addLog: (message: string, level?: SSELogEntry["level"]) => void
  clearLogs: () => void
}

function now() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false })
}

export const useSSEStore = create<SSEStore>((set) => ({
  logs: [],
  addLog: (message, level = "info") => {
    set((state) => ({
      logs: [...state.logs.slice(-200), { time: now(), message, level }],
    }))
  },
  clearLogs: () => set({ logs: [] }),
}))