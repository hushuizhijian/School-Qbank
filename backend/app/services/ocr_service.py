"""
PP-OCRv6 ONNX 版面定位层 — 可插拔模块

职责（只做像素检测，不参与语义理解）：
  1. 像素级版面分析：输出全部图形高精度坐标框
  2. 文本块坐标提取：辅助校正 VLM 文本错位、漏行
  3. 补齐 VLM 视觉漏检：细长线段、低对比度小几何图、排版边缘配图
  4. 图形裁切：根据精确坐标裁切独立图片

全局开关：settings.ocr_enabled = False 时，整个模块不加载、不执行、不依赖
流程自动退化为纯 VLM 轻量化模式

依赖：onnxruntime + opencv-python-headless + numpy（无需 PaddlePaddle）

模型（首次运行自动下载）：
  - 检测模型: PP-OCRv4 文本检测 ONNX (~2.5MB)
  - 模型目录: data/ocr_models/
"""
import os
import cv2
import numpy as np
from pathlib import Path
from urllib.request import urlretrieve

# 模型目录
MODEL_DIR = Path("data/ocr_models")
# PP-OCR 检测模型 ONNX
DET_MODEL_URL = "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_det_infer.onnx"
DET_MODEL_PATH = MODEL_DIR / "ch_PP-OCRv4_det_infer.onnx"


def _ensure_model():
    """确保 ONNX 模型文件存在，不存在则自动下载"""
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    if not DET_MODEL_PATH.exists():
        print(f"[OCR] 下载 PP-OCR 检测模型到 {DET_MODEL_PATH}...")
        try:
            urlretrieve(DET_MODEL_URL, str(DET_MODEL_PATH))
            print("[OCR] 模型下载完成")
        except Exception as e:
            print(f"[OCR] 模型下载失败: {e}")
            raise RuntimeError("PP-OCR ONNX 模型下载失败，请检查网络连接") from e


def compute_iou(box_a: list, box_b: list) -> float:
    """计算两个轴对齐矩形框的 IoU

    Args:
        box_a: [x1, y1, x2, y2]
        box_b: [x1, y1, x2, y2]

    Returns:
        IoU 值 [0, 1]
    """
    x1_a, y1_a, x2_a, y2_a = box_a
    x1_b, y1_b, x2_b, y2_b = box_b

    inter_x1 = max(x1_a, x1_b)
    inter_y1 = max(y1_a, y1_b)
    inter_x2 = min(x2_a, x2_b)
    inter_y2 = min(y2_a, y2_b)

    if inter_x1 >= inter_x2 or inter_y1 >= inter_y2:
        return 0.0

    inter_area = (inter_x2 - inter_x1) * (inter_y2 - inter_y1)
    area_a = (x2_a - x1_a) * (y2_a - y1_a)
    area_b = (x2_b - x1_b) * (y2_b - y1_b)

    if area_a <= 0 or area_b <= 0:
        return 0.0

    return inter_area / (area_a + area_b - inter_area)


