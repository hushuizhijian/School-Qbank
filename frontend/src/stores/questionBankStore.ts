/** 题库中心状态管理 */
import { create } from "zustand"

interface QuestionBankState {
  /** 筛选条件 */
  filters: {
    keyword: string
    subject: string
    grade: string
    questionType: string
    difficulty: string
    hasFigure: boolean | null
    hasFormula: boolean | null
    hasTable: boolean | null
    knowledgePointIds: string[]
  }

  /** 选中状态 */
  selectedIds: Set<string>
  selectAllMode: boolean

  /** 视图模式 */
  viewMode: "grid" | "list"

  /** 分页 */
  page: number
  pageSize: number

  /** 设置筛选条件 */
  setFilter: (key: string, value: unknown) => void
  /** 重置筛选 */
  resetFilters: () => void
  /** 切换选中 */
  toggleSelect: (id: string) => void
  /** 全选/取消全选 */
  toggleSelectAll: () => void
  /** 清空选中 */
  clearSelection: () => void
  /** 设置视图模式 */
  setViewMode: (mode: "grid" | "list") => void
  /** 设置页码 */
  setPage: (page: number) => void
}

const defaultFilters = {
  keyword: "",
  subject: "",
  grade: "",
  questionType: "",
  difficulty: "",
  hasFigure: null as boolean | null,
  hasFormula: null as boolean | null,
  hasTable: null as boolean | null,
  knowledgePointIds: [] as string[],
}

export const useQuestionBankStore = create<QuestionBankState>((set) => ({
  filters: { ...defaultFilters },
  selectedIds: new Set<string>(),
  selectAllMode: false,
  viewMode: "grid",
  page: 1,
  pageSize: 20,

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value },
      page: 1, // 筛选变化时重置页码
    })),

  resetFilters: () =>
    set({ filters: { ...defaultFilters }, page: 1 }),

  toggleSelect: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return { selectedIds: newSet }
    }),

  toggleSelectAll: () =>
    set((state) => ({
      selectAllMode: !state.selectAllMode,
      selectedIds: state.selectAllMode ? new Set<string>() : new Set(state.selectedIds),
    })),

  clearSelection: () =>
    set({ selectedIds: new Set<string>(), selectAllMode: false }),

  setViewMode: (mode) => set({ viewMode: mode }),

  setPage: (page) => set({ page }),
}))
