# 小学数学智能题库系统 (School-Qbank)

> 基于 VLM 的小学数学题库管理平台。从试卷图片/PDF 出发，自动拆分题目、AI 标准化排版、人工校对、按知识点/难度出卷组卷、导出 Word/PDF。

## 功能特性

| 模块 | 路径 | 核心能力 |
|---|---|---|
| 试卷上传 | `/upload` | PDF/图片上传；OCR + VLM 解析整张试卷 |
| 智能分题 | `/split` | 自动定位题目边界，生成候选题；题型分类（6 类） |
| 校对工作台 | `/workbench` | LaTeX 源码（Monaco）+ KaTeX 实时预览双栏；分行/分列插件；空行/还原 |
| 题库管理 | `/bank` | 按知识点、难度、题型、试卷来源检索；批量编辑 |
| 作业组卷 | `/compose` | 从题库选题/乱序/题型分组；一键生成 Word/PDF 作业 |
| 统计面板 | `/stats` | 题型分布、难度分布、知识点覆盖 |
| AI 标准化 | 设置 → AI 接入 | 多 Provider 管理（智谱/DeepSeek/OpenAI 等）；规则化排版 |

### 题型分类

精简为 6 类（兼容旧 key）：

1. **选择**（choice）— 含单选、多选
2. **填空**（fill_blank）
3. **判断**（true_false）
4. **计算**（calculation）
5. **操作**（operation）
6. **解决问题**（application）— 含解答题、应用题

## 技术栈

### 前端 (`frontend/`)

- **框架**：Vite 7 + React 19 + TypeScript 5
- **UI**：Tailwind CSS + shadcn 风格组件 + lucide-react
- **编辑器**：Monaco Editor（LaTeX 源码）+ react-markdown + remark-math + rehype-katex + katex
- **PDF**：pdfjs-dist
- **导出**：jspdf + html2canvas-pro
- **图表**：recharts
- **拖拽**：@dnd-kit
- **状态**：zustand
- **路由**：react-router-dom 7
- **HTTP**：axios
- **通知**：sonner

### 后端 (`backend/`)

- **框架**：FastAPI + Uvicorn（异步）
- **ORM**：SQLAlchemy 2 (async) + aiosqlite
- **任务队列**：Celery + Redis
- **VLM/OCR**：PyMuPDF + Pillow + onnxruntime + opencv-python-headless
- **AI 接入**：多 Provider 抽象（智谱/DeepSeek/OpenAI 兼容）
- **认证**：python-jose (JWT) + passlib (bcrypt)
- **校验**：ruff（lint + format）

### 第三方

- `MinerU-Ecosystem-main/` — PDF 解析与版面分析（保留为子模块）

## 目录结构

```
.
├── frontend/                     # Vite + React 前端
│   ├── src/
│   │   ├── pages/                # 路由页面
│   │   │   ├── PaperUploadPage.tsx
│   │   │   ├── PaperSplitPage.tsx
│   │   │   ├── ProofreadingWorkbench.tsx
│   │   │   ├── QuestionBankPage.tsx
│   │   │   ├── HomeworkComposePage.tsx
│   │   │   ├── ExportListPage.tsx
│   │   │   ├── StatsDashboardPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── components/           # 通用组件 + 题型插件
│   │   │   └── question/
│   │   │       ├── DualPaneEditor.tsx
│   │   │       ├── OptionLayoutInline.tsx     # 选择题分行插件
│   │   │       └── SubQuestionLayoutInline.tsx # 计算题分列插件
│   │   ├── utils/
│   │   │   └── latexConverter.ts              # LaTeX 解析/列数/占位
│   │   └── config/
│   ├── public/                   # 静态资源
│   └── package.json
│
├── backend/                      # FastAPI 后端
│   ├── app/
│   │   ├── api/                  # 路由：auth/papers/questions/...
│   │   ├── services/             # 业务服务
│   │   ├── models/               # SQLAlchemy 模型
│   │   ├── schemas/              # Pydantic 模型
│   │   ├── tasks/                # Celery 任务
│   │   ├── utils/
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── agent/                    # VLM/Agent 组件（canvas/tools）
│   ├── pipeline/                 # 解析流水线（parsers/stages）
│   ├── common/ conf/ llm/        # 公共模块 / 配置 / LLM 抽象
│   ├── data/                     # 数据与持久化
│   ├── scripts/                  # 运维脚本
│   ├── celery_app.py
│   └── pyproject.toml
│
├── MinerU-Ecosystem-main/        # PDF 解析第三方库（保留）
├── docs/ documents/              # 设计/方案/排错文档
└── .pre-commit-config.yaml
```

