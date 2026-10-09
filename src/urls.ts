import type { Context } from 'koishi'
import type { Config } from './config'

export function toAbsoluteBaseUrl(ctx: Context, config: Config): string {
  const url = config.selfUrl || (ctx as any).server?.selfUrl || ''
  return url.replace(/\/+$/, '')
}

/** 显式配置的 selfUrl 优先于请求头推导的地址；未配置时沿用请求来源以兼容局域网访问。 */
export function getLocalBaseUrl(ctx: Context, config: Config, requestOrigin?: string): string {
  const url = config.selfUrl || requestOrigin || toAbsoluteBaseUrl(ctx, config)
  return url.replace(/\/+$/, '')
}
