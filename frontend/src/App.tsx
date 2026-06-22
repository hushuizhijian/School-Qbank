/** 路由配置 + 应用入口 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import ErrorBoundary from "@/components/common/ErrorBoundary"
import MainLayout from "@/layouts/MainLayout"
import QuestionBankPage from "@/pages/QuestionBankPage"
import PaperUploadPage from "@/pages/PaperUploadPage"
import PaperSplitPage from "@/pages/PaperSplitPage"
import PaperRecordsPage from "@/pages/PaperRecordsPage"
import ProofreadingWorkbench from "@/pages/ProofreadingWorkbench"
import HomeworkComposePage from "@/pages/HomeworkComposePage"
import HomeworkListPage from "@/pages/HomeworkListPage"
import ExportListPage from "@/pages/ExportListPage"
import StatsDashboardPage from "@/pages/StatsDashboardPage"
import SettingsPage from "@/pages/SettingsPage"
import LoginPage from "@/pages/LoginPage"

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          {/* 登录页 */}
          <Route path="/login" element={<LoginPage />} />

          {/* 主布局内页面 */}
          <Route element={<MainLayout />}>
            {/* 题库中心（默认首页） */}
            <Route path="/" element={<QuestionBankPage />} />
            {/* 套卷智能解析 */}
            <Route path="/papers/upload" element={<PaperUploadPage />} />
            {/* 分题切分（阶段二） */}
            <Route path="/papers/:id/split" element={<PaperSplitPage />} />
            {/* 解析记录 */}
            <Route path="/papers" element={<PaperRecordsPage />} />
            {/* 校对工作台 — 包裹错误边界防止崩溃白屏 */}
            <Route path="/papers/:id" element={<ErrorBoundary><ProofreadingWorkbench /></ErrorBoundary>} />
            {/* 作业组卷 */}
            <Route path="/homework" element={<HomeworkListPage />} />
            <Route path="/homework/:id/compose" element={<HomeworkComposePage />} />
            <Route path="/homework/compose/new" element={<HomeworkComposePage />} />
            {/* PDF 导出 */}
            <Route path="/exports" element={<ExportListPage />} />
            {/* 数据看板 */}
            <Route path="/stats" element={<StatsDashboardPage />} />
            {/* 系统设置 */}
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          {/* 兜底重定向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
