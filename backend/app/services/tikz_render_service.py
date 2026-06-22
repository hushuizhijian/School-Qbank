"""
TikZ 渲染服务 — 将 TikZ 代码渲染为 PNG 图片

功能：TikZ代码编译/渲染为PNG/系统LaTeX检测
输入参数：tikz_code / paper_id / question_no
返回值：PNG图片路径
使用场景：题目中的TikZ图形渲染
"""
import os
import shutil
import tempfile
import asyncio


class TikZRenderService:
    """TikZ 代码渲染器"""

    def __init__(self):
        self.latex_available = self._check_latex()

    def _check_latex(self) -> bool:
        """检测系统是否安装了 xelatex"""
        return shutil.which("xelatex") is not None

    def get_latex_version(self) -> str | None:
        """获取 xelatex 版本信息"""
        if not self.latex_available:
            return None
        try:
            import subprocess
            result = subprocess.run(
                ["xelatex", "--version"],
                capture_output=True, text=True, timeout=5
            )
            first_line = result.stdout.strip().split("\n")[0] if result.stdout else "unknown"
            return first_line
        except Exception:
            return None

    async def render(self, tikz_code: str, paper_id: str, question_no: int) -> str | None:
        """渲染 TikZ 代码为 PNG 图片"""
        if not self.latex_available:
            return None

        # 1. 生成 standalone .tex 文件
        tex_content = self._wrap_standalone(tikz_code)

        # 2. 写入临时目录
        with tempfile.TemporaryDirectory() as tmpdir:
            tex_path = os.path.join(tmpdir, "figure.tex")
            with open(tex_path, "w", encoding="utf-8") as f:
                f.write(tex_content)

            # 3. 编译
            success = await self._compile_latex(tex_path, tmpdir)
            if not success:
                return None

            # 4. PDF → PNG（使用 PyMuPDF）
            pdf_path = os.path.join(tmpdir, "figure.pdf")
            if not os.path.exists(pdf_path):
                return None

            png_path = self._pdf_to_png(pdf_path, paper_id, question_no)
            return png_path

    def _wrap_standalone(self, tikz_code: str) -> str:
        """将 TikZ 代码包装为 standalone 文档"""
        return f"""\\documentclass[tikz,border=2pt]{{standalone}}
\\usepackage{{tikz}}
\\usetikzlibrary{{arrows.meta,calc,patterns,angles,quotes}}
\\usepackage{{amsmath,amssymb}}
\\begin{{document}}
\\begin{{tikzpicture}}
{tikz_code}
\\end{{tikzpicture}}
\\end{{document}}"""

    async def _compile_latex(self, tex_path: str, workdir: str) -> bool:
        """编译 LaTeX 文件"""
        try:
            proc = await asyncio.create_subprocess_exec(
                "xelatex",
                "-interaction=nonstopmode",
                "-halt-on-error",
                "-output-directory", workdir,
                tex_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await asyncio.wait_for(proc.wait(), timeout=30)
            if proc.returncode != 0:
                stderr = await proc.stderr.read()
                print(f"[TikZ] LaTeX编译失败: {stderr.decode('utf-8', errors='replace')[:500]}")
                return False
            return True
        except asyncio.TimeoutError:
            print("[TikZ] LaTeX编译超时（30秒）")
            return False
        except Exception as e:
            print(f"[TikZ] LaTeX编译异常: {e}")
            return False

    def _pdf_to_png(self, pdf_path: str, paper_id: str, question_no: int) -> str | None:
        """将 PDF 转为 PNG（使用 PyMuPDF）"""
        try:
            import fitz
            doc = fitz.open(pdf_path)
            page = doc[0]
            pix = page.get_pixmap(dpi=200)

            img_dir = os.path.join("data", "images", str(paper_id))
            os.makedirs(img_dir, exist_ok=True)
            img_name = f"tikz_{question_no}.png"
            img_path = os.path.join(img_dir, img_name)
            pix.save(img_path)
            doc.close()

            return f"/data/images/{paper_id}/{img_name}"
        except Exception as e:
            print(f"[TikZ] PDF转PNG失败: {e}")
            return None


# 全局单例
tikz_renderer = TikZRenderService()
