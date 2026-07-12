import type { Context } from 'koishi'
import type { Config } from './config'

export function toAbsoluteBaseUrl(ctx: Context, config: Config): string {
  const url = config.selfUrl || (ctx as any).server?.selfUrl || ''
  return url.replace(/\/+$/, '')
}

export function getLocalBaseUrl(ctx: Context, config: Config, requestOrigin?: string): string {
  const url = requestOrigin || toAbsoluteBaseUrl(ctx, config)
  return url.replace(/\/+$/, '')
}
