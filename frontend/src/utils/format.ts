/**
 * 格式化工具函数
 *
 * 功能：提供日期、数字、文本、难度、题型等格式化方法
 * 输入参数：各函数独立定义，详见下方注释
 * 返回值：格式化后的字符串
 * 使用场景：列表展示、详情页渲染、数据导出等需要格式化显示的场景
 */

import { DIFFICULTY_MAP, QUESTION_TYPE_MAP } from './constants'; // 导入已有映射常量

/**
 * 日期格式化
 * 将 ISO 日期字符串格式化为 "YYYY-MM-DD HH:mm" 形式
 * @param dateStr - ISO 格式的日期字符串，如 "2026-01-15T14:30:00Z"
 * @returns 格式化后的日期字符串，如 "2026-01-15 14:30"；输入无效时返回 "-"
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'; // 空值兜底

  const date = new Date(dateStr); // 解析日期字符串
  if (isNaN(date.getTime())) return '-'; // 无效日期兜底

  const year = date.getFullYear();                        // 年
  const month = String(date.getMonth() + 1).padStart(2, '0'); // 月（补零）
  const day = String(date.getDate()).padStart(2, '0');        // 日（补零）
  const hours = String(date.getHours()).padStart(2, '0');     // 时（补零）
  const minutes = String(date.getMinutes()).padStart(2, '0'); // 分（补零）

  return `${year}-${month}-${day} ${hours}:${minutes}`; // 拼接格式化结果
}

/**
 * 数字千分位格式化
 * 将数字添加千分位分隔符，如 1234567 → "1,234,567"
 * @param num - 需要格式化的数字
 * @returns 千分位格式化的字符串；输入无效时返回 "0"
 */
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) return '0'; // 无效值兜底

  return num.toLocaleString('zh-CN'); // 使用中文区域设置进行千分位格式化
}

/**
 * 文本截断
 * 超出最大长度时截断并添加省略号
 * @param text - 原始文本
 * @param maxLen - 最大保留长度（默认 50）
 * @returns 截断后的文本，超出部分用 "..." 替代
 */
export function truncateText(text: string | null | undefined, maxLen: number = 50): string {
  if (!text) return ''; // 空值兜底
  if (text.length <= maxLen) return text; // 未超长直接返回

  return text.slice(0, maxLen) + '...'; // 截断并追加省略号
}

/**
 * 难度中文映射
 * 将难度英文键值映射为中文显示名
 * @param key - 难度键值，如 "simple"、"medium"、"hard"
 * @returns 中文难度名，如 "简单"、"中等"、"困难"；未知键值原样返回
 */
export function formatDifficulty(key: string | null | undefined): string {
  if (!key) return '-'; // 空值兜底

  return DIFFICULTY_MAP[key] || key; // 查映射表，未命中则返回原始键值
}

/**
 * 题型中文映射
 * 将题型英文键值映射为中文显示名
 * @param key - 题型键值，如 "fill"、"single"、"calc"
 * @returns 中文题型名，如 "填空题"、"选择题"、"计算题"；未知键值原样返回
 */
export function formatQuestionType(key: string | null | undefined): string {
  if (!key) return '-'; // 空值兜底

  return QUESTION_TYPE_MAP[key] || key; // 查映射表，未命中则返回原始键值
}
