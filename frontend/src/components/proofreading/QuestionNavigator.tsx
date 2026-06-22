import { useMemo, useCallback } from "react" // React钩子导入
import { cn } from "@/utils/cn" // 样式合并工具

/* 题目简要信息接口 — 导航列表项所需字段 */
interface QuestionItem {
  id: string                                                // 题目唯一ID
  question_no: number                                       // 题号
  question_type: string                                     // 题型：fill/single/judge/calc/operate/application/general
  question_status: string                                   // 状态：pending/normal/error
  in_bank: boolean                                          // 是否已入库
  knowledge_points: Array<{ id: string; name: string }>     // 知识点列表
}

/* 组件Props接口定义 */
interface QuestionNavigatorProps {
  questions: QuestionItem[]                      // 题目列表
  currentId: string | null                       // 当前选中题目ID
  selectedIds: string[]                          // 多选的题目ID列表
  onSelect: (id: string) => void                 // 点击选中回调
  onMultiSelect: (id: string) => void            // Ctrl+点击多选回调
}

/**
 * 题号导航组件
 * 功能：6列网格展示题号色块，支持单选/多选、全选、4种状态色标
 * 输入：题目列表、当前选中ID、多选ID列表、选中/多选回调
 * 使用场景：校对页面左侧题号导航面板
 */
