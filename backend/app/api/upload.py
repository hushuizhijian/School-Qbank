"""
通用文件上传 API

功能：通用文件上传（LOGO、图片等）
输入参数：UploadFile / category
返回值：文件URL和路径
使用场景：上传LOGO、图片等非试卷文件
"""
import os
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, Form
from fastapi.responses import FileResponse

from app.utils.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/upload", tags=["上传"])

UPLOAD_DIR = os.path.join("data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("")
async def upload_file(
    file: UploadFile = File(...),
    category: str = Form("general"),
    current_user: User = Depends(get_current_user),
):
    """通用文件上传（LOGO、图片等）"""
    # 按类别创建子目录
    cat_dir = os.path.join(UPLOAD_DIR, category)
    os.makedirs(cat_dir, exist_ok=True)

    # 生成唯一文件名
    ext = os.path.splitext(file.filename or "file.png")[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(cat_dir, filename)

    # 保存文件
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # 返回可访问的 URL 路径
    url = f"/data/uploads/{category}/{filename}"
    return {"url": url, "filename": filename, "path": file_path}
