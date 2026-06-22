/**
 * 试卷纸张预览组件（独立可复用）
 *
 * 功能：渲染试卷纸张预览，支持
 *  - 页眉/Logo 独立可拖拽 + 等比缩放
 *  - 标题/学科/年级/姓名班级/水印
 *  - 缩放因子：可在列表页用更小 scale 渲染成微型卡片
 *  - 只读模式（readOnly）：禁用 DraggableResizable 的拖拽/缩放交互
 *
 * 输入参数：见 PaperPreviewProps
 * 返回值：纸张预览节点
 *
 * 使用场景：
 *  - HomeworkComposePage 中作为主画布预览
 *  - HomeworkListPage 中作为列表卡片（readOnly=true, scale=0.15~0.2）
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/utils/cn"
import type { Homework, HomeworkPageConfig, ElementBox } from "@/types/homework"

export interface PaperPreviewProps {
  paperSize: "A3" | "A4"
  pageConfig: HomeworkPageConfig
  homework: Homework
  children?: React.ReactNode
  fontSizes: {
    title: number
    info: number
    question: number
    header: number
    footer: number
    watermark: number
  }
  /** 显示缩放因子：A3=0.6, A4=0.78（仅控制屏幕显示大小，不影响物理尺寸） */
  scale: number
  /** 外层显示宽度（屏幕 px）= 物理宽度 × scale */
  displayWidth: number
  /** 外层显示高度（屏幕 px）= 物理高度 × scale */
  displayHeight: number
  /** 字段变更回调：用于页眉/Logo 位置变更 */
  onFieldChange?: (field: "page_config_field", value: { key: keyof HomeworkPageConfig; value: unknown }) => void
  /** 只读模式：禁用拖拽/缩放（列表页微型卡片用） */
  readOnly?: boolean
}

/**
 * 试卷纸张预览容器
 *
 * 关键改造点（图一需求）：
 *  1. 页眉/Logo 区域为可独立拖拽元素
 *  2. 元素间互不干扰：DraggableResizable 各自独立 state
 *  3. 限定在画布纸张范围内
 *  4. 添加时不出现横线：默认无 border-b
 */
