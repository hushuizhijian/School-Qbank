// 功能：管理题目筛选状态和逻辑
// 输入参数：initialFilters
// 返回值：筛选状态和操作方法
// 使用场景：题库页筛选、作业选题筛选
import { useState, useCallback, useMemo } from 'react';

// 筛选条件接口
interface FilterState {
  keyword: string;
  subject: string;
  grade: string;
  questionType: string;
  difficulty: string;
  hasFigure: boolean | null;
  hasFormula: boolean | null;
  hasTable: boolean | null;
  knowledgePointIds: string[];
}

// 默认筛选条件
const defaultFilters: FilterState = {
  keyword: '',
  subject: '',
  grade: '',
  questionType: '',
  difficulty: '',
  hasFigure: null,
  hasFormula: null,
  hasTable: null,
  knowledgePointIds: [],
};

export function useQuestionFilter(initialFilters?: Partial<FilterState>) {
  // 筛选条件状态
  const [filters, setFilters] = useState<FilterState>({
    ...defaultFilters,
    ...initialFilters,
  });

  // 更新单个筛选条件
  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 重置所有筛选条件
  const resetFilters = useCallback(() => {
    setFilters({ ...defaultFilters, ...initialFilters });
  }, [initialFilters]);

  // 检查是否有活跃的筛选条件
  const hasActiveFilters = useMemo(() => {
    return (
      filters.keyword !== '' ||
      filters.subject !== '' ||
      filters.grade !== '' ||
      filters.questionType !== '' ||
      filters.difficulty !== '' ||
      filters.hasFigure !== null ||
      filters.hasFormula !== null ||
      filters.hasTable !== null ||
      filters.knowledgePointIds.length > 0
    );
  }, [filters]);

  return { filters, setFilter, resetFilters, hasActiveFilters };
}
