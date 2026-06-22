"""
迁移脚本：把 data/images/{paper_id}/ 下的历史图片统一搬运到 data/papers/{paper_id}/images/

V3 路径方案：
  - 旧路径：data/images/{paper_id}/xxx.jpg
  - 新路径：data/papers/{paper_id}/images/xxx.jpg
  - 与 MinerU content_list.json / output.md / output.tex 中的相对路径规则完全一致

功能：
  1. 遍历 data/images/ 下所有 paper_id 子目录
  2. 把每张图片移动到 data/papers/{paper_id}/images/ 下
  3. 移动完成后尝试删除空的 data/images/{paper_id}/ 目录
  4. 统计并输出迁移报告

使用场景：
  - 系统升级后，已存在的历史试卷（解析完成但图片仍在旧目录）需要一次性迁移
  - 迁移完成后，新解析的试卷会自动存到统一目录

运行方式（在 backend 目录下）：
  python scripts/migrate_images_to_papers.py
  或加 --dry-run 预览不执行：
  python scripts/migrate_images_to_papers.py --dry-run

注意：
  - 脚本是幂等的：已迁移的文件不会重复移动
  - 不会删除 data/images/ 顶层目录（仅删除空的子目录）
  - 迁移过程安全：如目标已存在同名文件则跳过
"""
import os
import shutil
import sys

# 把 backend/ 加入 sys.path，确保可以 import app.* 模块
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# 支持的图片后缀
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".bmp")

# 旧目录与新目录的相对路径
OLD_IMG_ROOT = os.path.join("data", "images")            # data/images/{id}/xxx.jpg
NEW_PAPER_ROOT = os.path.join("data", "papers")          # data/papers/{id}/


def migrate_one_paper(paper_id: str, dry_run: bool = False) -> dict:
    """
    迁移单个试卷的历史图片到 paper_dir/images/ 下

    输入参数：
      paper_id: 试卷 ID
      dry_run: 仅统计不实际移动（用于预览）
    返回值：
      统计信息字典
    """
    old_dir = os.path.join(OLD_IMG_ROOT, paper_id)                # data/images/{id}/
    new_dir = os.path.join(NEW_PAPER_ROOT, paper_id)              # data/papers/{id}/
    new_images_dir = os.path.join(new_dir, "images")              # data/papers/{id}/images/
    stats = {
        "paper_id": paper_id,
        "moved": 0,
        "skipped": 0,
        "errors": 0,
    }
    if not os.path.isdir(old_dir):
        return stats

    # 目标就是源 → 跳过（无意义）
    if os.path.abspath(old_dir) == os.path.abspath(new_images_dir):
        return stats

    # 确保目标 paper_dir/images/ 存在
    if not dry_run:
        os.makedirs(new_images_dir, exist_ok=True)

    for fname in sorted(os.listdir(old_dir)):
        if not fname.lower().endswith(IMAGE_EXTS):
            continue
        src = os.path.join(old_dir, fname)
        dst = os.path.join(new_images_dir, fname)
        if not os.path.isfile(src):
            continue
        try:
            if os.path.exists(dst):
                # 目标已存在 → 跳过（避免覆盖）
                stats["skipped"] += 1
                continue
            if dry_run:
                stats["moved"] += 1
            else:
                shutil.move(src, dst)
                stats["moved"] += 1
        except Exception as e:
            print(f"  [错误] 移动 {src} -> {dst} 失败: {e}")
            stats["errors"] += 1

    # 迁移完成后尝试删除空目录
    if not dry_run and stats["moved"] > 0 and stats["errors"] == 0:
        try:
            os.rmdir(old_dir)
            print(f"  [清理] 旧目录已删除: {old_dir}")
        except OSError as e:
            print(f"  [提示] 旧目录保留(非空): {old_dir} - {e}")

    return stats


def main():
    """执行迁移主流程"""
    print("=" * 60)
    print("图片路径迁移（V3 方案）")
    print("旧：data/images/{id}/xxx.jpg")
    print("新：data/papers/{id}/images/xxx.jpg")
    print("=" * 60)

    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("[预览模式] 仅统计，不实际移动文件")
        print()

    if not os.path.isdir(OLD_IMG_ROOT):
        print(f"[退出] 旧目录不存在: {OLD_IMG_ROOT}（无需迁移）")
        return

    paper_ids = sorted(
        d for d in os.listdir(OLD_IMG_ROOT)
        if os.path.isdir(os.path.join(OLD_IMG_ROOT, d))
    )
    if not paper_ids:
        print(f"[退出] {OLD_IMG_ROOT} 下没有试卷子目录（无需迁移）")
        return

    print(f"发现 {len(paper_ids)} 个试卷的历史图片目录")
    print()

    total_moved = 0
    total_skipped = 0
    total_errors = 0

    for paper_id in paper_ids:
        print(f"-> 迁移试卷: {paper_id}")
        stats = migrate_one_paper(paper_id, dry_run=dry_run)
        print(
            f"   移动 {stats['moved']} 张, 跳过 {stats['skipped']} 张, "
            f"错误 {stats['errors']} 张"
        )
        total_moved += stats["moved"]
        total_skipped += stats["skipped"]
        total_errors += stats["errors"]

    print()
    print("=" * 60)
    mode = "[预览]" if dry_run else ""
    print(
        f"{mode}迁移完成: 共移动 {total_moved} 张, "
        f"跳过 {total_skipped} 张, 错误 {total_errors} 张"
    )
    print("=" * 60)


if __name__ == "__main__":
    main()
