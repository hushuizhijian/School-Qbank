/**
 * 快捷键 Hook
 *
 * 功能：注册和管理键盘快捷键组合，组件卸载时自动清理事件监听
 * 输入参数：
 *   - shortcutMap: 快捷键映射表，键为快捷键组合字符串，值为回调函数
 *     快捷键组合格式：使用 "+" 连接修饰键和按键，如 "Ctrl+S"、"ArrowUp"、"Ctrl+Shift+N"
 *     支持的修饰键：Ctrl、Shift、Alt、Meta
 * 返回值：无
 * 使用场景：题目切换（ArrowUp/ArrowDown）、保存操作（Ctrl+S）、快速导航等
 */

import { useEffect } from 'react';

/** 快捷键映射表类型：键为快捷键组合，值为回调函数 */
export type ShortcutMap = Record<string, () => void>;

/** 支持的修饰键集合 */
const MODIFIER_KEYS = new Set(['ctrl', 'shift', 'alt', 'meta']); // 修饰键名单

/**
 * 解析快捷键组合字符串为结构化对象
 * @param keyCombo - 快捷键组合字符串，如 "Ctrl+S"、"ArrowUp"
 * @returns 包含修饰键状态和主键的对象
 */
function parseKeyCombo(keyCombo: string): {
  ctrl: boolean;   // 是否需要 Ctrl 键
  shift: boolean;  // 是否需要 Shift 键
  alt: boolean;    // 是否需要 Alt 键
  meta: boolean;   // 是否需要 Meta 键
  key: string;     // 主键名
} {
  const parts = keyCombo.split('+').map((part) => part.trim().toLowerCase()); // 拆分并转小写

  const ctrl = parts.includes('ctrl');   // 检测 Ctrl 修饰键
  const shift = parts.includes('shift'); // 检测 Shift 修饰键
  const alt = parts.includes('alt');     // 检测 Alt 修饰键
  const meta = parts.includes('meta');   // 检测 Meta 修饰键

  // 找出非修饰键的部分作为主键
  const mainKey = parts.find((part) => !MODIFIER_KEYS.has(part)); // 提取主键

  return {
    ctrl,
    shift,
    alt,
    meta,
    key: mainKey || '', // 主键，若无则默认空字符串
  };
}

/**
 * 判断键盘事件是否匹配指定快捷键组合
 * @param event - 原生键盘事件
 * @param parsed - 解析后的快捷键结构
 * @returns 是否匹配
 */
function matchShortcut(
  event: KeyboardEvent,
  parsed: ReturnType<typeof parseKeyCombo>
): boolean {
  // 逐项比较修饰键状态和主键名
  const ctrlMatch = event.ctrlKey === parsed.ctrl;     // Ctrl 键状态匹配
  const shiftMatch = event.shiftKey === parsed.shift;  // Shift 键状态匹配
  const altMatch = event.altKey === parsed.alt;        // Alt 键状态匹配
  const metaMatch = event.metaKey === parsed.meta;     // Meta 键状态匹配
  const keyMatch = event.key.toLowerCase() === parsed.key; // 主键名匹配

  return ctrlMatch && shiftMatch && altMatch && metaMatch && keyMatch; // 全部匹配才返回 true
}

/**
 * 快捷键 Hook
 * 注册快捷键映射表，监听键盘事件并触发对应回调，组件卸载时自动清理
 * @param shortcutMap - 快捷键映射表，如 { "Ctrl+S": handleSave, "ArrowUp": goPrev }
 */
export function useKeyboardShortcuts(shortcutMap: ShortcutMap): void {
  useEffect(() => {
    /**
     * 键盘事件处理函数
     * 遍历快捷键映射表，匹配则执行回调并阻止默认行为
     */
    function handleKeyDown(event: KeyboardEvent): void {
      // 遍历所有注册的快捷键组合
      for (const [keyCombo, callback] of Object.entries(shortcutMap)) {
        const parsed = parseKeyCombo(keyCombo); // 解析快捷键组合
        if (matchShortcut(event, parsed)) {
          event.preventDefault(); // 阻止浏览器默认行为
          callback();             // 执行注册的回调
          return;                 // 匹配到第一个即返回，避免重复触发
        }
      }
    }

    // 注册全局键盘事件监听
    window.addEventListener('keydown', handleKeyDown); // 绑定事件

    // 清理函数：组件卸载时移除事件监听
    return () => {
      window.removeEventListener('keydown', handleKeyDown); // 解绑事件
    };
  }, [shortcutMap]); // 依赖：快捷键映射表变化时重新绑定
}
