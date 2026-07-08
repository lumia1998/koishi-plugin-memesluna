/**
 * 通用工具函数
 */

/**
 * 解析 JSON 字符串数组
 */
export function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

/**
 * 将值转换为字符串并去除首尾空白
 */
export function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * 将值转换为字符串数组
 */
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

/**
 * 标准化元数据列表（去重、长度限制）
 */
export function normalizeMetadataList(
  value: string[],
  maxItems: number,
  maxLength: number
): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    const normalized = typeof item === 'string' ? item.trim().replace(/\s+/g, ' ') : ''
    if (!normalized || normalized.length > maxLength) continue

    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)

    if (result.length >= maxItems) break
  }

  return result
}

/**
 * 获取当前日期的字符串表示 (YYYY-MM-DD)
 */
export function getDailyKey(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

/**
 * 等待指定的毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 安全地解析 JSON，返回默认值
 */
export function safeJsonParse<T>(value: string, defaultValue: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return defaultValue
  }
}
