import { Context } from 'koishi'
import type { Config } from './config'
import type { MemesLunaService } from './service'
import { MEMESLUNA_IMAGES_UPDATED } from './service'
import { toAbsoluteBaseUrl } from './urls'

/** 渲染注入 ChatLuna 的提示词；Console 预览与实际注入共用同一份逻辑。 */
export function renderInjectPrompt(config: Config, inventory: string, baseUrl: string): string {
  return (config.injectVariablesPrompt || '')
    .replaceAll('{endpoint}', inventory || '- 暂无可用路由')
    .replaceAll('{base_url}', baseUrl)
    .replaceAll('{backend_path}', config.backendPath)
    // 兼容旧模板中已废弃的标签路由占位符。
    .replaceAll('{tag_routes}', '')
    .replaceAll('{tags}', '')
}

async function updateMemesVariable(ctx: Context, config: Config, service: MemesLunaService) {
  const inventory = await service.buildRouteInventory(config.backendPath)
  ;(ctx as any).chatluna.promptRenderer.setVariable('endpoint', inventory || '- 暂无可用路由')
  ;(ctx as any).chatluna.promptRenderer.setVariable('memesluna', renderInjectPrompt(config, inventory, toAbsoluteBaseUrl(ctx, config)))
}

export function applyChatlunaVariables(ctx: Context, config: Config) {
  ctx.inject(['memesluna', 'chatluna'], async (ctx) => {
    const service = ctx.memesluna
    await service.ready

    let pending: Promise<void> | undefined
    let dirty = false
    const refresh = () => {
      dirty = true
      if (pending) return pending
      pending = (async () => {
        while (dirty) {
          dirty = false
          await updateMemesVariable(ctx, config, service)
        }
      })().catch((error) => {
        ctx.logger('memesluna').warn('Failed to refresh ChatLuna variables:', error)
      }).finally(() => { pending = undefined })
      return pending
    }

    await refresh()
    ctx.setInterval(refresh, config.variableRefreshIntervalMs)
    let cancelRefresh: (() => void) | undefined
    ;(ctx as any).on(MEMESLUNA_IMAGES_UPDATED, () => {
      cancelRefresh?.()
      cancelRefresh = ctx.setTimeout(() => { void refresh() }, 250)
    })

    ctx.effect(() => () => {
      ;(ctx as any).chatluna.promptRenderer.removeVariable('endpoint')
      ;(ctx as any).chatluna.promptRenderer.removeVariable('memesluna')
    })
  })
}
