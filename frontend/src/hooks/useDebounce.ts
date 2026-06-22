/**
 * 防抖 Hook
 *
 * 功能：对输入值进行防抖处理，延迟更新返回值
 * 输入参数：
 *   - value: 需要防抖的原始值（泛型 T）
 *   - delay: 防抖延迟时间（毫秒）
 * 返回值：防抖后的值，仅在 delay 时间内无新变化后才更新
 * 使用场景：搜索输入框、编辑区内容变化监听、窗口 resize 等
 */

import { useState, useEffect } from 'react';

/**
 * 防抖 Hook
 * 在指定延迟时间内，若值未发生变化，则返回最新值；否则重置计时
 * @param value - 需要防抖的原始值
 * @param delay - 防抖延迟时间（毫秒）
 * @returns 防抖后的值
 */
export function useDebounce<T>(value: T, delay: number): T {
  // 防抖后的值
  const [debouncedValue, setDebouncedValue] = useState<T>(value); // 初始化为原始值

  useEffect(() => {
    // 设置定时器，延迟更新防抖值
    const timer = setTimeout(() => {
      setDebouncedValue(value); // 延迟到达后更新为最新值
    }, delay);

    // 清理函数：每次 value 或 delay 变化时清除旧定时器
    return () => {
      clearTimeout(timer); // 清除上一次的定时器
    };
  }, [value, delay]); // 依赖：原始值和延迟时间

  return debouncedValue; // 返回防抖后的值
}
