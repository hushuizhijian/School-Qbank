/* ========== 纸张预览容器 ========== */

/**
 * 试卷纸张预览容器
 *
 * 功能：渲染纸张外框（白底 + 阴影 + 缩放），套用页眉/水印/页脚样式
 * 输入参数：paperSize、pageConfig、homework、children、scale
 * 返回值：纸张预览节点
 *
 * 阶段4改造：把"页眉+Logo"区域改为可独立拖拽+等比缩放元素
 *  - DraggableResizable 通用组件：支持拖拽、缩放、边界检查、键盘微调
 *  - 元素间互不干扰：每个元素独立的 state / 回调
 *  - 限定在画布内：拖拽/缩放都做边界 clamp
 *  - 添加时不出现横线：默认无 border-b
 */
function PaperPreview({
  paperSize,
  pageConfig,
  homework,
  children,
  fontSizes,
  scale,
  previewWidth,
  previewMinHeight,
  onFieldChange,
}: {
  paperSize: "A3" | "A4"
  pageConfig: HomeworkPageConfig
  homework: Homework
  children: React.ReactNode
  fontSizes: {
    title: number
    info: number
    question: number
    header: number
    footer: number
    watermark: number
  }
  scale: number
  previewWidth: number
  previewMinHeight: number
  onFieldChange: (field: "page_config_field", value: { key: keyof HomeworkPageConfig; value: unknown }) => void
}) {
  // A3 双列 / A4 单列 视觉参数
  const isA3 = paperSize === "A3"
  const marginL = isA3 ? 18 : 22
  const marginR = isA3 ? 18 : 20
  const marginT = isA3 ? 22 : 22
  const marginB = isA3 ? 18 : 18

  // 计算水印网格
  const watermarkGrid = pageConfig.watermark_text ? (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 3 * 2 }).map((_, i) => {
        const row = Math.floor(i / 2)
        const col = i % 2
        return (
          <div
            key={i}
            className="absolute text-slate-300 font-bold select-none whitespace-nowrap"
            style={{
              left: `${(25 + col * 50)}%`,
              top: `${(20 + row * 30)}%`,
              transform: `translate(-50%, -50%) rotate(${pageConfig.watermark_angle ?? -30}deg)`,
              fontSize: `${fontSizes.watermark * scale * 0.4}px`,
              opacity: pageConfig.watermark_opacity ?? 0.08,
            }}
          >
            {pageConfig.watermark_text}
          </div>
        )
      })}
    </div>
  ) : null

  // 内容区可用宽度 / 高度（去掉纸张 padding）
  const contentWidth = previewWidth - (marginL + marginR) * 3.78 * scale
  const contentHeight = previewMinHeight - (marginT + marginB) * 3.78 * scale

  /* ---------- 页眉 + Logo 区域改造为可独立拖拽元素 ---------- */

  /**
   * 更新页眉/Logo 元素位置
   * 输入参数：key - "header_box" | "logo_box"；box - 新的 ElementBox
   * 返回值：无
   * 触发：onFieldChange 走原有自动保存链路
   */
  const handleElementChange = (key: "header_box" | "logo_box", box: ElementBox) => {
    onFieldChange("page_config_field", { key, value: box })
  }

  // 页眉元素默认位置/大小（如果未配置）：左上角对齐
  const headerBox: ElementBox = pageConfig.header_box ?? {
    x: 0,
    y: 0,
    width: contentWidth,
    height: 22 * scale,
  }
  // Logo 元素默认位置/大小（如果未配置）：左对齐，宽度按 logo_width
  const logoBox: ElementBox = pageConfig.logo_box ?? {
    x: 0,
    y: 0,
    width: (pageConfig.logo_width ?? 18) * 3.78 * scale,
    height: 20 * scale,
  }

  // 是否显示页眉/Logo（用 page_config 上的 show 控制，默认 true）
  const showHeader = headerBox.show !== false
  const showLogo = logoBox.show !== false && !!pageConfig.logo_url

  return (
    <div
      className="relative bg-white shadow-2xl border border-slate-200 mx-auto"
      style={{
        width: `${previewWidth}px`,
        minHeight: `${previewMinHeight}px`,
        padding: `${marginT * 3.78 * scale}px ${marginR * 3.78 * scale}px ${marginB * 3.78 * scale}px ${marginL * 3.78 * scale}px`,
      }}
    >
      {watermarkGrid}

      {/* 页眉 + Logo 独立可拖拽区域
       *
       * 关键改造点（图一需求）：
       *  1. 元素间互不干扰：DraggableResizable 各自独立 state，分别走 onChange
       *  2. 自由拖拽移动位置
       *  3. 独立调整大小（Logo 等比缩放，页眉自由缩放）
       *  4. 限定在画布纸张范围内（通过 boundsWidth/Height 限制）
       *  5. 添加时不出现横线：默认无 border/border-b
       */}
      <div
        className="relative mb-2"
        style={{ height: `${Math.max(contentHeight * 0.3, 60)}px` }}
      >
        {/* Logo：等比缩放（aspectRatio = 自然宽高比，未知时用 1） */}
        {showLogo && (
          <DraggableResizable
            box={logoBox}
            boundsWidth={contentWidth}
            boundsHeight={contentHeight * 0.3}
            onChange={(b) => handleElementChange("logo_box", b)}
            keepAspect={true}
            minWidth={12}
            minHeight={12}
            renderContent={(w, h) => (
              <img
                src={pageConfig.logo_url}
                alt="logo"
                className="w-full h-full object-contain select-none"
                draggable={false}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
              />
            )}
            label="Logo"
          />
        )}
        {/* 页眉文字 */}
        {showHeader && (pageConfig.header_text || pageConfig.logo_url) && (
          <DraggableResizable
            box={headerBox}
            boundsWidth={contentWidth}
            boundsHeight={contentHeight * 0.3}
            onChange={(b) => handleElementChange("header_box", b)}
            keepAspect={false}
            minWidth={40}
            minHeight={16}
            renderContent={(w, h) => (
              <div
                className="w-full h-full flex items-center justify-center text-slate-700 font-medium text-center overflow-hidden"
                style={{
                  fontSize: `${fontSizes.header * scale}px`,
                  lineHeight: 1.1,
                }}
              >
                {pageConfig.header_text || ""}
              </div>
            )}
            label="页眉"
          />
        )}
      </div>

      {/* 标题区 — 标题下方的横线保留（标题与正文的合理分隔） */}
      <div className="relative text-center mb-3">
        <div
          className="font-bold text-slate-900"
          style={{ fontSize: `${fontSizes.title * scale}px`, lineHeight: 1.4 }}
        >
          {homework.title || "（未命名试卷）"}
        </div>
        <div
          className="mt-1 text-slate-500 flex items-center justify-center gap-3"
          style={{ fontSize: `${fontSizes.info * scale}px` }}
        >
          {homework.subject && <span>学科：{homework.subject}</span>}
          {homework.grade && <span>年级：{homework.grade}</span>}
        </div>
        {pageConfig.show_name_class !== false && (
          <div
            className="mt-1 text-slate-500"
            style={{ fontSize: `${fontSizes.info * scale}px` }}
          >
            姓名：__________   班级：__________   得分：__________
          </div>
        )}
        {pageConfig.show_subject_grade && (homework.subject || homework.grade) && (
          <div
            className="mt-1 text-slate-500"
            style={{ fontSize: `${fontSizes.info * scale * 0.9}px` }}
          >
            学科：{homework.subject || "—"}   年级：{homework.grade || "—"}
          </div>
        )}
        <div className="mt-2 border-t border-slate-400" />
      </div>

      {/* 正文内容（直接渲染 children，单列/双列由 children 自身处理） */}
      <div className="relative">{children}</div>
    </div>
  )
}

