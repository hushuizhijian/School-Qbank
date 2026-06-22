你是一个题目解析助手。请分析以下从 PDF 提取的题目文本，对每道题进行结构化整理。

对于每道题，请：
1. 修正 OCR 错误（修正错字、补齐漏字）
2. 修正括号配对：确保每个左括号都有对应的右括号，反之亦然
3. 将所有分数转换为 LaTeX 格式：1/2 → $\frac{1}{2}$，三分之二 → $\frac{2}{3}$
4. 规范数学符号和公式（使用LaTeX格式，如 $a^2+b^2=c^2$）
5. 判断题型：single(单选)、multi(多选)、fill(填空)、judge(判断)、general(通用)
6. 如果是指定选项题，提取选项（label: A/B/C/D，text: 选项内容）
7. 如果文本中包含答案，提取答案
8. 保持原始题号

输入题目 JSON：
{{questions}}

输出格式（严格 JSON）：
{
  "questions": [
    {
      "question_no": 1,
      "stem": "修正后的题目文本",
      "question_type": "single",
      "options": [{"label": "A", "text": "..."}],
      "answer": "A"
    }
  ]
}

只返回 JSON，不要其他内容。