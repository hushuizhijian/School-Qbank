/**
 * PDF 导出工具 — 所见即所得（WYSIWYG）
 *
 * 核心原理：使用 html2canvas 直接捕获画布 DOM 元素的视觉外观，
 * 再用 jsPDF 将捕获的图片嵌入 PDF 页面。不依赖后端重建布局，
 * 真正做到"web 画布上看到什么，PDF 就导出什么"。
 *
 * 功能：
 *  - 捕获指定的 DOM 元素为高清图片
 *  - 按 A4 / A3 纸张尺寸生成 PDF
 *  - 支持多页：多个捕获元素 → 多页 PDF
 *  - 自动处理画布 CSS transform: scale() 的补偿
 *
 * 输入参数：见 exportCanvasToPdf
 * 返回值：Promise<void> — 完成后自动触发浏览器下载
 *
 * 使用场景：HomeworkComposePage 中点击"导出 PDF"按钮
 */
import html2canvas from "html2canvas-pro"
import { jsPDF } from "jspdf"

/**
 * 纸张尺寸定义（mm）
 * 前端画布使用 96dpi：1mm ≈ 3.78px
 */
const PAPER_SIZES: Record<string, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
}

/**
 * 将画布 DOM 元素导出为 PDF 文件
 *
 * 输入参数：
 *  - elements: HTMLElement[] — 要捕获的 DOM 元素列表（每个元素对应一页 PDF）
 *  - paperSize: "A3" | "A4" — 纸张尺寸
 *  - canvasScale: number — 画布 CSS transform: scale() 值
 *  - filename: string — 下载文件名（不含 .pdf 后缀）
 * 返回值：Promise<void> — 完成后浏览器自动下载 PDF
 */
export async function exportCanvasToPdf(
  elements: HTMLElement[],
  paperSize: "A3" | "A4",
  canvasScale: number,
  filename: string,
): Promise<void> {
  if (elements.length === 0) {
    throw new Error("未找到可导出的画布元素")
  }

  const paper = PAPER_SIZES[paperSize]
  // 捕获分辨率：目标 3× 物理分辨率以保证打印清晰度
  // PaperPreview 使用 transform: scale(canvasScale)，视觉尺寸 = 物理尺寸 × canvasScale
  // 因此需要 3 / canvasScale 才能达到 3× 物理分辨率
  // PaginationPreview 不使用 CSS transform，canvasScale 传 1 即可
  const captureScale = Math.max(2, 3 / canvasScale)

  // 逐页捕获
  const images: string[] = []
  for (const el of elements) {
    // 临时移除阴影和边框，PDF 不需要这些编辑器装饰
    const origClasses = el.className
    el.classList.remove("shadow-2xl", "shadow-lg", "shadow-md", "shadow-sm")
    const origBorder = el.style.border
    el.style.border = "none"

    try {
      const canvas = await html2canvas(el, {
        scale: captureScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      })
      images.push(canvas.toDataURL("image/png"))
    } finally {
      // 恢复原始样式
      el.className = origClasses
      el.style.border = origBorder
    }
  }

  // 创建 PDF
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: paperSize === "A3" ? "a3" : "a4",
  })

  // 逐页添加图片
  for (let i = 0; i < images.length; i++) {
    if (i > 0) {
      pdf.addPage()
    }
    // 图片填充整页（0 边距），确保画布视觉与 PDF 页面完全一致
    pdf.addImage(
      images[i],
      "PNG",
      0, 0,
      paper.width, paper.height,
      undefined, // alias
      "FAST", // 压缩模式，减少文件体积
    )
  }

  pdf.save(`${filename}.pdf`)
}