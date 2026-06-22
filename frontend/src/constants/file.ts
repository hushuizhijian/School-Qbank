/**
 * 文件相关常量
 *
 * 功能：定义文件上传限制和格式支持
 * 使用场景：文件上传组件
 */

/** 最大上传文件大小（MB） */
export const MAX_FILE_SIZE_MB = 50

/** 支持的图片格式 */
export const SUPPORTED_IMAGE_TYPES = ["png", "jpg", "jpeg", "gif", "bmp", "webp"]

/** 支持的文档格式 */
export const SUPPORTED_DOC_TYPES = ["pdf"]

/** 支持的文件 MIME 类型 */
export const SUPPORTED_MIME_TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  image: ["image/png", "image/jpeg", "image/gif", "image/bmp", "image/webp"],
}