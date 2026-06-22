"""
提示词模板生成器

功能：加载模板文件，支持变量替换
输入参数：template_name（模板名称）、variables（变量字典）
返回值：渲染后的提示词文本
使用场景：LLM 组件动态生成 Prompt
"""
from pathlib import Path


# 模板目录路径
TEMPLATES_DIR = Path(__file__).parent / "templates"  # agent/prompts/templates/


def load_template(template_name: str) -> str:
    """
    加载模板文件

    Args:
        template_name: 模板文件名（不含扩展名）

    Returns:
        模板内容字符串
    """
    template_path = TEMPLATES_DIR / f"{template_name}.md"  # 模板文件路径
    if not template_path.exists():
        return ""
    with open(template_path, "r", encoding="utf-8") as f:  # 以 UTF-8 编码打开
        return f.read()


def render_template(template_name: str, variables: dict = None) -> str:
    """
    渲染模板：加载模板并替换变量

    Args:
        template_name: 模板文件名
        variables: 变量字典

    Returns:
        渲染后的提示词文本
    """
    template = load_template(template_name)  # 加载模板
    if not template:
        return ""

    if variables:
        for key, value in variables.items():
            placeholder = "{{" + key + "}}"  # 构建占位符
            template = template.replace(placeholder, str(value))

    return template


def list_templates() -> list[str]:
    """
    列出所有可用模板

    Returns:
        模板文件名列表
    """
    if not TEMPLATES_DIR.exists():
        return []
    return [
        f.stem  # 文件名（不含扩展名）
        for f in TEMPLATES_DIR.glob("*.md")
    ]