class OcrLayoutService:
    """PP-OCRv6 ONNX 版面定位层（可插拔模块）

    职责边界：
      - 只输出位置数据（坐标框），不参与题目语义拆分、图文关联判断
      - 语义判断（过滤水印/装饰、图文绑定）由 VLM 负责
    """

    def __init__(self):
        self._session = None
        self._enabled = None  # None = 未检查

    @property
    def enabled(self) -> bool:
        """全局开关检查：懒加载，仅检查一次"""
        if self._enabled is None:
            from app.config import settings
            self._enabled = settings.ocr_enabled
        return self._enabled

    @property
    def session(self):
        """延迟加载 ONNX Runtime 会话（仅在 enabled=True 时加载）"""
        if not self.enabled:
            return None
        if self._session is None:
            _ensure_model()
            import onnxruntime as ort
            providers = ["CPUExecutionProvider"]
            try:
                self._session = ort.InferenceSession(
                    str(DET_MODEL_PATH), providers=providers
                )
                print("[OCR] ONNX 模型加载成功")
            except Exception as e:
                print(f"[OCR] ONNX 模型加载失败: {e}")
                raise RuntimeError("PP-OCR ONNX 模型加载失败") from e
        return self._session

    # ==================== 统一版面分析入口 ====================

    def analyze_layout(self, image: np.ndarray) -> dict:
        """统一版面分析入口 — 对整张试卷图做像素级版面分析

        这是 OCR 模块对外暴露的唯一主入口。

        Args:
            image: BGR 格式的 numpy 图片数组 (H, W, 3)

        Returns:
            {
                "text_blocks": [
                    {"bbox": [x1,y1,x2,y2], "confidence": float},
                    ...
                ],
                "figure_regions": [
                    {"bbox": [x1,y1,x2,y2], "area": int},
                    ...
                ]
            }
            如果 OCR 未启用，返回空结果
        """
        if not self.enabled:
            return {"text_blocks": [], "figure_regions": []}

        text_blocks = self.detect_text_regions(image)
        figure_regions = self.detect_figure_regions(image, text_blocks)
        return {
            "text_blocks": text_blocks,
            "figure_regions": figure_regions,
        }

    # ==================== 文本区域检测 ====================

    def detect_text_regions(self, image: np.ndarray) -> list[dict]:
        """检测图像中的文本区域

        Args:
            image: BGR 格式图片 (H, W, 3)

        Returns:
            [{"bbox": [x1,y1,x2,y2], "confidence": float}, ...]
        """
        if self.session is None:
            return []

        h, w = image.shape[:2]
        img, scale_h, scale_w = self._preprocess(image)
        ort_inputs = {self.session.get_inputs()[0].name: img}
        outputs = self.session.run(None, ort_inputs)
        return self._postprocess(outputs[0], h, w, scale_h, scale_w)

    # ==================== 图形区域检测 ====================

    def detect_figure_regions(self, image: np.ndarray,
                              text_regions: list[dict] = None) -> list[dict]:
        """检测图像中的图形/插图区域

        通过排除文本区域，在剩余区域中寻找显著的非白色内容块。

        Args:
            image: BGR 格式图片
            text_regions: 文本区域列表（可选，不传则自动检测）

        Returns:
            [{"bbox": [x1,y1,x2,y2], "area": int}, ...]
        """
        if self.session is None:
            return []

        if text_regions is None:
            text_regions = self.detect_text_regions(image)

        h, w = image.shape[:2]

        # 创建文本区域掩码
        text_mask = np.zeros((h, w), dtype=np.uint8)
        for region in text_regions:
            x1, y1, x2, y2 = region["bbox"]
            x1 = max(0, x1 - 5)
            y1 = max(0, y1 - 5)
            x2 = min(w, x2 + 5)
            y2 = min(h, y2 + 5)
            text_mask[y1:y2, x1:x2] = 255

        # 转为灰度图并二值化
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 240, 255, cv2.THRESH_BINARY_INV)
        binary = cv2.bitwise_and(binary, cv2.bitwise_not(text_mask))

        # 形态学膨胀连接相邻像素
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        dilated = cv2.dilate(binary, kernel, iterations=2)

        # 连通域分析
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        from app.config import settings
        min_area = settings.ocr_figure_min_area

        figure_regions = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue
            x, y, bw, bh = cv2.boundingRect(contour)
            aspect_ratio = max(bw, bh) / max(min(bw, bh), 1)
            if aspect_ratio > 20:
                continue
            figure_regions.append({
                "bbox": [x, y, x + bw, y + bh],
                "area": int(area),
            })

        figure_regions.sort(key=lambda r: r["area"], reverse=True)
        return figure_regions

    # ==================== 与 VLM 坐标合并 ====================

    def merge_with_vlm_figures(self, ocr_figures: list[dict],
                                vlm_figures: list[dict],
                                iou_threshold: float = None) -> list[dict]:
        """将 OCR 高精度坐标与 VLM 语义绑定图形合并

        策略：
          1. VLM 图形是"语义有效图形"（已过滤水印/装饰），保留其语义属性
          2. OCR 坐标精度更高，用 OCR 坐标替换 VLM 粗粒度坐标
          3. OCR 独有的图形（VLM 漏检）作为补充加入
          4. 合并后只保留一份坐标，每个图形只裁切一次

        Args:
            ocr_figures: OCR 检测的图形列表 [{"bbox": [x1,y1,x2,y2], "area": int}]
            vlm_figures: VLM 返回的图形列表 [{"bbox": {"x0","y0","x1","y1"}, "type", "description"}]
            iou_threshold: IoU 阈值，超过此值视为同一图形

        Returns:
            合并后的统一图形列表 [{"bbox": [x1,y1,x2,y2], "type", "description", "source": "ocr+vlm"|"vlm_only"|"ocr_only"}]
        """
        if iou_threshold is None:
            from app.config import settings
            iou_threshold = settings.ocr_merge_iou_vlm

        # 标准化 VLM 图形坐标格式
        vlm_boxes = []
        for fig in vlm_figures:
            bbox = fig.get("bbox", {})
            vlm_boxes.append({
                "bbox": [
                    bbox.get("x0", 0), bbox.get("y0", 0),
                    bbox.get("x1", 0), bbox.get("y1", 0),
                ],
                "type": fig.get("type", "figure"),
                "description": fig.get("description", ""),
                "source": "vlm_only",
            })

        # 合并：OCR 坐标替换 VLM 坐标
        merged = []
        vlm_matched = set()

        for v_idx, vlm_box in enumerate(vlm_boxes):
            best_iou = 0.0
            best_ocr = None
            for ocr_box in ocr_figures:
                iou = compute_iou(vlm_box["bbox"], ocr_box["bbox"])
                if iou > best_iou:
                    best_iou = iou
                    best_ocr = ocr_box

            if best_iou >= iou_threshold and best_ocr is not None:
                # 用 OCR 精确坐标替换 VLM 粗粒度坐标
                merged.append({
                    "bbox": best_ocr["bbox"],
                    "type": vlm_box["type"],
                    "description": vlm_box["description"],
                    "source": "ocr+vlm",
                })
                vlm_matched.add(v_idx)
            else:
                # VLM 独有图形（OCR 漏检），保留 VLM 坐标
                merged.append(vlm_box)

        # 补充 OCR 独有图形（VLM 漏检）
        ocr_matched = set()
        for vlm_box in vlm_boxes:
            for o_idx, ocr_box in enumerate(ocr_figures):
                if compute_iou(vlm_box["bbox"], ocr_box["bbox"]) >= iou_threshold:
                    ocr_matched.add(o_idx)

        for o_idx, ocr_box in enumerate(ocr_figures):
            if o_idx not in ocr_matched:
                merged.append({
                    "bbox": ocr_box["bbox"],
                    "type": "ocr_detected",
                    "description": "OCR 补充检测图形",
                    "source": "ocr_only",
                })

        return merged

    # ==================== 图形裁切 ====================

    def crop_figures(self, image: np.ndarray, figure_regions: list[dict],
                     output_dir: str, prefix: str) -> list[str]:
        """根据图形区域裁切并保存图片

        Args:
            image: 原图（BGR格式）
            figure_regions: 统一图形列表 [{"bbox": [x1,y1,x2,y2], ...}]
            output_dir: 输出目录
            prefix: 文件名前缀

        Returns:
            保存的图片路径列表
        """
        os.makedirs(output_dir, exist_ok=True)
        saved_paths = []

        for idx, region in enumerate(figure_regions):
            x1, y1, x2, y2 = region["bbox"]
            h, w = image.shape[:2]

            x1 = max(0, x1)
            y1 = max(0, y1)
            x2 = min(w, x2)
            y2 = min(h, y2)

            if x2 - x1 < 20 or y2 - y1 < 20:
                continue

            cropped = image[y1:y2, x1:x2]
            filename = f"{prefix}_fig_{idx}.png"
            filepath = os.path.join(output_dir, filename)
            cv2.imwrite(filepath, cropped, [cv2.IMWRITE_PNG_COMPRESSION, 3])
            saved_paths.append(filepath)

        return saved_paths

    # ==================== 内部方法 ====================

    def _preprocess(self, image: np.ndarray) -> tuple:
        """预处理图像为模型输入格式"""
        h, w = image.shape[:2]

        max_size = 960
        if max(h, w) > max_size:
            scale = max_size / max(h, w)
            new_h = int(h * scale)
            new_w = int(w * scale)
            new_h = max(32, (new_h // 32) * 32)
            new_w = max(32, (new_w // 32) * 32)
            resized = cv2.resize(image, (new_w, new_h))
            scale_h = h / new_h
            scale_w = w / new_w
        else:
            new_h = max(32, (h // 32) * 32)
            new_w = max(32, (w // 32) * 32)
            resized = cv2.resize(image, (new_w, new_h))
            scale_h = h / new_h
            scale_w = w / new_w

        img = resized.astype(np.float32)
        img = img[..., ::-1]  # BGR → RGB
        img = img / 255.0
        mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
        std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
        img = (img - mean) / std

        img = img.transpose((2, 0, 1))
        img = np.expand_dims(img, axis=0).astype(np.float32)

        return img, scale_h, scale_w

    def _postprocess(self, output: np.ndarray, orig_h: int, orig_w: int,
                     scale_h: float, scale_w: float) -> list[dict]:
        """后处理：从模型输出概率图提取文本框"""
        prob = output[0, 0]
        binary = (prob > 0.3).astype(np.uint8) * 255

        contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        text_regions = []
        min_area = 100

        for contour in contours:
            area = cv2.contourArea(contour)
            if area < min_area:
                continue

            rect = cv2.minAreaRect(contour)
            box = cv2.boxPoints(rect)
            box = np.int32(box)
            x, y, bw, bh = cv2.boundingRect(box)

            x1 = int(x * scale_w)
            y1 = int(y * scale_h)
            x2 = int((x + bw) * scale_w)
            y2 = int((y + bh) * scale_h)

            x1 = max(0, min(x1, orig_w))
            y1 = max(0, min(y1, orig_h))
            x2 = max(0, min(x2, orig_w))
            y2 = max(0, min(y2, orig_h))

            if x2 - x1 < 10 or y2 - y1 < 10:
                continue

            region_prob = prob[
                max(0, int(y / scale_h)):min(prob.shape[0], int((y + bh) / scale_h)),
                max(0, int(x / scale_w)):min(prob.shape[1], int((x + bw) / scale_w))
            ]
            confidence = float(np.mean(region_prob)) if region_prob.size > 0 else 0.0

            text_regions.append({
                "bbox": [x1, y1, x2, y2],
                "confidence": round(confidence, 3),
            })

        return self._merge_boxes(text_regions)

    def _merge_boxes(self, boxes: list[dict], iou_threshold: float = 0.3) -> list[dict]:
        """合并重叠的文本框"""
        if len(boxes) <= 1:
            return boxes

        boxes.sort(key=lambda b: b["bbox"][1])
        merged = []
        used = set()

        for i, box_a in enumerate(boxes):
            if i in used:
                continue
            x1_a, y1_a, x2_a, y2_a = box_a["bbox"]

            for j, box_b in enumerate(boxes):
                if j <= i or j in used:
                    continue
                x1_b, y1_b, x2_b, y2_b = box_b["bbox"]

                iou = compute_iou(box_a["bbox"], box_b["bbox"])
                if iou > iou_threshold:
                    box_a["bbox"] = [
                        min(x1_a, x1_b), min(y1_a, y1_b),
                        max(x2_a, x2_b), max(y2_a, y2_b),
                    ]
                    box_a["confidence"] = max(box_a["confidence"], box_b["confidence"])
                    used.add(j)

            merged.append(box_a)

        return merged


# 全局单例
ocr_service = OcrLayoutService()