export default function PaperPreview({
  paperSize,
  pageConfig,
  homework,
  children,
  fontSizes,
  scale,
  displayWidth,
  displayHeight,
  onFieldChange,
  readOnly = false,
}: PaperPreviewProps) {
  // A3 双列 / A4 单列 视觉参数
  // 需求（画布优化）：与 PDF 服务保持一致 —— 需求 1：页眉/Logo 区域为可独立拖拽元素
  // 需求（留白优化）：减小 A4 左右留白，从 22+20=42mm 降到 15+15=30mm（占 14% 而非 20%）
  const isA3 = paperSize === "A3"
  const marginL = isA3 ? 18 : 15
  const marginR = isA3 ? 18 : 15
  const marginT = isA3 ? 22 : 20
  const marginB = isA3 ? 18 : 15

  // 计算水印网格
  // 需求（画布优化）：修正水印在画布中不显示的问题：
  //   1. 字号公式去掉 *scale 折扣（画布物理尺寸下字号直接用配置值）
  //   2. 默认不透明度从 0.08 提到 0.15（仍可在 PDF 中保持原值，画布预览更清晰）
  //   3. 颜色用更深的 slate-400 而非 slate-300，确保画布缩放下仍可见
  //   4. 画布与 PDF 中水印字号均使用配置值（CSS px 语义），
  //      后端按 0.75/scale 换算为 pt，前端画布直接渲染为 CSS px
  const watermarkOpacity = pageConfig.watermark_opacity ?? 0.08
  // 画布预览时让水印更醒目：最少 0.12 透明度（用户可调到 0.5 实际值在 PDF 中是 0.5）
  const previewWatermarkOpacity = Math.max(watermarkOpacity, 0.12)
  const watermarkGrid = pageConfig.watermark_text ? (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 3 * 2 }).map((_, i) => {
        const row = Math.floor(i / 2)
        const col = i % 2
        return (
          <div
            key={i}
            className="absolute text-slate-400 font-bold select-none whitespace-nowrap"
            style={{
              left: `${(25 + col * 50)}%`,
              top: `${(20 + row * 30)}%`,
              transform: `translate(-50%, -50%) rotate(${pageConfig.watermark_angle ?? -30}deg)`,
              // 需求（PDF 1:1 还原）：画布字号直接用配置值（CSS px），
              // 画布物理尺寸 = 字号 / 96 inch；PDF 物理尺寸 = (字号 × 0.75 / scale) / 72 inch
              // → 画布 / PDF = scale（A4=0.78, A3=0.6）
              // 因此画布字号需要除以 scale 才能与 PDF 物理一致
              fontSize: `${fontSizes.watermark / scale}px`,
              opacity: previewWatermarkOpacity,
            }}
          >
            {pageConfig.watermark_text}
          </div>
        )
      })}
    </div>
  ) : null

  // 物理像素尺寸 = 1:1 物理毫米尺寸（96dpi：1mm ≈ 3.78px）
  // 需求（PDF 1:1 还原）：画布 width/height 直接用 mm × 3.78，
  //   与 PDF 物理尺寸严格一致；显示比例交给外层 transform: scale 处理
  const pageWidthMm = isA3 ? 297 : 210
  const pageHeightMm = isA3 ? 420 : 297
  const physicalWidth = pageWidthMm * 3.78
  const physicalHeight = pageHeightMm * 3.78
  // 防御性检查：displayWidth / displayHeight 应与 physicalWidth × scale 一致
  // 若上游传值不一致（例如列表卡片用更小 scale），按实际值兜底
  const safeDisplayWidth = displayWidth || physicalWidth * scale
  const safeDisplayHeight = displayHeight || physicalHeight * scale
  // contentWidth/Height 占位说明：物理尺寸下保留两个变量便于将来辅助线使用
  const contentWidth = physicalWidth - (marginL + marginR) * 3.78
  const contentHeight = physicalHeight - (marginT + marginB) * 3.78
  void contentWidth
  void contentHeight

  /* ---------- 页眉 + Logo 区域改造为可独立拖拽元素 ---------- */

  /**
   * 更新可移动元素位置
   * 输入参数：type - "header" | "logo" | "title"；box - 新的 ElementBox
   * 返回值：无
   * 触发：onFieldChange 走原有自动保存链路
   * 需求（图层化）：标题、页眉、Logo 三个独立元素都支持任意移动
   */
  const handleElementChange = (type: "header" | "logo" | "title", box: ElementBox) => {
    if (!onFieldChange) return
    const key = type === "logo" ? "logo_box" : type === "title" ? "title_box" : "header_box"
    onFieldChange("page_config_field", { key, value: box })
  }

  /**
   * 获取 Logo 元素的默认尺寸（基于 logo_width 按 4:1 比例，紧贴内容）
   * 输入参数：无
   * 返回值：{ width, height } 默认宽高（物理像素 px）
   * 说明：Logo 通常为宽矩形（4:1 比例是常见校徽/标识的宽高比），
   *       若用户在右侧"宽度"调整 logo_width，这里也按比例更新 height
   * 需求（PDF 1:1 还原）：box 坐标使用物理像素（mm × 3.78），
   *   logo_width 字段语义为 mm，转换为物理像素 = mm × 3.78
   */
  const getDefaultLogoSize = useCallback(() => {
    const w = (pageConfig.logo_width ?? 18) * 3.78
    return { width: w, height: w / 4 }
  }, [pageConfig.logo_width])

  // Logo 真实宽高比（图片加载后填充）
  // 用于让 logo_box 默认尺寸贴合实际图片，而不是按 4:1 估算
  // 实现说明：用 useState + 异步 onload 回调，避免在 effect 主体内同步 setState
  const [logoAspect, setLogoAspect] = useState<number | null>(null)
  useEffect(() => {
    if (!pageConfig.logo_url) {
      // 用 queueMicrotask 推迟到下一 microtask，避免同步 setState 触发级联渲染
      queueMicrotask(() => setLogoAspect(null))
      return
    }
    const img = new window.Image()
    img.onload = () => {
      // onload 是异步回调，此处 setState 合规
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setLogoAspect(img.naturalWidth / img.naturalHeight)
      }
    }
    img.onerror = () => {
      // 加载失败时也通过异步回调清理
      queueMicrotask(() => setLogoAspect(null))
    }
    img.src = pageConfig.logo_url
  }, [pageConfig.logo_url])

  // 页眉元素默认位置/大小（如果未配置）：左上角对齐，紧贴文字（文字宽度自适应）
  // 需求（画布优化）：默认宽高按字号大小估算（约 8 个汉字宽），而不是铺满整个内容区
  // 需求（拖动优化）：默认最小高度改为 40px，确保拖拽区域足够大，不再难抓取
  // 需求（PDF 1:1 还原）：box 坐标使用物理像素（mm × 3.78），
  //   默认宽度按字号估算：约 8 个汉字宽度 = headerFontSize × 8
  //   默认高度 = 字号 + 少量内边距（紧贴文字），最小 40px 保证可拖拽
  const headerBox: ElementBox = pageConfig.header_box ?? {
    x: 0,
    y: 0,
    width: Math.max(80, fontSizes.header * 8),
    height: Math.max(40, fontSizes.header * 1.4),
  }
  // Logo 元素默认位置/大小（如果未配置）：紧贴内容，按图片实际宽高比（或 4:1 默认）
  // 需求（画布优化）：默认 height 由 logo_width 推算（不再硬编码为 20*scale），
  // 框四周收紧到 Logo 内容，元素之间不再有大量空白
  // 需求（联动）：logo_width 改变时同步更新 logo_box 宽高（保持位置不变），
  // 确保在右侧面板调整"宽度"滑块时 Logo 即时放大/缩小
  const defaultLogoSize = getDefaultLogoSize()
  const logoBoxFromConfig = pageConfig.logo_box
  const logoBox: ElementBox = logoBoxFromConfig
    ? {
        // 保留 x/y 位置，但宽高从 logo_width 推导（与右侧面板联动）
        x: logoBoxFromConfig.x,
        y: logoBoxFromConfig.y,
        width: defaultLogoSize.width,
        height: defaultLogoSize.width / (logoAspect ?? 4),
        show: logoBoxFromConfig.show,
        locked: logoBoxFromConfig.locked,
        z_index: logoBoxFromConfig.z_index,
      }
    : {
        x: 0,
        y: 0,
        width: defaultLogoSize.width,
        height: defaultLogoSize.width / (logoAspect ?? 4),
      }
  // 试卷标题元素默认位置/大小（如果未配置）：
  //   - 默认 x = 纸张物理宽度 / 2 - 估算标题宽度 / 2（居中）
  //   - 默认 y = 8mm（顶部留白）
  //   - 默认宽度 = 标题字号 × 12（约 12 个汉字宽，覆盖大多数试卷标题）
  //   - 默认高度 = 字号 × 1.8 + 信息栏高
  // 需求（PDF 1:1 还原）：box 坐标使用物理像素（mm × 3.78），
  //   字号直接用 CSS px，不再乘 scale；画布物理尺寸 = 字号 / 96 inch，
  //   PDF 物理尺寸 = (字号 × 0.75) / 72 inch，两者完全一致
  const titleWidthDefault = Math.max(180, fontSizes.title * 12)
  const titleHeightDefault = fontSizes.title * 1.8 + 18 * 3.78
  const titleBox: ElementBox = pageConfig.title_box ?? {
    x: (physicalWidth - titleWidthDefault) / 2,
    y: 8 * 3.78,
    width: titleWidthDefault,
    height: titleHeightDefault,
  }

  // 是否显示页眉/Logo（用 page_config 上的 show 控制，默认 true）
  const showHeader = headerBox.show !== false
  const showLogo = logoBox.show !== false && !!pageConfig.logo_url
  // 标题始终显示（除非用户显式隐藏）；标题为空时显示占位"（未命名试卷）"以提示用户
  const showTitle = titleBox.show !== false

  /* ---------- 图层化渲染：按 z_index 顺序自下而上叠加 ---------- */

  /**
   * 图层描述符：定义一个可独立拖拽/缩放的图层
   *
   * 字段：
   *  - id: 图层唯一标识
   *  - type: 类型（"header" | "logo" | "title"）
   *  - box: 元素位置/大小/层级
   *  - visible: 是否显示（false 时跳过渲染）
   *  - content: 渲染函数（接收 width/height 返回 ReactNode）
   *  - keepAspect: 是否保持宽高比
   *  - minWidth/minHeight: 最小尺寸
   *  - label: 图层名称（用于工具提示）
   */
  interface LayerDescriptor {
    id: string
    type: "header" | "logo" | "title"
    box: ElementBox
    visible: boolean
    content: (w: number, h: number) => React.ReactNode
    keepAspect: boolean
    minWidth: number
    minHeight: number
    label: string
  }

  /**
   * 计算图层的 z_index：未配置时按类型给出默认值
   * 默认顺序（自下而上）：标题 (5) < 页眉 (10) < Logo (20)
   * 数值越大越靠上层
   */
  const resolveZ = (box: ElementBox, fallback: number): number => {
    return typeof box.z_index === "number" ? box.z_index : fallback
  }

  // 构造图层列表
  const layers: LayerDescriptor[] = []
  // 标题图层：试卷主标题 + 学科年级行 + 姓名班级行（一体化拖拽）
  // 需求（PDF 1:1 还原）：画布字号 = 配置值 / scale，
  //   推导：画布物理 = fontSize_canvas / 96 inch；
  //         PDF 物理 = (fontSize_config × 0.75 / scale) / 72 inch；
  //   1:1 一致 → fontSize_canvas = fontSize_config / scale
  if (showTitle) {
    layers.push({
      id: "title",
      type: "title",
      box: titleBox,
      visible: true,
      keepAspect: false,
      minWidth: 120,
      minHeight: 40,
      label: "试卷标题",
      content: (_w, _h) => (
        <div
          className="w-full h-full flex flex-col items-center justify-center text-center overflow-hidden"
          style={{
            fontSize: `${fontSizes.title / scale}px`,
            // 需求（PDF 1:1 还原）：行高统一 1.45，与后端 _LINE_HEIGHT_RATIO 一致
            lineHeight: 1.45,
          }}
        >
          <div className="font-bold text-slate-900 leading-tight">
            {homework.title || "（未命名试卷）"}
          </div>
          {homework.subject && (
            <div
              className="mt-0.5 text-slate-500"
              style={{ fontSize: `${fontSizes.info / scale * 0.8}px` }}
            >
              {homework.subject} · {homework.grade}
            </div>
          )}
        </div>
      ),
    })
  }
  if (showHeader && (pageConfig.header_text || pageConfig.logo_url)) {
    layers.push({
      id: "header",
      type: "header",
      box: headerBox,
      visible: true,
      keepAspect: false,
      minWidth: 40,
      minHeight: 16,
      label: "页眉",
      content: (_w, _h) => (
        <div
          className="w-full h-full flex items-center justify-center text-slate-700 font-medium text-center overflow-hidden"
          style={{
            fontSize: `${fontSizes.header / scale}px`,
            // 需求（PDF 1:1 还原）：行高统一 1.45
            lineHeight: 1.45,
          }}
        >
          {pageConfig.header_text || ""}
        </div>
      ),
    })
  }
  if (showLogo) {
    layers.push({
      id: "logo",
      type: "logo",
      box: logoBox,
      visible: true,
      keepAspect: true,
      minWidth: 12,
      minHeight: 12,
      label: "Logo",
      content: () => (
        <img
          src={pageConfig.logo_url}
          alt="logo"
          className="w-full h-full object-contain select-none"
          draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
        />
      ),
    })
  }

  // 按 z_index 升序排序：z 小的先渲染（在底层），z 大的后渲染（在顶层）
  // 同 z 时按 id 字典序，保证渲染稳定
  const Z_FALLBACK: Record<string, number> = { title: 5, header: 10, logo: 20 }
  const sortedLayers = [...layers]
    .filter((l) => l.visible)
    .sort((a, b) => {
      const za = resolveZ(a.box, Z_FALLBACK[a.type] ?? 0)
      const zb = resolveZ(b.box, Z_FALLBACK[b.type] ?? 0)
      if (za !== zb) return za - zb
      return a.id.localeCompare(b.id)
    })

  return (
    // 需求（PDF 1:1 还原）：外层用屏幕显示尺寸（物理像素 × scale），
    //   内层纸张用物理像素尺寸（mm × 3.78）+ transform: scale(scale) 缩放；
    //   这样画布的物理尺寸与 PDF 严格 1:1，所有 box 坐标无需缩放换算
    <div
      className="relative"
      style={{
        width: `${safeDisplayWidth}px`,
        height: `${safeDisplayHeight}px`,
        overflow: "hidden",
      }}
    >
      <div
        className="relative bg-white shadow-2xl border border-slate-200"
        data-pdf-export-target=""
        style={{
          // 物理像素尺寸（A4: 794×1123, A3: 1122×1588），与 PDF 严格 1:1
          width: `${physicalWidth}px`,
          height: `${physicalHeight}px`,
          padding: `${marginT * 3.78}px ${marginR * 3.78}px ${marginB * 3.78}px ${marginL * 3.78}px`,
          boxSizing: "border-box",
          // 外层容器负责显示缩放，物理尺寸由内层维持
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
      {watermarkGrid}

      {/* 需求 1：所有可移动元素（标题 + 页眉 + Logo）以图层方式渲染，
          按 z_index 升序自下而上叠加；用户可在 A4 画布上自由拖动、缩放。
          boundsWidth/boundsHeight 使用物理像素（= physicalWidth / physicalHeight），
          拖拽时通过 displayScale 把屏幕坐标差值转换为物理坐标差值。 */}
      {sortedLayers.map((layer) => (
        <DraggableResizable
          key={layer.id}
          box={layer.box}
          boundsWidth={physicalWidth}
          boundsHeight={physicalHeight}
          displayScale={scale}
          onChange={(b) => handleElementChange(layer.type, b)}
          keepAspect={layer.keepAspect}
          minWidth={layer.minWidth}
          minHeight={layer.minHeight}
          readOnly={readOnly}
          renderContent={layer.content}
          label={layer.label}
        />
      ))}

      {/* 试卷标题已被改造为 DraggableResizable 独立图层（见上），
          此处不再渲染文档流标题。 */}

      {/* 正文内容（直接渲染 children，单列/双列由 children 自身处理） */}
      <div className="relative">{children}</div>
      </div>
    </div>
  )
}

/**
 * 通用：可拖拽 + 可缩放元素
 *
 * 行为说明：
 *  - 拖拽：mousedown on body → mousemove 改 x/y → mouseup 结束
 *  - 缩放：mousedown on 右下角 handle → mousemove 改 width/height → mouseup 结束
 *  - 边界 clamp：拖拽/缩放时实时限制在 [0, bounds] 范围内
 *  - 键盘：聚焦后方向键微调（10px / 1px with shift）
 *  - 元素间互不干扰：每个实例独立的事件处理
 *  - 只读模式（readOnly=true）：禁用所有交互
 *  - 锁定模式（box.locked=true）：禁用所有交互但保持 hover/选中样式便于管理层识别
 */
export function DraggableResizable({
  box,
  boundsWidth,
  boundsHeight,
  displayScale = 1,
  onChange,
  keepAspect = false,
  minWidth = 16,
  minHeight = 16,
  renderContent,
  label = "",
  readOnly = false,
}: {
  box: ElementBox
  boundsWidth: number
  boundsHeight: number
  /** 显示缩放因子：屏幕坐标到物理坐标的换算系数（>= 1）。
   * 需求（PDF 1:1 还原）：画布使用 transform: scale(displayScale) 缩放显示，
   *   box 坐标保持物理像素不变；拖拽时屏幕坐标差值除以 displayScale 得到物理坐标差值。 */
  displayScale?: number
  onChange: (b: ElementBox) => void
  keepAspect?: boolean
  minWidth?: number
  minHeight?: number
  renderContent: (w: number, h: number) => React.ReactNode
  label?: string
  readOnly?: boolean
}) {
  // 选中状态：显示手柄
  const [selected, setSelected] = useState(false)
  // 拖拽/缩放状态
  const dragState = useRef<{
    mode: "move" | "resize"
    startX: number
    startY: number
    startBox: ElementBox
    aspect: number
  } | null>(null)
  // 是否锁定（box.locked === true 时禁用所有交互）
  const isLocked = box.locked === true
  // 综合禁用条件：只读模式 OR 锁定模式
  const interactionDisabled = readOnly || isLocked

  // 需求（拖动修复）：用 ref 稳定化所有回调依赖，避免 onChange 触发重渲染时
  // 导致 handleWindowMove 被 useCallback 重建 → 旧监听器被清理 → 拖拽中断。
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const keepAspectRef = useRef(keepAspect)
  keepAspectRef.current = keepAspect
  const minWidthRef = useRef(minWidth)
  minWidthRef.current = minWidth
  const minHeightRef = useRef(minHeight)
  minHeightRef.current = minHeight
  const boundsWidthRef = useRef(boundsWidth)
  boundsWidthRef.current = boundsWidth
  const boundsHeightRef = useRef(boundsHeight)
  boundsHeightRef.current = boundsHeight
  // 需求（PDF 1:1 还原）：displayScale 用于把屏幕坐标差值转换为物理坐标差值
  const displayScaleRef = useRef(displayScale)
  displayScaleRef.current = displayScale

  /**
   * 边界 clamp：把 box 限制在 [0, bounds] 范围内
   * 输入参数：b - 待限制的 ElementBox
   * 返回值：调整后的 ElementBox
   * 注意：使用 ref 读取最新 bounds，避免 useCallback 依赖导致的重建
   */
  const clamp = useCallback((b: ElementBox): ElementBox => {
    const bw = boundsWidthRef.current
    const bh = boundsHeightRef.current
    const mw = minWidthRef.current
    const mh = minHeightRef.current
    const w = Math.max(mw, Math.min(b.width, bw))
    const h = Math.max(mh, Math.min(b.height, bh))
    const x = Math.max(0, Math.min(b.x, bw - w))
    const y = Math.max(0, Math.min(b.y, bh - h))
    return { ...b, x, y, width: w, height: h }
  }, [])

  /** 启动拖拽 */
  const handleMoveStart = (e: React.MouseEvent) => {
    if (interactionDisabled) return
    e.preventDefault()
    e.stopPropagation()
    setSelected(true)
    const aspect = box.width / box.height || 1
    dragState.current = {
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...box },
      aspect,
    }
    window.addEventListener("mousemove", handleWindowMove)
    window.addEventListener("mouseup", handleWindowUp)
  }

  /** 启动缩放 */
  const handleResizeStart = (e: React.MouseEvent) => {
    if (interactionDisabled) return
    e.preventDefault()
    e.stopPropagation()
    const aspect = box.width / box.height || 1
    dragState.current = {
      mode: "resize",
      startX: e.clientX,
      startY: e.clientY,
      startBox: { ...box },
      aspect,
    }
    window.addEventListener("mousemove", handleWindowMove)
    window.addEventListener("mouseup", handleWindowUp)
  }

  /**
   * 全局 mousemove：根据 dragState 移动或缩放
   * 注意：使用 ref 读取最新 onChange/clamp/keepAspect 等，依赖数组为空，
   * 确保回调引用永不变化，避免拖拽过程中监听器被清理。
   * 需求（PDF 1:1 还原）：父容器用 transform: scale(displayScale) 缩放显示，
   *   box 坐标保持物理像素；屏幕坐标差值除以 displayScale 得到物理坐标差值。
   */
  const handleWindowMove = useCallback((e: MouseEvent) => {
    const s = dragState.current
    if (!s) return
    const ds = displayScaleRef.current || 1
    const dx = (e.clientX - s.startX) / ds
    const dy = (e.clientY - s.startY) / ds
    if (s.mode === "move") {
      onChangeRef.current(clamp({
        ...s.startBox,
        x: s.startBox.x + dx,
        y: s.startBox.y + dy,
      }))
    } else {
      if (keepAspectRef.current) {
        const newW = Math.max(minWidthRef.current, s.startBox.width + dx)
        const newH = Math.max(minHeightRef.current, newW / s.aspect)
        onChangeRef.current(clamp({
          ...s.startBox,
          width: newW,
          height: newH,
        }))
      } else {
        onChangeRef.current(clamp({
          ...s.startBox,
          width: Math.max(minWidthRef.current, s.startBox.width + dx),
          height: Math.max(minHeightRef.current, s.startBox.height + dy),
        }))
      }
    }
  }, [clamp])

  /** 全局 mouseup：清理事件 */
  const handleWindowUp = useCallback(() => {
    dragState.current = null
    window.removeEventListener("mousemove", handleWindowMove)
    window.removeEventListener("mouseup", handleWindowUp)
  }, [handleWindowMove])

  // 卸载时清理事件（防御：组件卸载时残留 mousemove/mouseup）
  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", handleWindowMove)
      window.removeEventListener("mouseup", handleWindowUp)
    }
  }, [handleWindowMove, handleWindowUp])

  /** 键盘微调：方向键移动
   * 需求（PDF 1:1 还原）：box 坐标保持物理像素，键盘 step 也按物理像素计算
   * （屏幕 step = 物理 step × displayScale，但键盘事件不区分屏幕/物理，
   *  采用「按显示缩放比例放大」语义：1px 步进对应 1×displayScale 物理像素，
   *  与拖拽行为一致） */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (interactionDisabled) return
    const ds = displayScaleRef.current || 1
    const step = (e.shiftKey ? 10 : 1) * ds
    let dx = 0, dy = 0
    if (e.key === "ArrowLeft") dx = -step
    else if (e.key === "ArrowRight") dx = step
    else if (e.key === "ArrowUp") dy = -step
    else if (e.key === "ArrowDown") dy = step
    else return
    e.preventDefault()
    onChange(clamp({ ...box, x: box.x + dx, y: box.y + dy }))
  }

  return (
    <div
      tabIndex={interactionDisabled ? -1 : 0}
      onMouseDown={handleMoveStart}
      onKeyDown={handleKeyDown}
      onBlur={() => setSelected(false)}
      className={cn(
        "absolute outline-none group",
        isLocked
          ? "cursor-not-allowed ring-1 ring-amber-300"
          : readOnly
            ? "cursor-default"
            : selected
              ? "ring-1 ring-blue-500 cursor-move"
              : "hover:ring-1 hover:ring-blue-300 cursor-move",
      )}
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
      title={isLocked
        ? `${label}（已锁定）`
        : readOnly
          ? undefined
          : label
            ? `${label} — 拖动移动，拖右下角缩放`
            : "拖动移动，拖右下角缩放"}
    >
      {/* 内容层：pointer-events-none 防止内容拦截鼠标事件 */}
      <div className="w-full h-full pointer-events-none">
        {renderContent(box.width, box.height)}
      </div>
      {/* 左下角 + 右下角 + 右上角 缩放手柄 — 三个角都可拖拽缩放，便于操作 */}
      {!interactionDisabled && (
        <>
          <div
            onMouseDown={handleResizeStart}
            className={cn(
              "absolute right-0 bottom-0 w-5 h-5 bg-blue-500/80 rounded-sm cursor-nwse-resize border border-white/50",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              "transition-opacity",
            )}
            title="拖拽缩放（右下角）"
            style={{ transform: "translate(50%, 50%)" }}
          />
          <div
            onMouseDown={handleResizeStart}
            className={cn(
              "absolute left-0 bottom-0 w-5 h-5 bg-blue-500/80 rounded-sm cursor-nesw-resize border border-white/50",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              "transition-opacity",
            )}
            title="拖拽缩放（左下角）"
            style={{ transform: "translate(-50%, 50%)" }}
          />
          <div
            onMouseDown={handleResizeStart}
            className={cn(
              "absolute right-0 top-0 w-5 h-5 bg-blue-500/80 rounded-sm cursor-nesw-resize border border-white/50",
              selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              "transition-opacity",
            )}
            title="拖拽缩放（右上角）"
            style={{ transform: "translate(50%, -50%)" }}
          />
        </>
      )}
      {/* 选中提示：四角 + 虚线边框，帮助用户确认元素已选中并可拖拽 */}
      {selected && !interactionDisabled && (
        <div className="absolute inset-0 border border-dashed border-blue-400/50 pointer-events-none rounded" />
      )}
      {/* 锁定标记：右上角小图标，便于管理层识别 */}
      {isLocked && (
        <div
          className="absolute right-0 top-0 w-3.5 h-3.5 bg-amber-500 rounded-sm flex items-center justify-center text-white text-[9px] font-bold pointer-events-none"
          style={{ transform: "translate(50%, -50%)" }}
          title="已锁定"
        >
          🔒
        </div>
      )}
    </div>
  )
}