export default function QuestionNavigator({
  questions,
  currentId,
  selectedIds,
  onSelect,
  onMultiSelect,
}: QuestionNavigatorProps) {

  /* 多选ID集合 — 用Set提升查找性能 */
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  /* 处理题号块点击事件 — 区分单选和多选 */
  const handleClick = useCallback((id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      onMultiSelect(id) // Ctrl/Cmd+点击 → 多选
    } else {
      onSelect(id) // 普通点击 → 单选
    }
  }, [onSelect, onMultiSelect])

  /**
   * 计算单个题号的状态样式
   * 优先级：已入库 > 异常/缺知识点 > 当前选中 > 默认
   */
  const getBlockClass = useCallback((q: QuestionItem) => {
    const isCurrent = q.id === currentId               // 是否当前选中
    const isSelected = selectedIdSet.has(q.id)         // 是否多选选中
    const isError = q.question_status === "error"      // 是否识别异常
    // 防御性检查：knowledge_points 可能为 null（后端对未标注题目返回 null）
    const isMissingKnowledge = !q.knowledge_points || q.knowledge_points.length === 0 // 是否缺知识点
    const isInBank = q.in_bank                         // 是否已入库

    // 已入库 → 灰底标识，但始终可点击查看
    if (isInBank) {
      // 已入库题目：灰色背景表示已入库状态，但可正常点击查看
      if (isCurrent) {
        return cn(
          "question-number-btn",
          "bg-blue-500 text-white ring-2 ring-blue-300"         // 已入库+当前选中 → 蓝色选中样式
        )
      }
      if (isSelected) {
        return cn(
          "question-number-btn",
          "bg-blue-500 text-white ring-2 ring-blue-300"         // 已入库+多选选中 → 蓝色选中样式
        )
      }
      return cn(
        "question-number-btn",                                  // 基础网格按钮样式
        "bg-gray-200 text-gray-500 hover:bg-gray-300 cursor-pointer" // 灰色但可点击，hover变深
      )
    }

    // 异常或缺知识点 → 黄色警告
    if (isError || isMissingKnowledge) {
      return cn(
        "question-number-btn",                                // 基础网格按钮样式
        "bg-yellow-100 border border-yellow-400 text-yellow-800", // 黄色警告样式
        isSelected && "ring-2 ring-blue-300"                  // 多选叠加蓝色环
      )
    }

    // 当前选中 → 蓝色高亮
    if (isCurrent) {
      return cn(
        "question-number-btn",                                // 基础网格按钮样式
        "bg-blue-500 text-white ring-2 ring-blue-300"         // 蓝色选中样式
      )
    }

    // 多选选中 → 蓝色高亮
    if (isSelected) {
      return cn(
        "question-number-btn",                                // 基础网格按钮样式
        "bg-blue-500 text-white ring-2 ring-blue-300"         // 蓝色选中样式
      )
    }

    // 默认 → 白色背景
    return cn(
      "question-number-btn",                                  // 基础网格按钮样式
      "bg-white border border-gray-300 text-gray-600"         // 白色默认样式
    )
  }, [currentId, selectedIdSet])

  /* 全选切换 — 选中所有非入库题目，或取消全选 */
  const handleSelectAll = useCallback(() => {
    const nonBankedIds = questions                           // 取出所有非入库题目
      .filter((q) => !q.in_bank)
      .map((q) => q.id)

    // 判断当前是否已全选（所有非入库题目都在selectedIds中）
    const allSelected = nonBankedIds.every((id) => selectedIdSet.has(id))

    if (allSelected) {
      // 已全选 → 逐个取消（通过onMultiSelect逐个触发）
      nonBankedIds.forEach((id) => {
        if (selectedIdSet.has(id)) {
          onMultiSelect(id) // 取消选中
        }
      })
    } else {
      // 未全选 → 逐个选中未选的非入库题目
      nonBankedIds.forEach((id) => {
        if (!selectedIdSet.has(id)) {
          onMultiSelect(id) // 选中
        }
      })
    }
  }, [questions, selectedIdSet, onMultiSelect])

  /* 全选复选框状态计算 */
  const nonBankedIds = useMemo(                             // 所有非入库题目ID
    () => questions.filter((q) => !q.in_bank).map((q) => q.id),
    [questions]
  )
  const allSelected = nonBankedIds.length > 0               // 是否全选
    && nonBankedIds.every((id) => selectedIdSet.has(id))
  const someSelected = nonBankedIds.some(                   // 是否部分选中
    (id) => selectedIdSet.has(id)
  )

  /* 已选题目数量 */
  const selectedCount = selectedIds.length

  return (
    /* 外层容器：纵向排列，可滚动 */
    <div className="flex flex-col overflow-y-auto relative">

      {/* 顶部栏：全选复选框 + 标题 + 题目总数 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 shrink-0">
        {/* 全选复选框 */}
        <input
          type="checkbox"
          checked={allSelected}                              // 全选状态
          ref={(el) => {                                     // indeterminate半选状态
            if (el) el.indeterminate = someSelected && !allSelected
          }}
          onChange={handleSelectAll}                         // 切换全选
          className="w-4 h-4 accent-blue-500 cursor-pointer" // 复选框样式
        />
        {/* 导航标题 */}
        <span className="text-sm font-medium text-slate-700">题号导航</span>
        {/* 题目总数 */}
        <span className="text-xs text-slate-400">{questions.length} 题</span>
      </div>

      {/* 题号6列网格区域 */}
      <div className="question-navigator-grid flex-1 overflow-y-auto">
        {questions.map((q) => {
          const isInBank = q.in_bank                         // 是否已入库
          const isSelected = selectedIdSet.has(q.id)         // 是否多选选中

          return (
            /* 单个题号按钮 */
            <div
              key={q.id}
              onClick={(e) => handleClick(q.id, e)} // 所有题目均可点击查看
              className={getBlockClass(q)}                   // 动态状态样式
              title={`第${q.question_no}题`}                 // 悬停提示题号
            >
              {/* 左上角小复选框 — 仅多选选中时显示 */}
              {isSelected && (
                <span className="absolute top-0 left-0 w-2.5 h-2.5 bg-blue-500 rounded-br-sm" />
              )}
              {/* 题号数字 */}
              {q.question_no}
            </div>
          )
        })}
      </div>

      {/* 底部已选提示条 — 有选中时显示 */}
      {selectedCount > 0 && (
        <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-slate-200 px-3 py-2 text-sm text-blue-600 shrink-0">
          已选 {selectedCount} 题 {/* 显示已选题目数量 */}
        </div>
      )}
    </div>
  )
}
