import type {} from '@koishijs/plugin-console'
import type {} from 'koishi-plugin-chatluna'

import { Context } from 'koishi'
import { Config } from './config'
import { AIAnnotator } from './aiAnnotator'
import { applyAutoCollect } from './auto-collect'
import { applyChatlunaVariables } from './chatluna-inject'
import { registerCommands } from './commands'
import { applyConsole } from './console-handlers'
import { applyServer } from './http-server'
import { invalidateAllImagesCache } from './search'
import {
  MEMESLUNA_IMAGES_UPDATED,
  MemesLunaService,
} from './service'
import { applyStagingCleanup } from './staging-cleanup'

export function apply(ctx: Context, config: Config) {
  ;(ctx as any).on(MEMESLUNA_IMAGES_UPDATED, invalidateAllImagesCache)
  ctx.plugin(MemesLunaService, config)

  // 所有使用 ctx.memesluna 的功能必须通过 inject 声明依赖
  ctx.inject(['memesluna'], (ctx) => {
    applyAutoCollect(ctx, config)
    applyStagingCleanup(ctx, config)
    registerCommands(ctx, config)
  })

  ctx.inject(['memesluna', 'server'], async (ctx) => {
    await ctx.memesluna.ready
    applyServer(ctx, config, ctx.memesluna)
  })

  ctx.inject(['memesluna', 'console'], async (ctx) => {
    applyConsole(ctx, config, ctx.memesluna)
  })

  if (config.model) {
    ctx.inject(['memesluna', 'chatluna'], async (ctx) => {
      const annotator = new AIAnnotator(ctx, config)
      await annotator.initialize()
      ctx.memesluna.setAnnotator(annotator)
    })
  }

  if (config.injectVariables) {
    applyChatlunaVariables(ctx, config)
  }
}

export * from './config'
export * from './service'

export const inject = {
  required: ['database', 'chatluna', 'server'],
  optional: ['console'],
}
