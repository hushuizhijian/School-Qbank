/**
 * MonacoEditorPanel — LaTeX 源码编辑面板
 *
 * 功能：封装 Monaco Editor，支持 LaTeX 语法高亮 + 低置信度高亮标注
 * 输入参数：
 *   value: string — LaTeX 源码内容
 *   onChange: (value: string) => void — 内容变更回调
 *   language?: string — 语言模式，默认 'latex'
 *   theme?: string — 主题，默认 'custom-light'
 *   height?: string | number — 编辑器高度，默认 '100%'
 *   readOnly?: boolean — 只读模式
 *   decorations?: Decoration[] — 低置信度高亮标注
 * 返回值：JSX Monaco Editor 包装组件
 * 使用场景：校对工作台双栏编辑器的源码编辑侧
 */
import { useRef, useEffect, useCallback } from "react"
import Editor, { type OnMount } from "@monaco-editor/react"
import type { editor as MonacoEditor } from "monaco-editor"
import { registerLatexLanguage, monacoConfig } from "@/utils/monaco-latex"

/** 低置信度高亮标注范围 */
export interface Decoration {
  /** 起始行号 */
  startLineNumber: number
  /** 起始列号 */
  startColumn: number
  /** 结束行号 */
  endLineNumber: number
  /** 结束列号 */
  endColumn: number
}

/** MonacoEditorPanel 组件属性 */
interface MonacoEditorPanelProps {
  /** LaTeX 源码内容 */
  value: string
  /** 内容变更回调 */
  onChange: (value: string) => void
  /** 语言模式，默认 'latex' */
  language?: string
  /** 主题，默认 'custom-light' */
  theme?: string
  /** 编辑器高度，默认 '100%' */
  height?: string | number
  /** 只读模式 */
  readOnly?: boolean
  /** 低置信度高亮标注 */
  decorations?: Decoration[]
}

/**
 * 将 Decoration 数组转换为 Monaco deltaDecorations 所需的格式
 * 每个标注使用黄色背景 + hover 提示
 */
function buildDecorationOptions(decorations: Decoration[]) {
  return decorations.map((d) => ({
    range: {
      startLineNumber: d.startLineNumber,
      startColumn: d.startColumn,
      endLineNumber: d.endLineNumber,
      endColumn: d.endColumn,
    },
    options: {
      inlineClassName: "low-confidence-highlight",
      hoverMessage: {
        value: "AI 置信度较低，请人工核对",
      },
    },
  }))
}

/** Monaco Editor LaTeX 源码编辑面板组件 */
export default function MonacoEditorPanel({
  value,
  onChange,
  language = "latex",
  theme = "custom-light",
  height = "100%",
  readOnly = false,
  decorations = [],
}: MonacoEditorPanelProps) {
  // 编辑器实例引用，用于管理 decorations
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  // 上一次 decorations ID，用于增量更新
  const decorationsIdsRef = useRef<string[]>([])

  /**
   * 编辑器挂载回调
   * 保存编辑器实例引用
   */
  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  /**
   * 编辑器挂载前回调
   * 注册 LaTeX 语言模式，必须在挂载前执行
   */
  const handleBeforeMount = useCallback(() => {
    registerLatexLanguage()
  }, [])

  /**
   * 当 decorations 变化时，通过 deltaDecorations 增量更新高亮标注
   * deltaDecorations 会自动清理旧标注并应用新标注
   */
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const newDecorations = buildDecorationOptions(decorations)
    decorationsIdsRef.current = editor.deltaDecorations(
      decorationsIdsRef.current,
      newDecorations
    )
  }, [decorations])

  // 合并默认配置与自定义选项
  const editorOptions: MonacoEditor.IStandaloneEditorConstructionOptions = {
    ...monacoConfig,
    readOnly,
  }

  return (
    <Editor
      height={height}
      language={language}
      theme={theme}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={editorOptions}
    />
  )
}
