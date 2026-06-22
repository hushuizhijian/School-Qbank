/**
 * 草稿自动保存 Hook
 *
 * 功能：校对工作台中题目编辑内容的草稿自动保存，支持防抖保存、页面关闭强制保存、草稿恢复与清除
 * 输入参数：
 *   - paperId: 试卷ID
 *   - questionId: 题目ID
 *   - data: 要保存的数据（题目编辑内容）
 *   - debounceMs: 防抖时间，默认 30000ms
 * 返回值：savedAt 上次保存时间、hasDraft 是否有草稿、restoreDraft 恢复草稿、clearDraft 清除草稿
 * 使用场景：校对工作台编辑题目时，自动保存草稿防止数据丢失
 */

import { useState, useEffect, useRef, useCallback } from 'react';

/** 自动保存选项 */
export interface AutoSaveOptions {
  paperId: string;           // 试卷ID
  questionId: string;        // 题目ID
  data: object;              // 要保存的数据（题目编辑内容）
  debounceMs?: number;       // 防抖时间，默认 30000ms
}

/** 自动保存结果 */
export interface AutoSaveResult {
  savedAt: Date | null;              // 上次保存时间
  hasDraft: boolean;                 // 是否有草稿
  restoreDraft: () => object | null; // 恢复草稿
  clearDraft: () => void;            // 清除草稿
}

/** localStorage 中存储的草稿结构 */
interface DraftPayload {
  data: object;     // 草稿数据
  savedAt: string;  // 保存时间 ISO 字符串
}

/**
 * 生成草稿存储 key
 * 格式：draft_${paperId}_${questionId}
 * @param paperId - 试卷ID
 * @param questionId - 题目ID
 * @returns localStorage 的 key
 */
function getDraftKey(paperId: string, questionId: string): string {
  return `draft_${paperId}_${questionId}`; // 拼接存储 key
}

/**
 * 从 localStorage 读取草稿
 * @param key - 存储 key
 * @returns 草稿载荷，不存在或解析失败返回 null
 */
function readDraft(key: string): DraftPayload | null {
  try {
    const raw = localStorage.getItem(key); // 读取原始字符串
    if (!raw) return null;                 // 无数据返回 null
    return JSON.parse(raw) as DraftPayload; // 解析 JSON
  } catch {
    return null; // 解析失败返回 null
  }
}

/**
 * 将草稿写入 localStorage
 * @param key - 存储 key
 * @param data - 要保存的数据
 */
function writeDraft(key: string, data: object): void {
  const payload: DraftPayload = {
    data,                                    // 草稿数据
    savedAt: new Date().toISOString(),       // 保存时间戳
  };
  localStorage.setItem(key, JSON.stringify(payload)); // 序列化写入
}

/**
 * 草稿自动保存 Hook
 * 监听数据变化防抖保存，支持页面关闭强制保存、草稿恢复与清除
 * @param options - 自动保存选项
 * @returns 自动保存结果
 */
