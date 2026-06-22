/** 校对工作台状态管理 */
import { create } from "zustand"
import type { ProofreadingStats } from "@/types/paper"
import type { Question } from "@/types/question"

type FilterKey = "all" | "missing_knowledge" | "error" | "pending" | "with_figure" | "with_table"

interface ProofreadingState {
  /** 当前试卷 ID */
  paperId: string | null
  /** 题目列表 */
  questions: Question[]
  /** 当前选中题目 ID */
  currentQuestionId: string | null
  /** 筛选状态 */
  activeFilter: FilterKey
  /** 多选状态 */
  selectedQuestionIds: Set<string>
  /** 统计数据 */
  stats: ProofreadingStats | null

  /** 设置当前题目 */
  setCurrentQuestion: (id: string) => void
  /** 切换多选 */
  toggleSelection: (id: string) => void
  /** 设置筛选 */
  setFilter: (filter: FilterKey) => void
  /** 更新题目 */
  updateQuestion: (id: string, data: Partial<Question>) => void
  /** 设置统计 */
  setStats: (stats: ProofreadingStats) => void
  /** 设置题目列表 */
  setQuestions: (questions: Question[]) => void
  /** 清空选中 */
  clearSelection: () => void
}

export const useProofreadingStore = create<ProofreadingState>((set) => ({
  paperId: null,
  questions: [],
  currentQuestionId: null,
  activeFilter: "all",
  selectedQuestionIds: new Set<string>(),
  stats: null,

  setCurrentQuestion: (id) => set({ currentQuestionId: id }),

  toggleSelection: (id) =>
    set((state) => {
      const newSet = new Set(state.selectedQuestionIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return { selectedQuestionIds: newSet }
    }),

  setFilter: (filter) => set({ activeFilter: filter, selectedQuestionIds: new Set() }),

  updateQuestion: (id, data) =>
    set((state) => ({
      questions: state.questions.map((q) =>
        q.id === id ? { ...q, ...data } : q
      ),
    })),

  setStats: (stats) => set({ stats }),

  setQuestions: (questions) => set({
    questions,
    currentQuestionId: questions[0]?.id ?? null,
  }),

  clearSelection: () => set({ selectedQuestionIds: new Set<string>() }),
}))
