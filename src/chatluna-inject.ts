import { Context } from 'koishi'
import type { Config } from './config'
import type { MemesLunaService } from './service'
import { toAbsoluteBaseUrl } from './urls'

export function getInjectVariablesPromptTemplate(config: Config): string {
  return config.injectVariablesPrompt || ''
}

export async function updateMemesVariable(ctx: Context, config: Config, service: MemesLunaService) {
  const baseUrl = toAbsoluteBaseUrl(ctx, config)
  const inventory = await service.buildRouteInventory(config.backendPath)

  ;(ctx as any).chatluna.promptRenderer.setVariable('endpoint', inventory || '- 暂无可用路由')

  const memeslunaText = getInjectVariablesPromptTemplate(config)
    .replaceAll('{endpoint}', inventory || '- 暂无可用路由')
    .replaceAll('{base_url}', baseUrl)
    .replaceAll('{backend_path}', config.backendPath)
    .replaceAll('{tag_routes}', '')
    .replaceAll('{tags}', '')

  ;(ctx as any).chatluna.promptRenderer.setVariable('memesluna', memeslunaText)
}

export function applyChatlunaVariables(ctx: Context, config: Config) {
  if (!config.injectVariables) return

  ctx.inject(['memesluna', 'chatluna', 'server'], async (ctx) => {
    const service = ctx.memesluna
    await service.ready

    const refresh = async () => {
      await updateMemesVariable(ctx, config, service)
    }

    await refresh()
    ctx.setInterval(refresh, config.variableRefreshIntervalMs)

    ctx.effect(() => () => {
      ;(ctx as any).chatluna.promptRenderer.removeVariable('endpoint')
      ;(ctx as any).chatluna.promptRenderer.removeVariable('tag_routes')
      ;(ctx as any).chatluna.promptRenderer.removeVariable('memesluna')
    })
  })
}
