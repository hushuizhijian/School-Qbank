# PDF 1:1 导出技术方案

## 一、目标

实现 PDF 导出结果与 Web 画布视觉呈现 **100% 一致**（所见即所得），包括：
- 所有元素的精确位置（Logo、页眉、标题、题目）
- 字号、颜色、排版布局
- 图片内容（题目配图、Logo）
- 水印、页脚、页码
- 多页分页

## 二、方案演进

### 2.1 旧方案（已废弃）：后端 ReportLab 逐元素重建

**流程**：
```
前端画布 → 后端读取 page_config → ReportLab 逐元素计算坐标/字号 → 生成 PDF
```

**问题**：
- 前端和后端是两套独立的渲染管线，字号换算（CSS px ↔ ReportLab pt）、坐标转换（物理像素 ↔ mm）、换行算法均不一致
- 任何微调都会引入新的偏差，无法从根本上保证 1:1
- 题目图片、题干内嵌图片完全遗漏

**教训**：不要在服务端"重建"前端渲染结果，这是不可靠的。

### 2.2 新方案（当前）：前端 html2canvas + jsPDF 直出

**流程**：
```
点击导出 → html2canvas 捕获画布 DOM → 生成 PNG → jsPDF 嵌入 PDF 页面 → 浏览器下载
```

**核心原理**：直接对 Web 画布 DOM 截图，等同于"所见即所得"。

## 三、架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  HomeworkComposePage                                            │
│  ┌──────────────┐                                               │
│  │ PaperPreview │  data-pdf-export-target  ← 标记导出目标元素    │
│  │ 或            │                                               │
│  │ Pagination   │  data-pdf-export-target  ← 每页一个标记       │
│  │ Preview      │                                               │
│  └──────────────┘                                               │
│         │                                                        │
│         ▼ 点击"导出 PDF"                                         │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  handleExportPDF()                                    │       │
│  │  1. 查找 [data-pdf-export-target] 元素                │       │
│  │  2. 自动检测 CSS transform 模式（单页/分页）           │       │
│  │  3. 调用 exportCanvasToPdf()                          │       │
│  └──────────────────────────────────────────────────────┘       │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  pdfExport.ts                                         │       │
│  │  1. html2canvas 高清截图（3× 物理分辨率）              │       │
│  │  2. 临时移除阴影/边框（编辑器装饰）                     │       │
│  │  3. jsPDF 创建 PDF，按 A4/A3 尺寸逐页嵌入             │       │
│  │  4. 自动触发浏览器下载                                 │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 关键文件

| 文件 | 作用 |
|------|------|
| `frontend/src/utils/pdfExport.ts` | 核心导出引擎：截图 + PDF 生成 |
| `frontend/src/pages/HomeworkComposePage.tsx` | 导出触发入口，查找 DOM 元素 |
| `frontend/src/components/compose/PaperPreview.tsx` | 单页画布，`data-pdf-export-target` 标记 |
| `frontend/src/components/compose/PaginationPreview.tsx` | 多页画布，每页 `data-pdf-export-target` 标记 |

### 3.3 依赖

```json
{
  "html2canvas-pro": "^2.0.4",  // DOM 截图
  "jspdf": "^4.2.1"              // PDF 生成
}
```

## 四、核心技术细节

### 4.1 画布物理尺寸体系

画布使用 **物理像素** 作为内部坐标系统，与 PDF 严格对应：

```
1mm = 3.78px（96dpi）
A4: 210×297mm → 794×1123px
A3: 297×420mm → 1122×1588px
```

所有 `ElementBox`（Logo、页眉、标题）的 `x`、`y`、`width`、`height` 均以物理像素为单位。

### 4.2 两种画布模式

| 模式 | 组件 | 缩放方式 | canvasScale |
|------|------|----------|-------------|
| 单页画布 | PaperPreview | CSS `transform: scale(0.78)` 或 `scale(0.6)` | 实际 scale 值 |
| 分页预览 | PaginationPreview | 不缩放，直接使用显示尺寸 | 1 |

