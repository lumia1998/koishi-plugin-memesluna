import { existsSync } from 'fs'
import path from 'path'
import { Context } from 'koishi'
import type { Config } from './config'
import {
  MAX_METADATA_ITEM_LENGTH,
  MAX_METADATA_TAGS,
} from './constants'
import {
  type MemesLunaService,
} from './service'
import {
  normalizeMetadataList,
  toTrimmedString,
} from './utils'
import { toAbsoluteBaseUrl } from './urls'

export function applyConsole(ctx: Context, config: Config, service: MemesLunaService) {
  if (!ctx.console) {
    return
  }

  const consoleService = ctx.console as any

  const packageBase = path.resolve(__dirname, '..')
  const installedBase = path.resolve(ctx.baseDir, 'node_modules', 'koishi-plugin-memesluna')
  const consoleBase = existsSync(installedBase) ? installedBase : packageBase
  const devPath = path.resolve(consoleBase, 'client/index.ts')
  const prodPath = path.resolve(consoleBase, 'dist')

  const withReady = <T extends unknown[], R>(handler: (...args: T) => Promise<R> | R) => {
    return async (...args: T): Promise<R> => {
      await service.ready
      return await handler(...args)
    }
  }

  consoleService.addEntry({
    dev: devPath,
    prod: prodPath,
  })

  consoleService.addListener(
    'memesluna/getState',
    withReady(async () => {
      const endpoints = await service.getEndpoints()
      const collections = await service.getCollections()
      const detailedCollections = await Promise.all(
        collections.map(async (name) => service.getCollectionInfo(name))
      )

      const stagedImages = await service.getStagedImages()
      return {
        backendPath: config.backendPath,
        endpoints,
        collections: detailedCollections.filter(Boolean),
        stagedImages,
      }
    })
  )

  consoleService.addListener(
    'memesluna/createCollection',
    withReady(async (name: string) => {
      return await service.createCollection(name)
    })
  )

  consoleService.addListener(
    'memesluna/deleteCollection',
    withReady(async (name: string) => {
      return await service.deleteCollection(name)
    })
  )

  consoleService.addListener(
    'memesluna/setCollectionDescription',
    withReady(async (name: string, description: string) => {
      return await service.setCollectionDescription(name, description)
    })
  )

  consoleService.addListener(
    'memesluna/deleteLocalImage',
    withReady(async (collectionName: string, filename: string) => {
      return await service.deleteImageFromCollection(collectionName, filename)
    })
  )

  consoleService.addListener(
    'memesluna/moveLocalImage',
    withReady(async (sourceCollection: string, targetCollection: string, filename: string) => {
      return await service.moveImageToCollection(sourceCollection, targetCollection, filename)
    })
  )

  consoleService.addListener(
    'memesluna/addLinks',
    withReady(async (collectionName: string, linksText: string) => {
      const links = linksText
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
      return await service.addLinksToCollection(collectionName, links)
    })
  )

  consoleService.addListener(
    'memesluna/deleteLink',
    withReady(async (collectionName: string, link: string) => {
      return await service.removeLinkFromCollection(collectionName, link)
    })
  )

  consoleService.addListener(
    'memesluna/createEndpoint',
    withReady(async (payload: any) => {
      return await service.addEndpoint(payload)
    })
  )

  consoleService.addListener(
    'memesluna/updateEndpoint',
    withReady(async (name: string, payload: any) => {
      return await service.updateEndpoint(name, payload)
    })
  )

  consoleService.addListener(
    'memesluna/deleteEndpoint',
    withReady(async (name: string) => {
      return await service.deleteEndpoint(name)
    })
  )

  consoleService.addListener(
    'memesluna/getStagedImages',
    withReady(async () => {
      return await service.getStagedImages()
    })
  )
  consoleService.addListener(
    'memesluna/getSimilarStagedImages',
    withReady(async () => {
      return await service.getSimilarStagedImages(config.similarityThreshold)
    })
  )

  consoleService.addListener(
    'memesluna/addStagedImage',
    withReady(async (payload: any) => {
      return await service.addStagedImageBase64(
        toTrimmedString(payload?.base64),
        toTrimmedString(payload?.originalName) || undefined,
        toTrimmedString(payload?.source) || 'filter',
        toTrimmedString(payload?.reason)
      )
    })
  )

  consoleService.addListener(
    'memesluna/deleteStagedImage',
    withReady(async (id: string) => {
      return await service.deleteStagedImage(id)
    })
  )

  consoleService.addListener(
    'memesluna/promoteStagedImage',
    withReady(async (id: string, collectionName: string) => {
      return await service.promoteStagedImage(id, collectionName)
    })
  )
  consoleService.addListener('memesluna/getBaseUrl', async () => {
    return `${toAbsoluteBaseUrl(ctx, config)}${config.backendPath}`
  })

  consoleService.addListener('memesluna/deleteAllStagedImages', withReady(async () => {
    return await service.deleteAllStagedImages()
  }))

  consoleService.addListener(
    'memesluna/annotateImage',
    withReady(async (collectionName: string, filename: string) => {
      const image = await service.getLocalImageBuffer(collectionName, filename)
      if (!image) return { ok: false, error: '图片不存在' }

      const annotator = service.annotator
      if (!annotator) return { ok: false, error: 'AI 标注器未就绪' }

      const result = await annotator.annotate(image.buffer, {
        filename,
        collectionName,
        imageUrl: `${config.backendPath}/${encodeURIComponent(collectionName)}/${encodeURIComponent(filename)}`,
      })
      if (!result) return { ok: false, error: 'AI 标注失败' }

      // Get the database row to find its ID
      const rows = await ctx.database.get('memesluna_images', { collection: collectionName, filename })
      if (!rows.length) return { ok: false, error: '数据库记录不存在' }

      await service.updateImageAnnotation(rows[0].id, result.aliases, result.tags)
      return { ok: true, aliases: result.aliases, tags: result.tags }
    })
  )

  consoleService.addListener(
    'memesluna/updateImageMetadata',
    withReady(async (payload: { collectionName: string; filename: string; aliases?: string[]; tags?: string[] }) => {
      const { collectionName, filename, aliases, tags } = payload
      if (!collectionName || !filename) return { ok: false, error: '参数不完整' }

      const rows = await ctx.database.get('memesluna_images', { collection: collectionName, filename })
      if (!rows.length) return { ok: false, error: '图片不存在' }

      const currentAliases: string[] = (() => { try { const p = JSON.parse(rows[0].aliases || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } })()
      const currentTags: string[] = (() => { try { const p = JSON.parse(rows[0].tags || '[]'); return Array.isArray(p) ? p : [] } catch { return [] } })()

      const mergedAliases = aliases ?? currentAliases
      const mergedTags = tags?.length
        ? normalizeMetadataList(tags, MAX_METADATA_TAGS, MAX_METADATA_ITEM_LENGTH)
        : (tags !== undefined ? [] : currentTags)

      await service.updateImageAnnotation(rows[0].id, mergedAliases, mergedTags)
      return { ok: true, aliases: mergedAliases, tags: mergedTags }
    })
  )

  consoleService.addListener(
    'memesluna/getImageMetadata',
    withReady(async (collectionName: string, filename: string) => {
      const rows = await ctx.database.get('memesluna_images', { collection: collectionName, filename })
      if (!rows.length) return { ok: false, error: '图片不存在' }

      let aliases: string[] = []
      let tags: string[] = []
      try { const p = JSON.parse(rows[0].aliases || '[]'); aliases = Array.isArray(p) ? p : [] } catch {}
      try { const p = JSON.parse(rows[0].tags || '[]'); tags = Array.isArray(p) ? p : [] } catch {}

      return { ok: true, aliases, tags }
    })
  )

  // v0.6.0: 已移除 getTagSummary 和 getImagesByTag RPC（标签视图已废弃）
}
