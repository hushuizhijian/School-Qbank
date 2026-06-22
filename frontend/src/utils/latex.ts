/**
 * LaTeX 工具函数
 *
 * 功能：提供 LaTeX 公式的包裹、提取、校验和插入等操作
 * 输入参数：各函数独立定义，详见下方注释
 * 返回值：处理后的字符串或结构化数据
 * 使用场景：题目编辑器公式插入、公式内容提取与校验、LaTeX 渲染前处理
 */

/** LaTeX 提取结果项 */
export interface LatexMatch {
  type: 'inline' | 'block'; // 公式类型：行内或块级
  content: string;           // 公式内容（不含定界符）
  fullMatch: string;         // 完整匹配文本（含定界符）
  startIndex: number;        // 匹配起始位置
  endIndex: number;          // 匹配结束位置
}

/** LaTeX 校验结果 */
export interface LatexValidationResult {
  isValid: boolean;     // 是否通过校验
  errors: string[];     // 错误信息列表
}

/**
 * 行内 LaTeX 公式包裹
 * 将文本用 $...$ 标记包裹为行内公式
 * @param text - 需要包裹的公式文本
 * @returns 包裹后的行内公式字符串，如 "$E=mc^2$"
 */
export function wrapInlineLatex(text: string): string {
  if (!text) return ''; // 空值兜底

  return `$${text}$`; // 用 $ 包裹
}

/**
 * 块级 LaTeX 公式包裹
 * 将文本用 $$...$$ 标记包裹为块级公式
 * @param text - 需要包裹的公式文本
 * @returns 包裹后的块级公式字符串，如 "$$\nE=mc^2\n$$"
 */
export function wrapBlockLatex(text: string): string {
  if (!text) return ''; // 空值兜底

  return `$$\n${text}\n$$`; // 用 $$ 包裹并换行
}

/**
 * 从文本中提取所有 LaTeX 公式
 * 同时匹配块级公式（$$...$$）和行内公式（$...$），块级优先
 * @param text - 包含 LaTeX 公式的原始文本
 * @returns 提取结果数组，按出现顺序排列
 */
export function extractLatex(text: string): LatexMatch[] {
  if (!text) return []; // 空值兜底

  const results: LatexMatch[] = []; // 收集所有匹配结果

  // 块级公式正则：$$...$$，非贪婪匹配
  const blockRegex = /\$\$([\s\S]*?)\$\$/g; // 块级公式匹配
  // 行内公式正则：$...$，排除 $$ 开头，非贪婪匹配
  const inlineRegex = /(?<!\$)\$(?!\$)(.*?)\$(?!\$)/g; // 行内公式匹配

  // 先提取块级公式
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(text)) !== null) {
    results.push({
      type: 'block',                              // 块级类型
      content: blockMatch[1].trim(),               // 去除首尾空白
      fullMatch: blockMatch[0],                    // 完整匹配
      startIndex: blockMatch.index,                // 起始位置
      endIndex: blockMatch.index + blockMatch[0].length, // 结束位置
    });
  }

  // 再提取行内公式
  let inlineMatch: RegExpExecArray | null;
  while ((inlineMatch = inlineRegex.exec(text)) !== null) {
    results.push({
      type: 'inline',                               // 行内类型
      content: inlineMatch[1].trim(),                // 去除首尾空白
      fullMatch: inlineMatch[0],                     // 完整匹配
      startIndex: inlineMatch.index,                 // 起始位置
      endIndex: inlineMatch.index + inlineMatch[0].length, // 结束位置
    });
  }

  // 按起始位置排序，保证出现顺序一致
  results.sort((a, b) => a.startIndex - b.startIndex); // 升序排列

  return results; // 返回提取结果
}

/**
 * 基础 LaTeX 语法校验
 * 检查括号匹配、环境开闭等常见语法问题
 * @param latex - LaTeX 公式字符串
 * @returns 校验结果，包含是否通过和错误信息列表
 */