### 4.3 分辨率补偿

PaperPreview 使用 CSS `transform: scale()` 将物理尺寸的纸张缩小显示。html2canvas 捕获的是视觉尺寸，需要补偿：

```typescript
// 捕获分辨率 = 3 / canvasScale
// A4: 3 / 0.78 ≈ 3.85× 视觉分辨率 → 3× 物理分辨率（高清）
// A3: 3 / 0.6 = 5× 视觉分辨率 → 3× 物理分辨率（高清）
const captureScale = Math.max(2, 3 / canvasScale)
```

### 4.4 模式自动检测

通过 `getComputedStyle` 检测元素是否有 CSS `transform`，自动判断缩放模式：

```typescript
const computedTransform = window.getComputedStyle(firstTarget).transform
if (computedTransform && computedTransform !== "none") {
  effectiveScale = scale  // PaperPreview 模式
} else {
  effectiveScale = 1      // PaginationPreview 模式
}
```

### 4.5 编辑器装饰处理

画布元素有 `shadow-2xl` 阴影和 `border` 边框，这些是编辑器装饰，不应出现在 PDF 中。截图前临时移除，截图后恢复：

```typescript
el.classList.remove("shadow-2xl", "shadow-lg", "shadow-md", "shadow-sm")
el.style.border = "none"
// ... 截图 ...
el.className = origClasses
el.style.border = origBorder
```

## 五、导出流程

```
1. 用户点击"导出 PDF"
2. 自动保存当前配置
3. 查找所有 [data-pdf-export-target] 元素
4. 自动检测 CSS transform 模式
5. 对每个元素：
   a. 临时移除阴影/边框
   b. html2canvas 截图（3× 物理分辨率）
   c. 恢复样式
6. 用 jsPDF 创建 PDF：
   a. 纸张尺寸 = 当前画布尺寸（A4/A3）
   b. 每张截图作为一页，填充整页（0 边距）
7. 自动触发浏览器下载
```

## 六、与旧方案的关键差异

| 维度 | 旧方案（ReportLab） | 新方案（html2canvas + jsPDF） |
|------|---------------------|-------------------------------|
| 渲染管线 | 独立重建 | 直接截图 |
| 位置准确性 | 依赖坐标换算，易出错 | 100% 一致 |
| 字号准确性 | px ↔ pt 换算错误 | 100% 一致 |
| 图片导出 | 遗漏题目配图 | 完整导出 |
| 排版一致性 | 不同换行算法 | 100% 一致 |
| 维护成本 | 两套代码需同步 | 一套代码 |
| 文件体积 | 小（矢量） | 较大（位图） |

## 七、注意事项

1. **跨域图片**：`html2canvas` 的 `useCORS: true` + `allowTaint: true` 处理跨域资源（Logo、题目图片）
2. **文件体积**：由于是位图截图，PDF 体积比矢量方式大。通过 `compression: "FAST"` 压缩和合理分辨率折中
3. **后端导出记录**：当前版本前端直出，不再调用后端 `/api/homework/:id/export` 接口。如需保留导出记录功能，可在导出成功后额外上传 PDF 到后端
4. **服务端渲染**：如需服务端生成 PDF（如批量导出），应使用 Puppeteer 渲染页面后截图，而非 ReportLab 重建

## 八、相关文件清单

```
frontend/
├── src/
│   ├── utils/
│   │   └── pdfExport.ts                    # PDF 导出核心引擎
│   ├── pages/
│   │   └── HomeworkComposePage.tsx          # 导出触发入口
│   └── components/
│       └── compose/
│           ├── PaperPreview.tsx             # 单页画布（含 data-pdf-export-target）
│           └── PaginationPreview.tsx        # 分页画布（含 data-pdf-export-target）
└── package.json                             # 依赖：html2canvas-pro, jspdf
```