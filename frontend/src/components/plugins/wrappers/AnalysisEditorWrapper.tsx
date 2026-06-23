/**
 * 解析内容编辑插件
 *
 * 功能：将原 ProofreadingWorkbench 内置的"解析内容"双栏编辑器剥离为插件
 * 挂载位置：analysis-editor
 * 输入参数：PluginProps（currentQuestion / onUpdateField）
 * 返回值：JSX 解析内容编辑区
 * 使用场景：校对工作台右栏"题目内容"下方的解析内容区
 *
 * 行为说明：
 *   - 复用 AnalysisEditor：左栏 textarea 编辑、右栏 PreviewRenderer 实时预览
 *   - 解析内容是 Markdown 格式（### 标题 / **加粗** / 1. 列表），不需 LaTeX 转换
 *   - 写回字段：analysis
 */
import type { PluginProps } from "@/types/plugin"
import AnalysisEditor from "@/components/question/AnalysisEditor"

export default function AnalysisEditorWrapper({
  currentQuestion,
  onUpdateField,
}: PluginProps) {
  return (
    <AnalysisEditor
      value={currentQuestion?.analysis || ""}
      onChange={(val) => onUpdateField("analysis", val)}
    />
  )
}