export function useAutoSave(options: AutoSaveOptions): AutoSaveResult {
  const { paperId, questionId, data, debounceMs = 30000 } = options; // 解构参数，默认 30 秒

  /* ========== 状态：上次保存时间 ========== */

  const [savedAt, setSavedAt] = useState<Date | null>(null); // 上次保存时间

  /* ========== 状态：是否有草稿 ========== */

  const [hasDraft, setHasDraft] = useState<boolean>(false); // 是否存在草稿

  /* ========== Ref：防抖定时器 ID ========== */

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // 存储 setTimeout 返回值

  /* ========== Ref：最新数据引用，供 beforeunload 回调使用 ========== */

  const dataRef = useRef<object>(data); // 始终指向最新 data

  /* ========== 同步 dataRef 到最新值 ========== */

  useEffect(() => {
    dataRef.current = data; // 每次渲染后更新引用
  }, [data]);

  /* ========== 计算当前草稿 key ========== */

  const draftKey = getDraftKey(paperId, questionId); // 当前题目的存储 key

  /* ========== 立即保存方法（同步，供 beforeunload 使用） ========== */

  /**
   * 立即将当前数据保存到 localStorage
   * 不依赖 state，直接使用 dataRef 获取最新数据
   * @param key - 存储 key
   */
  const saveImmediately = useCallback((key: string) => {
    writeDraft(key, dataRef.current);                   // 写入草稿
    setSavedAt(new Date());                              // 更新保存时间
    setHasDraft(true);                                   // 标记有草稿
  }, []);

  /* ========== 清除草稿方法 ========== */

  /**
   * 清除当前题目的草稿
   * 删除 localStorage 中对应 key 的数据，重置状态
   */
  const clearDraft = useCallback(() => {
    localStorage.removeItem(draftKey); // 删除 localStorage 条目
    setHasDraft(false);                // 重置草稿标记
    setSavedAt(null);                  // 重置保存时间
  }, [draftKey]);

  /* ========== 恢复草稿方法 ========== */

  /**
   * 恢复当前题目的草稿数据
   * 从 localStorage 读取并解析，返回数据部分
   * @returns 草稿数据对象，无草稿时返回 null
   */
  const restoreDraft = useCallback((): object | null => {
    const payload = readDraft(draftKey); // 读取草稿载荷
    if (!payload) return null;           // 无草稿返回 null
    setSavedAt(new Date(payload.savedAt)); // 同步保存时间到状态
    return payload.data;                 // 返回数据部分
  }, [draftKey]);

  /* ========== 效果：questionId 变化时检查草稿并清理旧定时器 ========== */

  useEffect(() => {
    // 切换题目时，清除旧的防抖定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current); // 清除旧定时器
      timerRef.current = null;        // 重置引用
    }

    // 检查新题目是否有草稿
    const payload = readDraft(draftKey); // 读取草稿
    if (payload) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasDraft(true);                              // 有草稿
      setSavedAt(new Date(payload.savedAt));           // 同步保存时间
    } else {
      setHasDraft(false);                             // 无草稿
      setSavedAt(null);                               // 重置保存时间
    }
  }, [draftKey]); // 依赖：草稿 key（paperId 或 questionId 变化时触发）

  /* ========== 效果：data 变化时防抖保存 ========== */

  useEffect(() => {
    // 清除上一次的防抖定时器
    if (timerRef.current) {
      clearTimeout(timerRef.current); // 清除旧定时器
    }

    // 设置新的防抖定时器
    timerRef.current = setTimeout(() => {
      writeDraft(draftKey, data);         // 写入草稿
      setSavedAt(new Date());             // 更新保存时间
      setHasDraft(true);                  // 标记有草稿
      timerRef.current = null;            // 清空定时器引用
    }, debounceMs);                       // 防抖延迟

    // 清理函数：组件卸载或依赖变化时清除定时器
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current); // 清除定时器
        timerRef.current = null;        // 重置引用
      }
    };
  }, [data, draftKey, debounceMs]); // 依赖：数据、key、防抖时间

  /* ========== 效果：beforeunload 页面关闭时强制保存 ========== */

  useEffect(() => {
    /**
     * beforeunload 事件处理函数
     * 页面关闭或刷新时，立即将最新数据保存到 localStorage
     */
    const handleBeforeUnload = () => {
      saveImmediately(draftKey); // 强制同步保存
    };

    window.addEventListener('beforeunload', handleBeforeUnload); // 注册事件

    // 清理函数：移除事件监听
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload); // 移除监听
    };
  }, [draftKey, saveImmediately]); // 依赖：key 和保存方法

  /* ========== 返回结果 ========== */

  return {
    savedAt,       // 上次保存时间
    hasDraft,      // 是否有草稿
    restoreDraft,  // 恢复草稿方法
    clearDraft,    // 清除草稿方法
  };
}
