/** 通用类型定义 */

/** 分页参数 */
export interface PaginationParams {
  page: number
  page_size: number
}

/** API 统一响应 */
export interface ApiResponse<T> {
  success: boolean
  data: T | null
  message: string
  error?: string | null
}
