"""
文件工具模块（V2新增）

功能：提供文件上传保存、目录创建等文件操作工具函数
输入参数：上传文件对象、目录路径
返回值：保存后的文件路径
使用场景：试卷文件上传、图片保存、导出文件管理
"""
import os
import uuid
from fastapi import UploadFile


async def save_upload_file(file: UploadFile, upload_dir: str) -> str:
    """
    保存上传文件

    功能：将上传的文件保存到指定目录，使用UUID重命名避免冲突
    输入参数：file（FastAPI上传文件对象）、upload_dir（保存目录路径）
    返回值：保存后的文件完整路径
    使用场景：试卷PDF上传、图片上传
    """
    os.makedirs(upload_dir, exist_ok=True)  # 确保目录存在
    file_ext = os.path.splitext(file.filename)[1] if file.filename else ".pdf"  # 获取文件扩展名
    filename = f"{uuid.uuid4().hex}{file_ext}"  # UUID生成唯一文件名
    filepath = os.path.join(upload_dir, filename)  # 拼接完整路径
    content = await file.read()  # 读取文件内容
    with open(filepath, "wb") as f:
        f.write(content)  # 写入文件
    return filepath


def ensure_dir(path: str) -> None:
    """
    确保目录存在

    功能：如果目录不存在则创建，已存在则不做操作
    输入参数：path（目录路径）
    返回值：无
    使用场景：导出文件前确保目录存在
    """
    os.makedirs(path, exist_ok=True)  # 创建目录（已存在不报错）
