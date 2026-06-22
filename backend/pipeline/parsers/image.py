"""
图片解析器

功能：读取图片文件，提取基本信息
输入参数：image_path（图片文件路径）
返回值：解析结果字典（含 width, height, format）
使用场景：管道解析阶段，解析图片格式的试卷
"""
import os
from PIL import Image


class ImageParser:
    """图片解析器"""

    def __init__(self, image_path: str):
        self.image_path = image_path  # 图片文件路径

    def parse(self) -> dict:
        """
        解析图片文件

        Returns:
            解析结果字典
        """
        if not os.path.exists(self.image_path):
            return {"error": f"图片文件不存在: {self.image_path}"}

        try:
            img = Image.open(self.image_path)  # 打开图片
            width, height = img.size  # 获取尺寸

            return {
                "width": width,
                "height": height,
                "format": img.format,  # 图片格式
                "mode": img.mode,  # 颜色模式
                "file_size": os.path.getsize(self.image_path),  # 文件大小
            }
        except Exception as e:
            return {"error": f"图片解析失败: {str(e)}"}

    def to_base64(self) -> str:
        """
        将图片转为 base64 编码

        Returns:
            base64 编码字符串
        """
        import base64
        try:
            with open(self.image_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        except Exception as e:
            print(f"[ImageParser] base64 编码失败: {e}")
            return ""