## 启动方式

### 前端

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
npm run lint
```

### 后端

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate  # macOS/Linux

pip install -e .         # 或：pip install -r requirements.txt（若有）

# 配置 AI Provider：复制 .env.example 为 .env 并填写 API Key
# 启动 API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 启动 Celery worker（新终端）
celery -A celery_app worker -l info

# 启动 Redis（worker 依赖）
redis-server
```

> **环境变量**：`.env` 与 `token.txt` 已在 `.gitignore` 中排除，请勿提交。

## 核心实现

### 双栏校对（DualPaneEditor）

[frontend/src/components/question/DualPaneEditor.tsx](frontend/src/components/question/DualPaneEditor.tsx)

- 左侧 Monaco LaTeX 源码，右侧 KaTeX 实时渲染
- 标题栏 `titleExtra` 槽位挂载题型插件

### 选择题分行（OptionLayoutInline）

[frontend/src/components/question/OptionLayoutInline.tsx](frontend/src/components/question/OptionLayoutInline.tsx)

两步骤使用：
1. 点【分行】→ 把 A./B./C./D. 形式包装为 `\begin{tasks}(N) \task ... \end{tasks}`
2. 点 1行/2行/3行/4行 → 仅替换列数 N

实现要点：用 HTML `<table>` 替代双空格 hack，真正分列 + 均匀分散；用 KaTeX 渲染绕过 react-markdown 在 `<td>` 内的公式解析限制。

### 计算题分列（SubQuestionLayoutInline）

[frontend/src/components/question/SubQuestionLayoutInline.tsx](frontend/src/components/question/SubQuestionLayoutInline.tsx)

- 【分列】→ 把多 `$$...$$` 块包装为 tasks（默认 1 列）
- 【1列/2列/3列/4列/5列/6列】→ 切换列数
- 【空】→ 在 `\end{tasks}` 前插入独立占位行（累加）
- 【还】→ 一键清空所有占位行

### LaTeX 工具（latexConverter.ts）

[frontend/src/utils/latexConverter.ts](frontend/src/utils/latexConverter.ts)

- `setTasksColumn(latex, N, questionType, options, stem)` — 改列数 / 自动包装 / 去除 A. 残留
- `stripChoiceOptionLines(latex, force)` — 清理选择题重复选项
- `formatTasksPreview(latex, ...)` — 预览 HTML 表格
- `extractMathBlocks(latex)` — 提取 `$$...$$` 块

## 开发规范

- **代码风格**（项目内规）：
  - JS/HTML：小驼峰命名（`getUserInfo`）
  - CSS：短横线（`study-box`）
  - 缩进：2 或 4 空格（项目统一）
  - 复杂逻辑拆小函数，行内中文注释
- **后端 lint**：`ruff check backend/`、`ruff format backend/`
- **前端 lint**：`cd frontend && npm run lint`
- **Pre-commit**：见 `.pre-commit-config.yaml`

## 文档

- [docs/](docs/) — 设计与方案文档
- [documents/](documents/) — 项目说明
- `web端报错.md` / `后端报错.md` — 历史排错记录（保留）

## License

Internal project. All rights reserved.
