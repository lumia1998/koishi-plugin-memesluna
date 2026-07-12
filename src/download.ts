import type { Context } from 'koishi'
import {
  IMAGE_DOWNLOAD_MAX_RETRIES,
  IMAGE_DOWNLOAD_TIMEOUT,
  IMAGE_DOWNLOAD_RETRY_DELAY,
} from './constants'
import { sleep } from './utils'

export function isPrivateIP(hostname: string): boolean {
  // IPv4 私有地址检测
  if (/^127\./.test(hostname)) return true // 127.0.0.0/8
  if (/^10\./.test(hostname)) return true // 10.0.0.0/8
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true // 172.16.0.0/12
  if (/^192\.168\./.test(hostname)) return true // 192.168.0.0/16
  if (/^169\.254\./.test(hostname)) return true // 169.254.0.0/16 (链路本地)
  if (hostname === 'localhost') return true

  // IPv6 私有地址检测
  if (/^::1$/.test(hostname)) return true // 回环
  if (/^fe80:/i.test(hostname)) return true // 链路本地
  if (/^fc00:/i.test(hostname)) return true // 唯一本地地址
  if (/^fd00:/i.test(hostname)) return true // 唯一本地地址

  return false
}

export async function downloadImage(ctx: Context, url: string, maxBytes?: number): Promise<Buffer> {
  if (url.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.*)$/.exec(url)
    if (!match) {
      throw new Error('Invalid data URL format')
    }
    const buffer = Buffer.from(match[2], 'base64')
    if (maxBytes && buffer.length > maxBytes) {
      throw new Error(`Data URL size exceeds maximum limit of ${maxBytes} bytes`)
    }
    return buffer
  }

  // SSRF 防护：检查 URL 合法性
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error('Invalid URL format')
  }

  // 只允许 http 和 https 协议
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Protocol ${parsedUrl.protocol} is not allowed`)
  }

  // 禁止访问私有 IP 地址
  const hostname = parsedUrl.hostname
  if (isPrivateIP(hostname)) {
    throw new Error('Access to private IP addresses is not allowed')
  }

  let lastError: Error | null = null
  for (let i = 0; i < IMAGE_DOWNLOAD_MAX_RETRIES; i++) {
    try {
      const data = await ctx.http.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: IMAGE_DOWNLOAD_TIMEOUT,
        maxContentLength: maxBytes,
      } as any)
      const buffer = Buffer.from(data)
      if (maxBytes && buffer.length > maxBytes) {
        throw new Error(`Downloaded image size exceeds maximum limit of ${maxBytes} bytes`)
      }
      return buffer
    } catch (err) {
      lastError = err as Error
      await sleep(IMAGE_DOWNLOAD_RETRY_DELAY)
    }
  }
  throw new Error(`Failed to download image after ${IMAGE_DOWNLOAD_MAX_RETRIES} retries: ${lastError?.message}`)
}
