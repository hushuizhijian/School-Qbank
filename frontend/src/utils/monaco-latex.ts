/**
 * Monaco Editor LaTeX 语言模式配置
 *
 * 功能：注册自定义 LaTeX 语言模式 + 浅色主题，支持 tasks.sty 语法高亮
 * 使用场景：DualPaneEditor 中 Monaco Editor 的语法高亮支持
 */

import * as monaco from "monaco-editor"

/** 是否已注册语言模式（防止重复注册） */
let registered = false

/**
 * 注册 LaTeX 自定义语言模式和浅色主题
 * 必须在 Monaco Editor 挂载前调用
 */
export function registerLatexLanguage() {
  if (registered) return
  registered = true

  // 注册自定义 LaTeX 语言
  monaco.languages.register({ id: "latex" })

  // 定义 LaTeX 语法高亮规则 — 支持 tasks.sty
  monaco.languages.setMonarchTokensProvider("latex", {
    tokenizer: {
      root: [
        // 数学环境标记
        [/\$\$/, "delimiter"],
        [/\$/, "delimiter"],
        // LaTeX 命令
        [/\\[a-zA-Z]+/, {
          cases: {
            // tasks.sty 环境命令
            "\\task": "tag",
            "\\begin": "keyword",
            "\\end": "keyword",
            // 数学命令
            "\\frac": "keyword",
            "\\sqrt": "keyword",
            "\\sum": "keyword",
            "\\int": "keyword",
            "\\prod": "keyword",
            "\\lim": "keyword",
            "\\sin": "keyword",
            "\\cos": "keyword",
            "\\tan": "keyword",
            "\\log": "keyword",
            "\\ln": "keyword",
            // 格式命令
            "\\text": "keyword",
            "\\textbf": "keyword",
            "\\emph": "keyword",
            "\\underline": "keyword",
            // 默认
            "@default": "keyword",
          },
        }],
        // 花括号
        [/[{}]/, "delimiter.bracket"],
        // 方括号
        [/[\[\]]/, "delimiter.array"],
        // 圆括号
        [/[()]/, "delimiter.parenthesis"],
        // 数字
        [/\d+(\.\d+)?/, "number"],
        // 注释
        [/%.*$/, "comment"],
        // 环境名称 \begin{xxx} / \end{xxx}
        [/\\begin\{/, "keyword", "@envName"],
        [/\\end\{/, "keyword", "@envName"],
      ],
      // 环境名称状态
      envName: [
        [/task/, "tag", "@pop"],
        [/tasks/, "tag", "@pop"],
        [/document/, "keyword", "@pop"],
        [/itemize/, "keyword", "@pop"],
        [/enumerate/, "keyword", "@pop"],
        [/align/, "keyword", "@pop"],
        [/equation/, "keyword", "@pop"],
        [/[a-zA-Z]+/, "variable", "@pop"],
        [/\}/, "delimiter.bracket", "@pop"],
      ],
    },
  })

  // 定义自定义浅色主题
  monaco.editor.defineTheme("custom-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "0000FF", fontStyle: "bold" },
      { token: "delimiter", foreground: "FF0000" },
      { token: "delimiter.bracket", foreground: "FFA500" },
      { token: "delimiter.array", foreground: "FFA500" },
      { token: "delimiter.parenthesis", foreground: "666666" },
      { token: "number", foreground: "098658" },
      { token: "comment", foreground: "008000", fontStyle: "italic" },
      { token: "tag", foreground: "795E26", fontStyle: "bold" },
      { token: "variable", foreground: "267F99" },
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#000000",
      "editor.lineHighlightBackground": "#F5F5F5",
      "editor.selectionBackground": "#ADD6FF",
    },
  })
}

/**
 * Monaco Editor 核心配置
 */
export const monacoConfig = {
  language: "latex",
  theme: "custom-light",
  fontSize: 14,
  lineNumbers: "on" as const,
  minimap: { enabled: false },
  wordWrap: "on" as const,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  fontLigatures: true,
}