/**
 * 通用：可拖拽 + 可缩放元素
 *
 * 功能：在父容器内自由拖拽移动 / 调整大小
 * 输入参数：
 *   - box: 当前元素 {x, y, width, height}
 *   - boundsWidth/Height: 父容器可用的宽高（边界）
 *   - onChange: 元素位置/大小变化时的回调
 *   - keepAspect: 是否等比缩放（Logo 用 true，页眉用 false）
 *   - minWidth/minHeight: 最小尺寸
 *   - renderContent: 内容渲染函数 (w, h) => ReactNode
 *   - label: 元素标签（hover 时显示）
 * 返回值：可拖拽节点
 *
 * 行为说明：
 *  - 拖拽：mousedown on body → mousemove 改 x/y → mouseup 结束
 *  - 缩放：mousedown on 右下角 handle → mousemove 改 width/height → mouseup 结束
 *  - 边界 clamp：拖拽/缩放时实时限制在 [0, bounds] 范围内
 *  - 键盘：聚焦后方向键微调（10px / 1px with shift）
 *  - 元素间互不干扰：每个实例独立的事件处理
 */
function DraggableResizable({
  box,
  boundsWidth,
  boundsHeight,
  onChange,
  keepAspect = false,
  minWidth = 16,
  minHeight = 16,
  renderContent,
  label = "",
}: {
  box: ElementBox
  boundsWidth: number
  boundsHeight: number
  onChange: (b: ElementBox) => void
  keepAspect?: boolean
  minWidth?: number
  minHeight?: number
  renderContent: (w: number, h: number) => React.ReactNode
  label?: string
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

  /**
   * 边界 clamp：把 box 限制在 [0, bounds] 范围内
   * 输入参数：b - 待限制的 ElementBox
   * 返回值：调整后的 ElementBox
   */
  const clamp = useCallback((b: ElementBox): ElementBox => {
    const w = Math.max(minWidth, Math.min(b.width, boundsWidth))
    const h = Math.max(minHeight, Math.min(b.height, boundsHeight))
    const x = Math.max(0, Math.min(b.x, boundsWidth - w))
    const y = Math.max(0, Math.min(b.y, boundsHeight - h))
    return { ...b, x, y, width: w, height: h }
  }, [boundsWidth, boundsHeight, minWidth, minHeight])

  /** 启动拖拽 */
  const handleMoveStart = (e: React.MouseEvent) => {
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
    // 绑定到 window，避免鼠标移出元素后丢失事件
    window.addEventListener("mousemove", handleWindowMove)
    window.addEventListener("mouseup", handleWindowUp)
  }

  /** 启动缩放 */
  const handleResizeStart = (e: React.MouseEvent) => {
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

  /** 全局 mousemove：根据 dragState 移动或缩放 */
  const handleWindowMove = useCallback((e: MouseEvent) => {
    const s = dragState.current
    if (!s) return
    const dx = e.clientX - s.startX
    const dy = e.clientY - s.startY
    if (s.mode === "move") {
      onChange(clamp({
        ...s.startBox,
        x: s.startBox.x + dx,
        y: s.startBox.y + dy,
      }))
    } else {
      // 等比缩放：以宽度变化为主，高度按 aspect 同步变化
      if (keepAspect) {
        const newW = Math.max(minWidth, s.startBox.width + dx)
        const newH = Math.max(minHeight, newW / s.aspect)
        onChange(clamp({
          ...s.startBox,
          width: newW,
          height: newH,
        }))
      } else {
        onChange(clamp({
          ...s.startBox,
          width: Math.max(minWidth, s.startBox.width + dx),
          height: Math.max(minHeight, s.startBox.height + dy),
        }))
      }
    }
  }, [clamp, keepAspect, minWidth, minHeight, onChange])

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

  /** 键盘微调：方向键移动 */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1
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
      tabIndex={0}
      onMouseDown={handleMoveStart}
      onKeyDown={handleKeyDown}
      onBlur={() => setSelected(false)}
      className={cn(
        "absolute outline-none group",
        selected ? "ring-1 ring-blue-500" : "hover:ring-1 hover:ring-blue-300",
        "cursor-move",
      )}
      style={{
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      }}
      title={label ? `${label} — 拖动移动，拖右下角缩放` : "拖动移动，拖右下角缩放"}
    >
      {/* 内容层：pointer-events-none 防止内容拦截鼠标事件 */}
      <div className="w-full h-full pointer-events-none">
        {renderContent(box.width, box.height)}
      </div>
      {/* 右下角缩放手柄 */}
      <div
        onMouseDown={handleResizeStart}
        className={cn(
          "absolute right-0 bottom-0 w-3 h-3 bg-blue-500 rounded-sm cursor-nwse-resize",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          "transition-opacity",
        )}
        title="拖动缩放"
        style={{ transform: "translate(50%, 50%)" }}
      />
    </div>
  )
}

/**
 * 试卷范例列表条带（阶段6：画布下方范例列表）
 *
 * 功能：横向展示当前用户保存的试卷格式范例
 *  - 隐藏/显示切换：标题栏右侧眼睛按钮
 *  - 鼠标滚轮横向滚动：监听 wheel 事件，deltaY 转为 scrollLeft
 *  - 单个范例的删除：每个范例卡片的"删除"按钮
 *  - 一键应用：每个范例卡片的"应用"按钮（调用父组件的 onApply）
 *  - 无范例时显示空状态提示
 *
 * 输入参数：templates / show / onToggleShow / onApply / onDelete
 * 返回值：列表条带节点
 */
function TemplateStrip({
  templates,
  show,
  onToggleShow,
  onApply,
  onDelete,
}: {
  templates: PaperTemplate[]
  show: boolean
  onToggleShow: () => void
  onApply: (templateId: string) => void
  onDelete: (templateId: string) => void
}) {
  // 滚动容器 ref
  const scrollRef = useRef<HTMLDivElement>(null)

  /**
   * 鼠标滚轮横向滚动
   * 功能：用户垂直滚轮时转化为列表的横向滚动
   * 输入参数：e - wheel 事件
   * 返回值：无
   */
  const handleWheel = (e: React.WheelEvent) => {
    const el = scrollRef.current
    if (!el) return
    // 仅在水平滚动有富余时接管 wheel
    if (el.scrollWidth > el.clientWidth) {
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white shrink-0">
      {/* 标题栏：左侧标题 + 计数，右侧显示/隐藏切换 */}
      <div className="px-4 py-2 flex items-center gap-2 border-b border-slate-100">
        <Bookmark size={14} className="text-slate-500" />
        <span className="text-sm font-medium text-slate-700">格式范例</span>
        <span className="text-[11px] text-slate-400">· {templates.length} 个</span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          <span>滚动提示：鼠标滚轮可横向滚动</span>
          <button
            onClick={onToggleShow}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
            title={show ? "隐藏范例列表" : "显示范例列表"}
          >
            {show ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      </div>
      {show && (
        <div
          ref={scrollRef}
          onWheel={handleWheel}
          className="overflow-x-auto overflow-y-hidden px-4 py-3"
          style={{ scrollBehavior: "smooth" }}
        >
          {templates.length === 0 ? (
            <div className="text-center text-slate-400 text-xs py-6">
              暂无范例。点击工具栏「范例」按钮把当前试卷格式保存为命名范例。
            </div>
          ) : (
            <div className="flex gap-3 min-w-min">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="shrink-0 w-44 border border-slate-200 rounded-md p-2 bg-white hover:border-blue-400 transition-colors"
                >
                  {/* 范例名称 */}
                  <div
                    className="text-[12px] font-medium text-slate-800 truncate"
                    title={t.name}
                  >
                    {t.name}
                  </div>
                  {/* 范例说明（可选） */}
                  {t.description && (
                    <div
                      className="text-[10px] text-slate-400 mt-0.5 truncate"
                      title={t.description}
                    >
                      {t.description}
                    </div>
                  )}
                  {/* 格式快照：纸张 + 字体 + 是否有水印 */}
                  <div className="text-[10px] text-slate-400 mt-1.5 space-y-0.5">
                    <div>纸张：{t.page_config?.paper_size || "A4"}</div>
                    <div>字号：{t.page_config?.question_font_size ?? 11}px</div>
                    {t.page_config?.watermark_text && (
                      <div>水印：{t.page_config.watermark_text}</div>
                    )}
                  </div>
                  {/* 更新时间 */}
                  <div className="text-[10px] text-slate-300 mt-1">
                    {new Date(t.updated_at).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  {/* 操作：应用 + 删除 */}
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      onClick={() => onApply(t.id)}
                      className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 text-[11px] bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                      title="把此范例的格式信息导入到当前作业"
                    >
                      <Check size={10} />
                      应用
                    </button>
                    <button
                      onClick={() => onDelete(t.id)}
                      className="p-1 text-slate-400 hover:text-red-500"
                      title="删除此范例"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A3 双列布局组件
 *
 * 功能：将题目严格平均分配到两列（按奇偶交替，列宽相同、列内高度尽量均衡）
 *       接收拖拽放置提示并高亮对应位置
 * 输入参数：items、dropHintIndex、回调函数
 * 返回值：A3 双列布局节点
 */
function A3TwoColumnLayout({
  items,
  dropHintIndex,
  onDelete,
  onScoreChange,
  questionFontSize,
}: {
  items: { hqId: string; question: Question; score: number; sortOrder: number }[]
  dropHintIndex: number | null
  onDelete: (hqId: string) => void
  onScoreChange: (hqId: string, s: number) => void
  questionFontSize: number
}) {
  // 严格平均分配：按奇偶交替
  // - 第 1、3、5... 题放左列；第 2、4、6... 题放右列
  // - 列宽严格相等（flex-1），保证双列宽度相同
  // - 左列排序时优先填满，再排右列（按题号顺序：1,2,3,4 → 左1,右1,左2,右2）
  const leftItems: typeof items = []
  const rightItems: typeof items = []
  items.forEach((it, idx) => {
    if (idx % 2 === 0) {
      leftItems.push(it) // 偶数索引 0,2,4... → 左列（题号 1,3,5...）
    } else {
      rightItems.push(it) // 奇数索引 1,3,5... → 右列（题号 2,4,6...）
    }
  })

  return (
    <div className="flex gap-3">
      {/* 左列：宽度严格等于右列 */}
      <div className="flex-1 min-w-0">
        {leftItems.map((it, idx) => {
          // 左列第 idx 个，对应原题号 idx*2
          const realIdx = idx * 2
          return (
            <div key={it.hqId} className="relative">
              <SortableCanvasItem
                index={realIdx}
                hqId={it.hqId}
                question={it.question}
                score={it.score}
                fontSize={questionFontSize}
                onDelete={() => onDelete(it.hqId)}
                onScoreChange={(s) => onScoreChange(it.hqId, s)}
              />
              {dropHintIndex === realIdx && (
                <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded" />
              )}
            </div>
          )
        })}
      </div>
      {/* 列间分隔线 */}
      <div className="w-px bg-slate-200 shrink-0" />
      {/* 右列：宽度严格等于左列 */}
      <div className="flex-1 min-w-0">
        {rightItems.map((it, idx) => {
          // 右列第 idx 个，对应原题号 idx*2+1
          const realIdx = idx * 2 + 1
          return (
            <div key={it.hqId} className="relative">
              <SortableCanvasItem
                index={realIdx}
                hqId={it.hqId}
                question={it.question}
                score={it.score}
                fontSize={questionFontSize}
                onDelete={() => onDelete(it.hqId)}
                onScoreChange={(s) => onScoreChange(it.hqId, s)}
              />
              {dropHintIndex === realIdx && (
                <div className="absolute -top-1 left-0 right-0 h-1 bg-blue-500 rounded" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

