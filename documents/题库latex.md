# 题库 LaTeX 操作学习手册

> 适用范围：tools4 校对工作台"题目内容"左栏 LaTeX 源码编辑区
> 渲染链路：Monaco（左栏源码） → latexConverter 转 Markdown → React-Markdown + remark-math + rehype-katex（右栏预览）
> 渲染器：KaTeX 0.17 + tasks.sty 模拟实现（HTML 表格 + KaTeX.renderToString）

---

## 目录

- [一、整体架构与渲染链路](#一整体架构与渲染链路)
- [二、LaTeX 基础语法](#二latex-基础语法)
- [三、math 模式：公式书写规范](#三math-模式公式书写规范)
- [四、tasks.sty 选项/子题排版](#四taskssty-选项子题排版)
- [五、文本模式命令](#五文本模式命令)
- [六、图片、表格、段落排版](#六图片表格段落排版)
- [七、六种题型的推荐语法与示例](#七六种题型的推荐语法与示例)
- [八、预处理与排版优化](#八预处理与排版优化)
- [九、常见问题与排错指南](#九常见问题与排错指南)
- [十、参考代码与文件清单](#十参考代码与文件清单)

---

## 一、整体架构与渲染链路

### 1.1 三栏布局中"题目内容"的位置

```
┌────────────────────────────────────────────────────────────────┐
│  左栏 240px        │  中栏 360px       │  右栏 flex（题目编辑）   │
│  StatsPanel        │  AttributePanel   │  ┌──────────────────┐  │
│  QualityCheckGroup │  + 插件槽         │  │ 题目内容（双栏）  │  │
│  QuestionNavigator │                   │  │ ┌──────┬───────┐ │  │
│                   │                   │  │ │ 源码 │ 预览  │ │  │
│                   │                   │  │ │ Mon..│ KaTeX │ │  │
│                   │                   │  │ └──────┴───────┘ │  │
│                   │                   │  └──────────────────┘  │
│                   │                   │  ┌──────────────────┐  │
│                   │                   │  │ 解析内容（插件）  │  │
│                   │                   │  │ texta.+Preview   │  │
│                   │                   │  │ 挂载点：analysis-editor │
│                   │                   │  └──────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

右栏从上到下依次为：
1. **题目内容**：左 Monaco 源码 / 右 KaTeX 预览（LaTeX 形态）
2. **解析内容**：左 textarea Markdown 源码 / 右 PreviewRenderer 预览（Markdown + LaTeX 形态），由 `analysis-editor` 插件挂载

左栏的"源码区"即为本手册的目标区域。源码区的 LaTeX 字符串同时驱动：

1. **右栏预览**：经 `latexToPreview` 转换后由 React-Markdown + KaTeX 渲染
2. **持久化**：保存到数据库的 `questions.stem` / `latex_source` 字段
3. **PDF 导出**：后端 `latex_render_service` 用 matplotlib 二次渲染为 PNG 嵌入 PDF

### 1.2 渲染转换主流程

```
原始 LaTeX 字符串
    │
    ├─→ [预处理] protectMathRegions()  // 用占位符保护 $$...$$ 和 $...$ 区域
    │
    ├─→ [tasks 块] 匹配 \begin{tasks}(N) \task ... \end{tasks}
    │              → formatTasksPreview() 生成 HTML 表格
    │
    ├─→ [独立 \task] 转换为 **(A)** 等标签
    │
    ├─→ [文本命令] \text / \textbf / \underline 等 → Markdown
    │
    ├─→ [数学符号] \times → ×、\div → ÷、\neq → ≠ 等
    │
    ├─→ [还原数学区域] restoreMathRegions() 还原占位符
    │
    └─→ [Markdown] 交给 React-Markdown + remark-math + rehype-katex 渲染
```

> 关键点：所有 `$...$` / `$$...$$` 区域都被保护，原样交给 KaTeX；只有数学区域外的文本才做 LaTeX → Markdown 的文本模式转换。

### 1.3 任务相关代码位置

| 文件 | 职责 |
|------|------|
| [latexConverter.ts](file:///f:/tools4/frontend/src/utils/latexConverter.ts) | LaTeX ↔ Question 转换 + tasks 排版 |
| [latex.ts](file:///f:/tools4/frontend/src/utils/latex.ts) | 公式包裹/提取/校验/光标插入 |
| [PreviewRenderer.tsx](file:///f:/tools4/frontend/src/components/question/PreviewRenderer.tsx) | V2 直接渲染器：Markdown + LaTeX（带 prose 样式） |
| [KaTeXPreviewPanel.tsx](file:///f:/tools4/frontend/src/components/question/KaTeXPreviewPanel.tsx) | 题目内容右栏预览：LaTeX → Markdown → React-Markdown |
| [DualPaneEditor.tsx](file:///f:/tools4/frontend/src/components/question/DualPaneEditor.tsx) | 题目内容双栏外壳：Monaco + KaTeXPreviewPanel |
| [StemEditor.tsx](file:///f:/tools4/frontend/src/components/question/StemEditor.tsx) | 题干编辑：textarea + PreviewRenderer（V2 形态） |
| [AnswerEditor.tsx](file:///f:/tools4/frontend/src/components/question/AnswerEditor.tsx) | 答案编辑：textarea + PreviewRenderer（V2 形态） |
| [AnalysisEditor.tsx](file:///f:/tools4/frontend/src/components/question/AnalysisEditor.tsx) | 解析内容编辑：textarea + PreviewRenderer（V2 形态） |
| [OptionLayoutInline.tsx](file:///f:/tools4/frontend/src/components/question/OptionLayoutInline.tsx) | 选择题分行控件 |
| [SubQuestionLayoutInline.tsx](file:///f:/tools4/frontend/src/components/question/SubQuestionLayoutInline.tsx) | 计算题分列控件 |

---

## 二、LaTeX 基础语法

### 2.1 math 模式定界符

| 定界符 | 类型 | 用途 | 示例 |
|--------|------|------|------|
| `$...$` | 行内公式 | 一行内嵌公式 | `已知 $x^2 + y^2 = 1$` |
| `$$...$$` | 块级公式 | 独立一行的公式 | `$$\frac{1}{2} + \frac{1}{3}$$` |
| `\(` `\)` | 行内（不推荐） | 等价于 `$...$` | 不推荐使用 |
| `\[` `\]` | 块级（不推荐） | 等价于 `$$...$$` | 不推荐使用 |

> 本系统严格只识别 `$...$` 和 `$$...$$`（见 [latex.ts](file:///f:/tools4/frontend/src/utils/latex.ts#L55-L93) 的 `extractLatex`）。其他定界符不会被识别，公式不会渲染。

### 2.2 转义与特殊字符

| 字符 | 转义写法 | 备注 |
|------|----------|------|
| `\` | `\backslash` | 反斜杠本身 |
| `$` | `\$` | 在文本中保留美元符 |
| `{` `}` | `\{` `\}` | 数学中保留花括号 |
| `#` | `\#` | 井号 |
| `%` | `\%` | 百分号（数学模式外） |
| `&` | `\&` | 与号（数学模式外） |
| `_` | `\_` | 下划线（数学模式外） |
| `^` | `\^{}` | 脱字符 |
| `~` | `\~{}` | 波浪号 |
| 中文括号 | 直接使用 | `（）【】` 可直接用 |

### 2.3 注释与不可渲染内容

LaTeX 注释语法 `%` 在本系统中**不会被剔除**（不像真 LaTeX 编译器），所以**不要在源码中写 `%` 注释**，否则会原样显示在预览里。改用：
- 在右栏预览之外的口头注释
- 或代码上方留空行说明

---

## 三、math 模式：公式书写规范

### 3.1 基础运算

```latex
$a + b = c$              加法
$a \times b$             乘号 ×
$a \div b$               除号 ÷
$\frac{a}{b}$            分数 a/b
$\sqrt{x}$               平方根
$\sqrt[3]{x}$            立方根
$x^{2}$                  上标
$x_{i}$                  下标
$x_{i}^{2}$              上下标组合
```

### 3.2 关系运算符

```latex
$\leq$   $\geq$    小于等于 / 大于等于
$\neq$   $\approx$ 不等于 / 约等于
$\pm$    $\mp$     正负 / 负正
$\times$ $\div$    乘 / 除
```

### 3.3 几何符号

```latex
$\angle$      ∠  角
$\perp$       ⊥  垂直
$\parallel$   ∥  平行
$\triangle$   △  三角形
$\circ$       °  圆/度
$\degree$     °  度（与 \circ 等价）
```

### 3.4 常用数学结构

```latex
$\frac{a+b}{c+d}$                              嵌套分数
$\overline{AB}$                                线段 AB
$\widehat{ABC}$                                弧 ABC
$\begin{matrix} a & b \\ c & d \end{matrix}$   矩阵
$\boxed{x=2}$                                 框选（解题过程常用）
```

### 3.5 空格命令（数学模式内）

| 命令 | 宽度 | 用途 |
|------|------|------|
| `\,` | 3/18 em | 最小正向空格（推荐） |
| `\:` | 4/18 em | 中等空格 |
| `\;` | 5/18 em | 较大空格 |
| `\quad` | 1 em | 两个普通空格 |
| `\qquad` | 2 em | 四个普通空格 |
| `\!` | -3/18 em | 负空格（缩进） |
| `\;` 后接 `\;` | — | 显式拉开间距 |

> 空格在数学公式里意义重大：`a\,b` 和 `ab` 渲染宽度不同，可用于拉开乘积中因子间距。

---

## 四、tasks.sty 选项/子题排版

> 系统用 `tasks.sty` 的语法约定，但实际由前端用 HTML 表格模拟实现（[formatTasksPreview](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L827-L918)）。

### 4.1 标准语法

```latex
题干内容（已剥离选项文本）
\begin{tasks}(列数)
\task 选项1
\task 选项2
\task 选项3
\task 选项4
\end{tasks}
```

### 4.2 列数 N 的含义

| N 值 | 排布效果 | 适用场景 |
|------|----------|----------|
| `(4)` | 4 列 1 行 | 4 选项标准排版（默认） |
| `(2)` | 2 列 2 行 | 短选项/2 列并排 |
| `(3)` | 3 列 3 行 | 3 选项 |
| `(1)` | 1 列 4 行 | 每项独占一行 |
| `(N)` | N 列 1 行 | 计算题 N 列子题（计算题支持 1~6 列） |

> N 被限制在 1~8 之间（见 [setTasksColumn](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L705) 的 `safeColumns`）。

### 4.3 旧格式兼容

```latex
\begin{task}                                ← 不推荐，但被兼容
题干内容
\begin{tasks}(4)
\task A选项
\task B选项
\end{tasks}
\end{task}
```

新版编辑器统一用"新格式"（无外层 `\begin{task}`），旧格式仅在解析历史数据时被识别。

### 4.4 \task 内的公式

\task 单元格内部既支持纯文本也支持完整公式块：

```latex
\task 纯文本选项

\task $\frac{1}{2}$ 行内公式

\task $$\frac{a+b}{c+d}$$ 块级公式

\task $$\begin{aligned} x+y &= 5 \\ x-y &= 1 \end{aligned}$$ 复杂公式
```

> 实现上，\task 内的公式由 [katex.renderToString](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L788-L793) 渲染为 HTML 字符串嵌入 `<td>`，完全绕过 react-markdown 的 `$...$` 解析路径。

---

## 五、文本模式命令

> 这些命令只在**非数学区域**（即 `$...$` / `$$...$$` 之外）被转换；进入数学模式后保留原样，由 KaTeX 处理。

| LaTeX 命令 | 转换结果 | 说明 |
|-----------|----------|------|
| `\text{内容}` | `内容` | 文本包裹（数学模式中常用） |
| `\textbf{内容}` | `**内容**` | 加粗（Markdown 加粗） |
| `\emph{内容}` | `*内容*` | 斜体强调 |
| `\textit{内容}` | `*内容*` | 斜体 |
| `\underline{内容}` | `<u>内容</u>` | 下划线 |
| `\times` | `×` | 乘号（数学外） |
| `\div` | `÷` | 除号（数学外） |
| `\neq` | `≠` | 不等于 |
| `\leq` / `\geq` | `≤` / `≥` | 比较运算符 |
| `\approx` | `≈` | 约等于 |
| `\degree` / `\circ` | `°` | 度 |
| `\perp` | `⊥` | 垂直 |
| `\parallel` | `∥` | 平行 |
| `\angle` | `∠` | 角 |
| `\quad` | `  ` (2 空格) | 段落内间距 |
| `\qquad` | `    ` (4 空格) | 更大间距 |
| `\,` `\;` | 1 空格 | 精细间距 |
| `\!` | 空 | 负间距 |
| `\\` | `\n` | 段落内换行（数学外） |

---

## 六、图片、表格、段落排版

### 6.1 图片

```latex
\includegraphics[width=0.5\textwidth]{images/abc.jpg}
```

被转换为 `![](images/abc.jpg)` 交给 React-Markdown 渲染。路径前缀自动补全规则见 [fixImageUrl](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L69-L80)：

| 输入 | 转换 |
|------|------|
| `http://...` / `https://...` | 原样 |
| `/data/...` | 原样（Vite 代理处理） |
| `/images/...` | 改为 `/data/images/...` |
| 相对路径 | 补为 `/data/images/...` |

### 6.2 表格

本系统**不渲染 LaTeX 表格环境**（`\begin{tabular}` 等），但支持 HTML 表格直接嵌入：

```markdown
<table>
  <tr><td>A</td><td>B</td></tr>
  <tr><td>1</td><td>2</td></tr>
</table>
```

> 实际题库数据中常用 HTML 表格（如成绩表、统计表），原样保留即可。

### 6.3 段落与换行

```latex
第一段内容

第二段内容（两个换行 = 段落分隔）

同一段落内换行\\
第二行
```

- **段落分隔**：用一个空行（连续两个 `\n`）
- **段内换行**：用 `\\`（在非数学区域被转换为 `\n`）

---

## 七、六种题型的推荐语法与示例

### 7.1 选择题（choice / single_choice / multi_choice）

**目标**：清晰显示 A/B/C/D 四个选项，支持 1 行 / 2 行 / 3 行 / 4 行排布。

**推荐语法**：

```latex
解下列方程：$2x + 3 = 7$。

\begin{tasks}(4)
\task $x = 1$
\task $x = 2$
\task $x = 3$
\task $x = 4$
\end{tasks}
```

**排布说明**：

| 列数 | 排布 | 适用 |
|------|------|------|
| `(4)` | 1 行 4 列 | 标准单选题 |
| `(2)` | 2 行 2 列 | 选项较长（> 6 字） |
| `(3)` | 3 行 3 列 | 3 选项 |
| `(1)` | 1 列 4 行 | 选项特别长或含图 |

**注意**：
- 题干中**不要**再写 "A. xxx B. xxx C. xxx D. xxx"，重复会显示两组选项
- 切换排布：使用"分行"控件（[OptionLayoutInline](file:///f:/tools4/frontend/src/components/question/OptionLayoutInline.tsx)）

### 7.2 填空题（fill_blank）

**目标**：用 `( )` 或 `(\quad)` 表达待填空格。

**推荐语法**：

```latex
太平洋是世界上最大的洋，它的面积约是（一亿八千一百三十四万四千）平方千米，
四舍五入到亿位约是（\quad）亿。
```

**下划线变体**：

```latex
横线上的数写作( \underline{\hspace{2cm}} )，四舍五入到亿位约是( \underline{\hspace{1.5cm}} )亿。
```

### 7.3 判断题（true_false）

**目标**：对错二选一，常用 √/× 符号或文字。

**推荐语法**：

```latex
两条直线不相交就一定平行。（\quad）

A. √ \quad B. ×

（对 / 错）
```

或使用 unicode 符号直接输入：

```latex
下列说法是否正确？正确的画"√"，错误的画"×"。

1. 任何两个圆都是相似的。 ( \checkmark )

2. 0 除以任何数都得 0。 ( \times )
```

### 7.4 计算题（calculation）

**目标**：多个独立公式块排成 N 列子题，子题之间留空行。

**推荐语法**：

```latex
直接写出得数。

\begin{tasks}(2)
\task $$1.2 \times 0.6 =$$
\task $$0.5^{2} - 0.3^{2} =$$
\task $$\frac{2}{8} + \frac{5}{8} \times 0 =$$
\task $$2.5 \times 0.4 \div 2.5 =$$
\end{tasks}
```

**分列控制**：使用"分列"控件（[SubQuestionLayoutInline](file:///f:/tools4/frontend/src/components/question/SubQuestionLayoutInline.tsx)），支持 1~6 列切换。

**空行控制**：使用控件的"空"/"还"按钮，或手动在 `\end{tasks}` 前插入 `\task $$\n`。

### 7.5 操作题（operation）

**目标**：画图、连线、动手操作类，文本与图形混排。

**推荐语法**：

```latex
(1) 把图中的长方形绕点 A 逆时针旋转 $90^{\circ}$，画出旋转后的图形。

(2) 画出一个与长方形面积相等的三角形。

旋转后点 B 的位置用数对表示是（\quad，\quad）。
```

或带图：

```latex
\includegraphics[width=0.4\textwidth]{images/rotate.png}

(1) 标出旋转中心 O。
(2) 画出旋转 $60^{\circ}$ 后的图形。
```

### 7.6 解答题 / 解决问题（solution / application）

**目标**：多步骤解答过程，每步独立，步骤间留空行。

**推荐语法**：

```latex
小明买了 3 支铅笔和 2 块橡皮，共付 12 元。已知铅笔每支 2 元，
求橡皮每块多少元。

解：设橡皮每块 $x$ 元。

$$2 \times 3 + 2x = 12$$

$$6 + 2x = 12$$

$$2x = 6$$

$$x = 3$$

答：橡皮每块 \boxed{3} 元。
```

**注意**：
- 用 `$$...$$` 让等式独占一行（块级公式）
- 用 `\boxed{答案}` 框选最终答案
- 步骤间用一个空行分隔

---

## 八、预处理与排版优化

> 题目解析后入库前，建议在源码层做以下预处理，让右栏预览和 PDF 导出都受益。

### 8.1 选择题分行处理

**场景**：解析后的题干末尾是 `A. xxx B. xxx C. xxx D. xxx` 形式。

**预处理**：

```latex
解题思路：先化简再代入。

A. 6
B. 12
C. 18
D. 24
```

↓ 转换后（点击"分行"按钮自动生成）：

```latex
解题思路：先化简再代入。

\begin{tasks}(4)
\task 6
\task 12
\task 18
\task 24
\end{tasks}
```

**自动剥离规则**：详见 [stripOptionsFromStem](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L199-L229)，匹配以下格式：
- `A. xxx B. xxx C. xxx D. xxx`（点号）
- `A、xxx B、xxx`（顿号）
- `A xxx B xxx`（无分隔符）
- `A.xxx B.xxx`（紧凑格式）

### 8.2 计算题分列 + 上下空行

**场景**：多个独立 `$$...$$` 块需要按列排布并加空行。

**预处理前**：

```latex
1.2 \times 0.6 =
$$
0.5^{2} - 0.3^{2} =
$$
```

**分列后（点击"分列"按钮生成 1 列）**：

```latex
\begin{tasks}(1)
\task $$1.2 \times 0.6 =$$
\task $$\0.5^{2} - 0.3^{2} =$$
\end{tasks}
```

**增加上下空行**：

方法 1：用"空"按钮（推荐），自动在 `\end{tasks}` 前插入 `\task $$\n`：

```latex
\begin{tasks}(2)
\task $$1.2 \times 0.6 =$$
\task $$0.5^{2} - 0.3^{2} =$$
\task $$                       ← 由"空"按钮插入的空行
\end{tasks}
```

方法 2：手动添加 `\task $$\n` 行（效果同"空"按钮）。

**删除空行**：用"还"按钮，正则 `\s*\\task\s+\$+\n` 匹配所有空行占位。

### 8.3 增加括号之间的空间

**场景**：公式内括号拥挤，渲染时括号和内容粘在一起。

**示例**（原始）：

```latex
$f(x) = (x+1)(x-1)$
```

渲染为：`f(x) = (x + 1)(x − 1)` —— 括号紧贴数字。

**优化后**：

```latex
$f(x) = (\,x + 1\,)(\,x - 1\,)$
```

渲染为：`f(x) = ( x + 1 )( x − 1 )` —— 括号内各有 3/18 em 间隙。

**其他空格命令**：

| 命令 | 宽度 | 场景 |
|------|------|------|
| `\,` | 3/18 em | 括号内侧（推荐） |
| `\:` | 4/18 em | 中等间隙 |
| `\;` | 5/18 em | 较大间隙 |
| `\quad` | 1 em | 明显留白 |
| `\!` | -3/18 em | 缩进（去除多余空白） |

### 8.4 下划线长度设置

**场景**：填空题需要指定长度的下划线。

**基础写法**：

```latex
姓名：\underline{\hspace{4cm}}
```

**指定高度和粗细**（用 `\rule`）：

```latex
姓名：\rule{4cm}{0.4pt}
```

参数：宽度 4cm，高度 0.4pt（标准细线）。

**组合使用**（带文字占位）：

```latex
结果：\underline{\;3\;}
```

或更明确的占位：

```latex
\underline{\hspace{2cm}}
```

### 8.5 其他常见预处理

| 场景 | 原始 | 优化后 | 效果 |
|------|------|--------|------|
| 分数间距 | `$\frac12$` | `$\frac{1}{2}$` | 渲染更清晰 |
| 多位数 | `$90$` | `$90$`（已正确） | 防止 OCR 拆成 `$9 0$` |
| 乘号 | `2*3` | `$2 \times 3$` | 避免星号歧义 |
| 角度 | `90°` | `$90^{\circ}$` | 字体一致 |
| 百分比 | `50%` | `$50\%$` | 数学模式内百分号 |
| 省略号 | `...` | `$\cdots$` | 居中省略号 |
| 区间 | `(0,1)` | $(0,\,1)$ | 增加逗号后空格 |
| 行间对齐 | `a=1 b=2` | `$$a=1 \quad b=2$$` | 块级公式内对齐 |

### 8.6 空格与换行速查

```
单空格：\, 或 \;
双空格：\quad
四空格：\qquad
负空格：\!
段内换行（非数学）：\\
段落分隔：空行
块级公式独占：$$...$$
```

---

## 九、常见问题与排错指南

### 9.1 公式不渲染

| 症状 | 原因 | 解决 |
|------|------|------|
| `$x$` 显示为纯文本 | 缺右 `$` | 补全 `$x$` |
| 整段乱码 | 嵌套 `$` 冲突 | 检查 `$$...$$` 内是否有 `$` |
| 报错"公式解析失败" | 括号不匹配 | 配对 `{ }` `\[ \]` `\( \)` |
| `\begin{...}` 报错 | 环境未闭合 | 补 `\end{...}` |

### 9.2 排版异常

| 症状 | 原因 | 解决 |
|------|------|------|
| 选择题出现两组选项 | 题干 + tasks 块重复 | 删题干中的 `A. xxx B. xxx` |
| 计算题挤在一起 | 缺分列 | 点"分列"按钮 |
| 子题间无空行 | 缺占位 | 点"空"按钮 |
| 括号拥挤 | 缺 `\,` | 在括号内侧加 `\,` |
| 下划线太短 | 缺宽度参数 | 用 `\underline{\hspace{Ncm}}` |

### 9.3 数据格式验证

源码保存到 `latex_source` 字段后，可通过以下方式校验：

```python
# Python 后端校验
import re
def validate_latex(latex: str) -> list[str]:
    errors = []
    # 检查 \begin / \end 配对
    begins = re.findall(r'\\begin\{(\w+)\}', latex)
    ends = re.findall(r'\\end\{(\w+)\}', latex)
    if len(begins) != len(ends):
        errors.append(f"环境数量不匹配: {len(begins)} 个 \\begin, {len(ends)} 个 \\end")
    # 检查 $ 配对
    dollar_count = latex.count('$') - 2 * latex.count('$$')
    if dollar_count % 2 != 0:
        errors.append("$ 符号未配对")
    return errors
```

前端校验见 [validateLatex](file:///f:/tools4/frontend/src/utils/latex.ts#L101-L169)。

### 9.4 高频错误速查

| 错误 | 正确写法 | 错误写法 |
|------|----------|----------|
| 分数 | `\frac{a}{b}` | `\frac a b` |
| 乘号 | `\times` | `*` |
| 乘积 | `2 \times 3` | `2x3` |
| 平方 | `x^{2}` | `x^2`（x 多字符时错） |
| 下标 | `x_{i}` | `x_i`（同上） |
| 分数嵌套 | `\frac{a}{b}` | `1/a` |
| 块级 | `$$x$$` | `$x$`（无空行） |

---

## 十、参考代码与文件清单

### 10.1 前端核心文件

| 文件 | 角色 |
|------|------|
| [latexConverter.ts](file:///f:/tools4/frontend/src/utils/latexConverter.ts) | LaTeX ↔ Question 双向转换 + tasks 排版核心 |
| [latex.ts](file:///f:/tools4/frontend/src/utils/latex.ts) | 公式包裹/提取/校验/光标插入 |
| [PreviewRenderer.tsx](file:///f:/tools4/frontend/src/components/question/PreviewRenderer.tsx) | V2 通用预览渲染器：Markdown + LaTeX（prose 样式） |
| [KaTeXPreviewPanel.tsx](file:///f:/tools4/frontend/src/components/question/KaTeXPreviewPanel.tsx) | 题目内容右栏预览：先经 latexToPreview 转换再渲染 |
| [DualPaneEditor.tsx](file:///f:/tools4/frontend/src/components/question/DualPaneEditor.tsx) | 题目内容双栏外壳：Monaco 源码 + KaTeXPreviewPanel |
| [StemEditor.tsx](file:///f:/tools4/frontend/src/components/question/StemEditor.tsx) | 题干编辑：textarea + PreviewRenderer |
| [AnswerEditor.tsx](file:///f:/tools4/frontend/src/components/question/AnswerEditor.tsx) | 答案编辑：textarea + PreviewRenderer |
| [AnalysisEditor.tsx](file:///f:/tools4/frontend/src/components/question/AnalysisEditor.tsx) | 解析内容编辑：textarea + PreviewRenderer（被 analysis-editor 插件包装） |
| [OptionLayoutInline.tsx](file:///f:/tools4/frontend/src/components/question/OptionLayoutInline.tsx) | 选择题分行控件 |
| [SubQuestionLayoutInline.tsx](file:///f:/tools4/frontend/src/components/question/SubQuestionLayoutInline.tsx) | 计算题分列控件 |
| [ProofreadingWorkbench.tsx](file:///f:/tools4/frontend/src/pages/ProofreadingWorkbench.tsx) | 校对工作台主页面 |

### 10.2 后端渲染文件

| 文件 | 角色 |
|------|------|
| [latex_render_service.py](file:///f:/tools4/backend/app/services/latex_render_service.py) | LaTeX → PNG（PDF 导出用） |
| [pdf_service.py](file:///f:/tools4/backend/app/services/pdf_service.py) | PDF 导出主流程 |

### 10.3 依赖版本

```json
{
  "katex": "0.17.0",
  "react-markdown": "10.1.0",
  "remark-math": "6.0.0",
  "rehype-katex": "7.0.0",
  "rehype-raw": "7.0.0",
  "monaco-editor": "0.55.1"
}
```

### 10.4 关键函数速查

| 函数 | 作用 | 文件位置 |
|------|------|----------|
| `questionToLatex(stem, options, type)` | Question → LaTeX（含 tasks 包装） | [latexConverter.ts:256](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L256-L286) |
| `latexToQuestion(latex, type)` | LaTeX → Question | [latexConverter.ts:338](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L338-L398) |
| `latexToPreview(latex, images, pos, opts)` | LaTeX → Markdown（预览用） | [latexConverter.ts:421](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L421-L531) |
| `setTasksColumn(latex, N, type, opts, stem)` | 切换列数 + 自动包装 | [latexConverter.ts:695](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L695-L755) |
| `getTasksColumn(latex)` | 提取当前列数 N | [latexConverter.ts:609](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L609-L622) |
| `stripOptionsFromStem(stem, options)` | 题干剥离选项文本 | [latexConverter.ts:199](file:///f:/tools4/frontend/src/utils/latexConverter.ts#L199-L229) |
| `validateLatex(latex)` | 括号/环境校验 | [latex.ts:101](file:///f:/tools4/frontend/src/utils/latex.ts#L101-L169) |
| `extractLatex(text)` | 提取所有 `$...$` / `$$...$$` | [latex.ts:55](file:///f:/tools4/frontend/src/utils/latex.ts#L55-L93) |
| `wrapInlineLatex(text)` | 包裹行内公式 | [latex.ts:31](file:///f:/tools4/frontend/src/utils/latex.ts#L31-L35) |
| `wrapBlockLatex(text)` | 包裹块级公式 | [latex.ts:43](file:///f:/tools4/frontend/src/utils/latex.ts#L43-L47) |

### 10.5 关键组件速查

| 组件 | 角色 | 文件位置 |
|------|------|----------|
| `PreviewRenderer` | V2 通用渲染器：直接渲染 Markdown + LaTeX（带 `prose` 样式） | [PreviewRenderer.tsx:26](file:///f:/tools4/frontend/src/components/question/PreviewRenderer.tsx#L26-L46) |
| `KaTeXPreviewPanel` | 题目内容右栏预览：先经 `latexToPreview` 转换再渲染 | [KaTeXPreviewPanel.tsx:40](file:///f:/tools4/frontend/src/components/question/KaTeXPreviewPanel.tsx#L40-L116) |
| `DualPaneEditor` | 题目内容双栏外壳：Monaco 源码 + KaTeXPreviewPanel | [DualPaneEditor.tsx:67](file:///f:/tools4/frontend/src/components/question/DualPaneEditor.tsx#L67-L217) |
| `StemEditor` | 题干编辑：textarea + PreviewRenderer | [StemEditor.tsx:28](file:///f:/tools4/frontend/src/components/question/StemEditor.tsx#L28-L96) |
| `AnswerEditor` | 答案编辑：textarea + PreviewRenderer | [AnswerEditor.tsx:22](file:///f:/tools4/frontend/src/components/question/AnswerEditor.tsx#L22-L50) |
| `AnalysisEditor` | 解析内容编辑：textarea + PreviewRenderer（被 `analysis-editor` 插件包装） | [AnalysisEditor.tsx:22](file:///f:/tools4/frontend/src/components/question/AnalysisEditor.tsx#L22-L50) |
| `AnalysisEditorWrapper` | 解析内容插件包装器：把 `AnalysisEditor` 接入 `PluginProps` | [AnalysisEditorWrapper.tsx](file:///f:/tools4/frontend/src/components/plugins/wrappers/AnalysisEditorWrapper.tsx) |

---

## 附录：完整示例（题库真实题型）

### A. 选择题示例

```latex
下列百分率中，可能超过 $100\%$ 的是（\quad）。

\begin{tasks}(4)
\task 种子的成活率
\task 一次测试的及格率
\task 销售量的增长率
\task 大豆的出油率
\end{tasks}
```

### B. 填空题示例

```latex
右图中涂色部分与整个图形的面积关系可以用下面的式子表示：

( \underline{\hspace{1.5cm}} ) : $8 = \frac{(\quad)}{16} = 12 \div (\quad) = (\quad)\%$
```

### C. 计算题示例（分列 + 空行）

```latex
用递等式计算。

\begin{tasks}(2)
\task $$\frac{8}{9} \times \frac{2}{5} \div \frac{8}{15}$$
\task $$\frac{3}{5} \times 24 + 7 \times 0.6 - \frac{3}{5}$$
\task $$9.83 - \left(4.93 + 2\frac{1}{4}\right)$$
\task $$24 \div \left(\frac{5}{12} - \frac{3}{8}\right) \times \frac{1}{48}$$
\task $$                       ← 空行
\end{tasks}
```

### D. 解答题示例

```latex
为了预防感冒，某学校六(1)班老师用 13 升姜汁加水调制了 55 升姜汤。
校医说："当姜汁和水的比是 3:7 时，效果最佳。"
为了使调制的姜汤效果最佳，应该再往调制的姜汤中加多少升姜汁？

解：设需要再加 $x$ 升姜汁。

$$\frac{13 + x}{55 + x} = \frac{3}{7}$$

$$7(13 + x) = 3(55 + x)$$

$$91 + 7x = 165 + 3x$$

$$4x = 74$$

$$x = 18.5$$

答：应该再加入 \boxed{18.5} 升姜汁。
```

### E. 操作题示例

```latex
(1) 把图中的长方形绕点 A 逆时针旋转 $90^{\circ}$，画出旋转后的图形。

\includegraphics[width=0.5\textwidth]{images/rect.png}

旋转后点 B 的位置用数对表示是（\underline{\hspace{1.5cm}}，\underline{\hspace{1.5cm}}）。

(2) 画出一个与长方形面积相等的三角形。
如果按 2:1 的比将三角形放大，
放大后的三角形与原来三角形的面积比是（\underline{\hspace{2cm}}）。
```

### F. 判断题示例

```latex
下列说法是否正确？正确的画"√"，错误的画"×"。

\begin{tasks}(2)
\task 任何两个圆都是相似的。\quad ( \checkmark )
\task 0 除以任何数都得 0。\quad ( \times )
\task 圆周率 $\pi$ 约等于 3.14。
\task 半圆的周长等于圆周长的一半。
\end{tasks}
```

---

> 手册版本：v1.0 · 适配 tools4 题库 LaTeX 渲染体系
> 最后更新：2026-06-23