export function validateLatex(latex: string): LatexValidationResult {
  if (!latex) {
    return { isValid: false, errors: ['公式内容为空'] }; // 空值校验
  }

  const errors: string[] = []; // 收集错误信息

  // 括号匹配校验
  const bracketPairs: Record<string, string> = {
    '{': '}',   // 花括号
    '[': ']',   // 方括号
    '(': ')',   // 圆括号
  };
  const openBrackets = Object.keys(bracketPairs); // 开括号列表
  const closeBrackets = Object.values(bracketPairs); // 闭括号列表
  const stack: string[] = []; // 括号匹配栈

  for (const char of latex) {
    if (openBrackets.includes(char)) {
      stack.push(char); // 遇到开括号入栈
    } else if (closeBrackets.includes(char)) {
      const lastOpen = stack.pop(); // 遇到闭括号弹出栈顶
      if (!lastOpen) {
        errors.push(`多余的闭括号 "${char}"`); // 栈为空说明多余闭括号
      } else if (bracketPairs[lastOpen] !== char) {
        errors.push(`括号不匹配：期望 "${bracketPairs[lastOpen]}"，实际 "${char}"`); // 类型不匹配
      }
    }
  }

  // 栈中剩余的开括号未闭合
  for (const unclosed of stack) {
    errors.push(`未闭合的括号 "${unclosed}"`); // 缺少对应闭括号
  }

  // 环境开闭校验：\begin{...} 与 \end{...} 匹配
  const beginRegex = /\\begin\{(\w+)\}/g;   // 匹配 \begin{env}
  const endRegex = /\\end\{(\w+)\}/g;       // 匹配 \end{env}
  const beginEnvs: string[] = []; // 收集 \begin 环境名
  const endEnvs: string[] = [];   // 收集 \end 环境名

  let beginMatch: RegExpExecArray | null;
  while ((beginMatch = beginRegex.exec(latex)) !== null) {
    beginEnvs.push(beginMatch[1]); // 记录环境名
  }

  let endMatch: RegExpExecArray | null;
  while ((endMatch = endRegex.exec(latex)) !== null) {
    endEnvs.push(endMatch[1]); // 记录环境名
  }

  // 检查环境数量是否一致
  if (beginEnvs.length !== endEnvs.length) {
    errors.push(`环境数量不匹配：\\begin 有 ${beginEnvs.length} 个，\\end 有 ${endEnvs.length} 个`); // 数量不一致
  }

  // 逐个检查环境名是否对应（按顺序配对）
  const envCount = Math.min(beginEnvs.length, endEnvs.length); // 取较小值
  for (let i = 0; i < envCount; i++) {
    if (beginEnvs[i] !== endEnvs[i]) {
      errors.push(`环境不匹配：\\begin{${beginEnvs[i]}} 对应 \\end{${endEnvs[i]}}`); // 环境名不一致
    }
  }

  return {
    isValid: errors.length === 0, // 无错误则通过
    errors,                       // 错误列表
  };
}

/**
 * 在指定光标位置插入 LaTeX 公式
 * @param text - 原始文本
 * @param latex - 需要插入的 LaTeX 公式
 * @param cursorPos - 光标位置（字符索引）
 * @returns 插入后的文本和新光标位置
 */
export function insertLatexAtCursor(
  text: string,
  latex: string,
  cursorPos: number
): { text: string; cursorPos: number } {
  if (!text && !latex) return { text: '', cursorPos: 0 }; // 双空值兜底
  if (!latex) return { text, cursorPos }; // 无插入内容直接返回

  const safeText = text || ''; // 文本空值兜底
  const safePos = Math.max(0, Math.min(cursorPos, safeText.length)); // 光标位置边界修正

  const before = safeText.slice(0, safePos); // 光标前文本
  const after = safeText.slice(safePos);      // 光标后文本

  const newText = before + latex + after; // 拼接插入结果
  const newCursorPos = safePos + latex.length; // 新光标位于插入内容末尾

  return {
    text: newText,         // 插入后的完整文本
    cursorPos: newCursorPos, // 新光标位置
  };
}
