# 云端 MinerU 解析技术方案

## 一、概述

### 1.1 MinerU 是什么

[MinerU](https://github.com/opendatalab/MinerU) 是上海人工智能实验室（OpenDataLab）开源的高精度文档解析引擎，可将非结构化文档（PDF、图片、Office 文件等）转换为机器可读的 Markdown 和 JSON。核心能力包括：

- **公式 → LaTeX**、**表格 → HTML**，精确还原复杂排版
- 支持扫描件、手写体、多栏排版、跨页表格合并
- 输出遵循人类阅读顺序，自动去除页眉页脚
- **VLM + OCR 双引擎**，支持 109 种语言 OCR 识别

### 1.2 本文档目的

本方案说明如何基于 MinerU 官方 Open API 和 SDK，在 tools4 项目中建立云端文档解析能力，实现 **PDF 试卷上传 → 云端解析 → 结构化分题 → 组卷** 的全流程闭环。

---

## 二、MinerU 官方 API 体系

### 2.1 两种 API 模式

| 对比维度 | Precision Extract API（精准解析） | Flash Extract API（快速解析） |
| -------- | --------------------------------- | ----------------------------- |
| 认证 | 需要 Token | 不需要 Token（IP 限流） |
| 模型版本 | `pipeline` / `vlm`（推荐） / `MinerU-HTML` | 固定轻量模型 |
| 文件大小限制 | ≤ 200 MB | ≤ 10 MB |
| 页数限制 | ≤ 200 页 | ≤ 20 页 |
| 批量支持 | 支持（≤ 200 文件） | 仅单文件 |
| 输出格式 | Markdown、JSON、ZIP；可选 DOCX / HTML / LaTeX | 仅 Markdown |

### 2.2 API 端点

```
Precision API  Base: https://mineru.net/api/v4
Flash API      Base: https://mineru.net/api/flash
```

### 2.3 获取 Token

1. 访问 [MinerU 官网](https://mineru.net)
2. 注册/登录后进入 API 管理页面
3. 获取 Token 并配置到项目中

---

## 三、多语言 SDK 概览

MinerU 官方提供 **Python / Go / TypeScript** 三种 SDK，位于 `MinerU-Ecosystem/sdk/`：

```
sdk/
├── python/       # Python SDK → pip install mineru-open-sdk
├── go/           # Go SDK     → go get github.com/opendatalab/MinerU-Ecosystem/sdk/go
└── typescript/   # TS SDK     → npm install mineru-open-sdk
```

### 3.1 Python SDK 核心用法

```python
from mineru import MinerU

# 精准解析（需要 Token）
client = MinerU("your-api-token")
result = client.extract("./paper.pdf",
    model="vlm",           # 模型：vlm | pipeline | html
    language="ch",         # 语言：ch / en
    formula=True,          # 公式识别
    table=True,            # 表格识别
    extra_formats=["docx", "html", "latex"],  # 额外输出格式
    timeout=600,           # 超时（秒）
)

# 结果结构
print(result.markdown)      # Markdown 文本
print(result.latex)         # LaTeX 源码
print(result.html)          # HTML 格式
result.docx                 # DOCX 二进制（bytes）
print(result.content_list)  # 结构化内容列表
print(result.images)        # 图片列表 [{name, data, path}]
result.save_all("./output") # 保存所有产物
```

### 3.2 TypeScript SDK 核心用法

```typescript
import { MinerU, saveAll } from "mineru-open-sdk"

// 精准解析
const client = new MinerU("your-api-token")
const result = await client.extract("./paper.pdf", {
  model: "vlm",
  language: "ch",
  extraFormats: ["docx", "html", "latex"],
  timeout: 600,
})

console.log(result.markdown)
console.log(result.images)
await saveAll(result, "./output")
```

### 3.3 异步工作流 API（高级用法）

SDK 支持 **提交 + 轮询 + 下载** 的异步工作流，适合需要精细控制进度的场景：

```python
client = MinerU(token)

# 1. 提交任务（不等待）
batch_id = client.submit("paper.pdf", model="vlm")

# 2. 按需查询进度
results = client.get_batch(batch_id)
for r in results:
    print(f"{r.filename}: {r.progress}")

# 3. 查询单个任务
task = client.get_task("task_id_xxx")
```

### 3.4 批量处理

```python
# 批量解析
for result in client.extract_batch(["a.pdf", "b.pdf", "c.pdf"]):
    print(f"{result.filename}: {result.state}")
```

---

## 四、本项目集成架构

### 4.1 整体流程

```
┌──────────┐    上传PDF     ┌──────────────┐   调用SDK    ┌───────────────┐
│  前端    │ ──────────────→ │  papers.py   │ ───────────→ │ mineru_service│
│ 试卷上传 │                │  POST /papers │              │  .parse_pdf() │
└──────────┘                └──────────────┘              └───────┬───────┘
                                                                  │
                                                         ┌────────▼───────┐
                                                         │  MinerU 云端    │
                                                         │  API v4        │
                                                         │  (精准解析)     │
                                                         └────────┬───────┘
                                                                  │
┌──────────┐    分题结果      ┌──────────────┐   下载产物   ┌────────▼───────┐
│  前端    │ ←────────────── │  papers.py   │ ←─────────── │  parse_service │
│ 组卷工作台│                │  POST /split  │              │  保存产物      │
│          │                │  GET /preview │              │  status=parsed │
└──────────┘                └──────────────┘              └────────────────┘
```

### 4.2 关键文件与职责

| 文件 | 职责 |
|------|------|
| `backend/app/services/mineru_service.py` | MinerU 云端 SDK 封装，Token 管理，核心解析入口 |
| `backend/app/services/parse_service.py` | 解析编排层：调用 MinerU → 保存产物到磁盘 |
| `backend/app/services/mineru_splitter.py` | 分题器：基于 content_list 结构将解析结果拆分为独立题目 |
| `backend/app/api/papers.py` | API 路由：上传/解析/分题/预览的 REST 接口 |
| `MinerU-Ecosystem-main/` | MinerU 官方生态工具包（参考文档） |

### 4.3 Token 配置

`mineru_service.py` 中的 Token 读取优先级：

```
1. 环境变量 MINERU_TOKEN
2. config.py 中的 settings.mineru_token
3. token.txt 文件（多路径搜索）
```

### 4.4 解析产物结构

```
backend/uploads/paper/{paper_id}/
├── origin.pdf            # 原始 PDF
├── markdown.md           # MinerU 解析 Markdown
├── latex.tex             # MinerU 解析 LaTeX
├── html.html             # HTML 格式
├── docx.docx             # Word 格式
├── content_list.json     # 结构化内容列表（含 bbox 坐标）
├── images/               # 提取的图片文件
│   ├── img_001.png
│   └── img_002.png
└── split_result.json     # 分题结果（阶段二产物）
```

### 4.5 解析状态机

```
uploading → uploaded → parsing → parsed → splitting → completed
                                    ↓
                                  failed
```

| 状态 | 说明 |
|------|------|
| `uploading` | 文件正在上传 |
| `uploaded` | 上传完成，等待解析 |
| `parsing` | 正在调用 MinerU 云端解析 |
| `parsed` | 云端解析完成，产物已保存 |
| `splitting` | 正在执行分题切分 |
| `completed` | 分题完成，可进入组卷 |
| `failed` | 解析失败 |

---

## 五、核心实现代码解析

### 5.1 MinerUService — 云端解析封装

[backend/app/services/mineru_service.py](file:///f:/tools4/backend/app/services/mineru_service.py)

```python
class MinerUService:
    """MinerU 云端解析服务 — 唯一引擎"""

    async def parse_pdf(self, pdf_path: str, **kwargs) -> MinerUParseResult:
        token = self.get_token()
        client = MinerU(token=token)

        # 使用 asyncio.to_thread 避免阻塞事件循环
        result = await asyncio.to_thread(
            client.extract,
            pdf_path,
            model=kwargs.get("model", "vlm"),
            formula=True,
            table=True,
            language=kwargs.get("language", "ch"),
            extra_formats=["latex", "html", "docx"],
            timeout=kwargs.get("timeout", 300),
        )

        if result.state != "done":
            return MinerUParseResult(task_id=result.task_id, error=result.error)

        # 提取图片数据（base64 编码存储）
        images = [{
            "name": img.name,
            "data_base64": base64.b64encode(img.data).decode(),
            "path": img.path,
            "data": img.data,
        } for img in result.images]

        return MinerUParseResult(
            task_id=result.task_id,
            markdown=result.markdown,
            latex=result.latex,
            html=result.html,
            docx=result.docx,
            content_list=result.content_list,
            images=images,
        )
```

### 5.2 ParseService — 解析编排层

[backend/app/services/parse_service.py](file:///f:/tools4/backend/app/services/parse_service.py)

```
parse_paper()
  ├── 更新 paper.status = "parsing"
  ├── 调用 mineru_service.parse_pdf()
  ├── 保存产物到磁盘（markdown / latex / content_list / images）
  ├── 更新 paper.status = "parsed"
  └── 异常处理：更新 paper.status = "failed"
```

### 5.3 MinerUSplitter — 分题器

[backend/app/services/mineru_splitter.py](file:///f:/tools4/backend/app/services/mineru_splitter.py)

基于 `content_list` 的结构化分题策略：

```
content_list 元素
  ├── 识别大题标记（一、二、...）
  ├── 识别题目起始（1./2./...）
  ├── 识别子题（1.(1)/1.(2)...）
  ├── 识别选项（A./B./...）
  ├── 利用 bbox 坐标精确匹配图片到题目
  └── 输出：每题独立 structured 数据
```

### 5.4 REST API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/papers/{paper_id}/parse` | POST | 触发重新解析 |
| `/api/papers/{paper_id}/split` | POST | 执行分题切分（阶段二） |
| `/api/papers/{paper_id}/preview` | GET | 预览 MinerU 解析产物 |
| `/api/papers/{paper_id}/questions` | GET | 获取分题后的题目列表 |

---

## 六、MinerU 官方生态工具链

除了 SDK，MinerU 还提供完整的工具链（位于 `MinerU-Ecosystem-main/`）：

### 6.1 CLI 命令行工具

```bash
# 安装（一次性）
curl -fsSL https://cdn-mineru.openxlab.org.cn/open-api-cli/install.sh | sh

# 快速解析（无需 Token）
mineru-open-api flash-extract report.pdf

# 精准解析（需要 Token）
mineru-open-api auth              # 首次配置 Token
mineru-open-api extract paper.pdf -o ./output/
mineru-open-api extract paper.pdf -f docx,latex,html -o ./results/

# 批量处理
mineru-open-api extract *.pdf -o ./results/
mineru-open-api extract --list filelist.txt -o ./results/
```

### 6.2 MCP Server（AI Agent 集成）

mineru-open-mcp 支持 Claude Desktop、Cursor、Windsurf 等 AI 工具直接调用解析能力：

```json
{
  "mcpServers": {
    "mineru": {
      "command": "uvx",
      "args": ["mineru-open-mcp"],
      "env": { "MINERU_API_TOKEN": "your_key_here" }
    }
  }
}
```

暴露的 MCP 工具：

| 工具 | 功能 |
|------|------|
| `parse_documents` | 将 PDF/DOCX/PPTX/图片/HTML 转为 Markdown |
| `get_ocr_languages` | 列出 109 种支持的 OCR 语言 |

### 6.3 LangChain 集成

```python
from langchain_mineru import MinerULoader

# Flash 模式（无需 Token）
loader = MinerULoader(source="demo.pdf")
docs = loader.load()

# 精准模式（需要 Token）
loader = MinerULoader(
    source="/path/to/paper.pdf",
    mode="precision",
    token="your-api-token",
    split_pages=True,
)
docs = loader.load()
```

### 6.4 LlamaIndex 集成

```python
from llama_index.readers.mineru import MinerUReader

reader = MinerUReader()
documents = reader.load_data("https://.../example.pdf")
```

---

## 七、扩展方案

### 7.1 前端直接调用 MinerU SDK

当前项目采用后端代理模式（前端上传 → 后端调用 MinerU）。也可在前端直接集成 TypeScript SDK：

```typescript
import { MinerU } from "mineru-open-sdk"

// 前端直接解析（需要 Token，注意安全性）
const client = new MinerU("token")
const result = await client.extract(file, { model: "vlm", language: "ch" })
```

**注意**：前端直接调用会暴露 Token，建议仅在开发环境或通过后端代理使用。

### 7.2 批量试卷导入

利用 MinerU 的批量 API 实现多份试卷并发解析：

```python
# 批量提交
results = client.extract_batch(["paper1.pdf", "paper2.pdf", "paper3.pdf"])

# 或使用异步工作流
batch_id = client.submit_batch(["paper1.pdf", "paper2.pdf"])
# 轮询进度
for result in client.get_batch(batch_id):
    print(f"{result.filename}: {result.progress}")
```

### 7.3 网页抓取

MinerU 支持将网页内容解析为 Markdown：

```python
result = client.crawl("https://www.example.com")
print(result.markdown)
```

---

## 八、注意事项

1. **Token 安全**：Token 应通过环境变量或后端配置文件管理，**禁止硬编码**或提交到 Git 仓库
2. **超时设置**：大文件（>50 页）解析可能需要 5-10 分钟，建议 `timeout` 设为 600 秒以上
3. **并发限制**：MinerU API 有并发限制，批量解析时注意控制并发数
4. **费用**：MinerU 提供免费额度，超量后需付费，关注 [mineru.net](https://mineru.net) 的配额信息
5. **产物存储**：解析产物（Markdown、LaTeX、图片）会占用磁盘空间，建议定期清理过期数据
6. **模型选择**：`vlm` 模型精度最高（推荐），`pipeline` 适合无公式的纯文本文档，`MinerU-HTML` 用于网页抓取

---

## 九、相关资源

| 资源 | 链接 |
|------|------|
| MinerU 官方仓库 | [github.com/opendatalab/MinerU](https://github.com/opendatalab/MinerU) |
| MinerU 生态工具包 | `MinerU-Ecosystem-main/`（本地） |
| 在线体验 | [mineru.net](https://mineru.net/OpenSourceTools/Extractor) |
| API 文档 | [mineru.net/apiManage/docs](https://mineru.net/apiManage/docs) |
| Python SDK 文档 | `MinerU-Ecosystem-main/sdk/python/` |
| TypeScript SDK 文档 | `MinerU-Ecosystem-main/sdk/typescript/` |

---

## 十、项目文件清单

```
backend/
├── app/
│   ├── api/
│   │   └── papers.py                     # 上传/解析/分题/预览 API
│   └── services/
│       ├── mineru_service.py             # MinerU 云端 SDK 封装（核心）
│       ├── parse_service.py              # 解析编排层
│       └── mineru_splitter.py            # 分题切分器
├── config.py                             # settings.mineru_token 配置
└── token.txt                             # Token 文件（可选）

MinerU-Ecosystem-main/                    # 官方生态工具包（参考）
├── README.md
├── cli/                                  # 命令行工具
├── sdk/
│   ├── python/                           # Python SDK
│   ├── go/                               # Go SDK
│   └── typescript/                       # TypeScript SDK
├── langchain_mineru/                     # LangChain 集成
├── llama-index-readers-mineru/           # LlamaIndex 集成
├── mcp/                                  # MCP Server
└── skills/                               # AI Agent 技能
```