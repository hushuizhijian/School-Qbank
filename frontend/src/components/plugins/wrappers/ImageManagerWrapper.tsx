/**
 * 题图管理插件包装器
 *
 * 功能：将原 ProofreadingWorkbench 内置的"题图管理"面板剥离为独立插件
 * 挂载位置：image-manager（中栏，AttributePanel 下方）
 * 输入参数：PluginProps（currentQuestion / onUpdateField）
 * 返回值：JSX 题图管理面板
 * 使用场景：校对工作台中栏，题目内容右栏展示前的图片上传/编辑入口
 *
 * 行为说明：
 *   - 复用 ImageManagerPanel：拖拽/点击上传、排版模式切换、预览、删除、旋转
 *   - 写入字段：images（与原 AttributePanel 行为一致）
 *   - 转换适配：question.images (string[] | object[]) ↔ QuestionImage[]
 */
import type { PluginProps } from "@/types/plugin"
import ImageManagerPanel, { toQuestionImages, toStringImages } from "@/components/question/ImageManagerPanel"

export default function ImageManagerWrapper({
  currentQuestion,
  onUpdateField,
}: PluginProps) {
  // 无选中题目时不渲染
  if (!currentQuestion) return null

  return (
    <ImageManagerPanel
      questionId={currentQuestion.id}
      images={toQuestionImages(currentQuestion.images as unknown[])} // 后端两种格式都兼容
      onImagesChange={(imgs) => onUpdateField("images", toStringImages(imgs))} // 写回 images 字段
      layoutMode="auto"
    />
  )
}
