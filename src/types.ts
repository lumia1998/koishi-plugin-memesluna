/**
 * 统一的 API 响应类型
 */

export interface SuccessResponse<T = any> {
  ok: true
  data?: T
}

export interface ErrorResponse {
  ok: false
  error: string
  code?: string
  details?: any
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse

/**
 * 创建成功响应
 */
export function success<T = any>(data?: T): SuccessResponse<T> {
  return { ok: true, data }
}

/**
 * 创建错误响应
 */
export function error(message: string, code?: string, details?: any): ErrorResponse {
  return { ok: false, error: message, code, details }
}

/**
 * 错误代码常量
 */
export const ErrorCode = {
  // 通用错误
  UNKNOWN: 'UNKNOWN',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',

  // 文件相关
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_INVALID_FORMAT: 'FILE_INVALID_FORMAT',
  FILE_DOWNLOAD_FAILED: 'FILE_DOWNLOAD_FAILED',

  // 网络相关
  NETWORK_ERROR: 'NETWORK_ERROR',
  SSRF_BLOCKED: 'SSRF_BLOCKED',
  INVALID_URL: 'INVALID_URL',

  // 数据库相关
  DB_ERROR: 'DB_ERROR',
  DB_CONSTRAINT_VIOLATION: 'DB_CONSTRAINT_VIOLATION',

  // AI 相关
  AI_ANNOTATOR_NOT_READY: 'AI_ANNOTATOR_NOT_READY',
  AI_ANNOTATION_FAILED: 'AI_ANNOTATION_FAILED',

  // 权限相关
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
} as const

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode]
