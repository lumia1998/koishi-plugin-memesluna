import { Context } from 'koishi'
import type { Config } from './config'

export function applyStagingCleanup(ctx: Context, config: Config) {
  const retentionDays = config.stagingRetentionDays || 0
  if (retentionDays <= 0) return

  const cleanupIntervalMs = Math.max(60 * 60 * 1000, retentionDays * 24 * 60 * 60 * 1000 / 4)
  ctx.setInterval(async () => {
    try {
      if (!ctx.memesluna) return
      const service = ctx.memesluna
      await service.ready
      const deleted = await service.deleteExpiredStagedImages(retentionDays)
      if (deleted > 0) {
        ctx.logger('memesluna').info(`Staging cleanup: removed ${deleted} expired images (retention: ${retentionDays} days)`)
      }
    } catch (error) {
      ctx.logger('memesluna').debug(`Staging cleanup failed: ${(error as Error).message}`)
    }
  }, cleanupIntervalMs)
  ctx.logger('memesluna').info(`Staging auto-clean enabled: retention ${retentionDays} days`)
}
