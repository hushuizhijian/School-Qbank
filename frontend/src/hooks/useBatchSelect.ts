/**
 * 批量选择 Hook
 *
 * 功能：管理多选状态，提供选中/取消/全选/清空等操作
 * 输入参数：
 *   - items: T[] — 可选项目列表
 *   - getId: (item: T) => string — 获取项目ID的函数
 * 返回值：选中ID集合、判断选中、切换单选、切换全选、全选、清空、选中数量、是否全选
 * 使用场景：校对页面多选题号、批量操作工具栏
 */

import { useState, useCallback, useMemo } from "react"

/** Hook 返回值类型 */
export interface BatchSelectResult {
  selectedIds: Set<string>                   // 当前选中的ID集合
  isSelected: (id: string) => boolean        // 判断是否选中
  toggleSelect: (id: string) => void         // 切换单个选中
  toggleSelectAll: () => void                // 切换全选/取消全选
  selectAll: () => void                      // 全选
  clearSelection: () => void                 // 清空选择
  selectedCount: number                      // 选中数量
  isAllSelected: boolean                     // 是否全选
}

/**
 * 批量选择 Hook
 * 管理多选状态，提供选中/取消/全选/清空等操作
 * @param items - 可选项目列表
 * @param getId - 获取项目ID的函数
 * @returns 批量选择操作集合
 */
export function useBatchSelect<T>(
  items: T[],
  getId: (item: T) => string
): BatchSelectResult {
  /* ========== 状态：选中的ID集合 ========== */

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()) // 选中ID集合

  /* ========== 判断是否选中 ========== */

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id), // 检查ID是否在集合中
    [selectedIds]
  )

  /* ========== 切换单个选中 ========== */

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev) // 复制当前集合
      if (next.has(id)) {
        next.delete(id) // 已选中 → 取消
      } else {
        next.add(id) // 未选中 → 添加
      }
      return next
    })
  }, [])

  /* ========== 全选 ========== */

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(items.map(getId))) // 将所有项目ID加入集合
  }, [items, getId])

  /* ========== 清空选择 ========== */

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set()) // 重置为空集合
  }, [])

  /* ========== 切换全选/取消全选 ========== */

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      // 已全选 → 清空；否则 → 全选
      if (prev.size === items.length && items.length > 0) {
        return new Set() // 清空
      }
      return new Set(items.map(getId)) // 全选
    })
  }, [items, getId])

  /* ========== 计算属性 ========== */

  const selectedCount = selectedIds.size // 选中数量

  const isAllSelected = useMemo(
    () => selectedCount === items.length && items.length > 0, // 全选条件：数量相等且列表非空
    [selectedCount, items.length]
  )

  return {
    selectedIds,       // 选中ID集合
    isSelected,        // 判断是否选中
    toggleSelect,      // 切换选中
    toggleSelectAll,   // 切换全选
    selectAll,         // 全选
    clearSelection,    // 清空
    selectedCount,     // 选中数量
    isAllSelected,     // 是否全选
  }
}
