import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type {} from '@koishijs/plugin-console'
import type {} from 'koishi-plugin-chatluna'

import { Context, h } from 'koishi'
import { Config } from './config'
import { MemesLunaService, hashImageBuffer, isReservedPath } from './service'

function guessMimeByExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    case '.svg':
      return 'image/svg+xml'
    case '.jpg':
    case '.jpeg':
    default:
      return 'image/jpeg'
  }
}

async function downloadImage(ctx: Context, url: string): Promise<Buffer> {
  let lastError: Error | null = null
  for (let i = 0; i < 3; i++) {
    try {
      const data = await ctx.http.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
      })
      return Buffer.from(data)
    } catch (err) {
      lastError = err as Error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw new Error(`Failed to download image after 3 retries: ${lastError?.message}`)
}

function getExtFromMagicBytes(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.readUInt32BE(0) === 0x89504E47 && buffer.readUInt32BE(4) === 0x0D0A1A0A) {
    return '.png'
  }
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return '.jpg'
  }
  if (buffer.length >= 4 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return '.gif'
  }
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4D) {
    return '.bmp'
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return '.webp'
  }
  return null
}

function toAbsoluteBaseUrl(ctx: Context, config: Config): string {
  return config.selfUrl || ctx.server?.selfUrl || ''
}

function getLocalBaseUrl(ctx: Context, config: Config, requestOrigin?: string): string {
  return requestOrigin || toAbsoluteBaseUrl(ctx, config)
}

async function applyDynamicForward(
  ctx: Context,
  config: Config,
  service: MemesLunaService,
  routeName: string,
  _query: Record<string, unknown>,
  requestOrigin?: string
) {
  const endpoint = await service.getEndpointByName(routeName)
  const isCollection = await service.collectionExists(routeName)

  if (!endpoint && !isCollection) {
    return { notFound: true }
  }

  if (endpoint) {
    if (!endpoint.url) {
      return {
        status: 500,
        body: { error: 'Configuration URL missing' },
        contentType: 'application/json',
      }
    }

    return { redirectTo: endpoint.url }
  }

  const resource = await service.getRandomResource(routeName)
  if (!resource) {
    return { notFound: true }
  }

  if (resource.type === 'external') {
    return { redirectTo: resource.value }
  }

  if (resource.type === 'storage') {
    if (resource.public_url) {
      return { redirectTo: resource.public_url }
    }
    const localUrl = `${getLocalBaseUrl(ctx, config, requestOrigin)}${config.backendPath}/api/collections/${encodeURIComponent(routeName)}/images/${encodeURIComponent(resource.filename || '')}`
    return { redirectTo: localUrl }
  }

  const localUrl = `${getLocalBaseUrl(ctx, config, requestOrigin)}${config.backendPath}/api/collections/${encodeURIComponent(routeName)}/images/${encodeURIComponent(resource.filename || '')}`
  return { redirectTo: localUrl }
}

function setKoaResponse(koa: any, result: any) {
  if (result.redirectTo) {
    koa.redirect(result.redirectTo)
    return
  }

  if (result.notFound) {
    koa.status = 404
    koa.body = { error: 'Not Found' }
    return
  }

  koa.status = result.status ?? 200
  if (result.contentType) {
    koa.set('Content-Type', result.contentType)
  }
  koa.body = result.body
}

function getRequestBody(koa: any): Record<string, unknown> {
  const body = koa?.request?.body
  if (!body) return {}
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof body === 'object') {
    return body as Record<string, unknown>
  }
  return {}
}

function toTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

interface AutoCollectFrequencyRecord {
  timestamps: number[]
  staged: boolean
}

interface AutoCollectDailyLimitRecord {
  day: string
  count: number
}

const autoCollectFrequencyTracker = new Map<string, AutoCollectFrequencyRecord>()
const autoCollectDailyLimits = new Map<string, AutoCollectDailyLimitRecord>()

function getMessageImages(session: any): string[] {
  const elements = session.elements || []
  return h
    .select(elements, 'image')
    .concat(h.select(elements, 'img'))
    .map((img) => img.attrs.url || img.attrs.src)
    .filter(Boolean)
}

function getSessionGroupId(session: any): string {
  return session.guildId || session.channelId || ''
}

function getDailyKey(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}

function hitDailyAutoCollectLimit(groupId: string, limit: number): boolean {
  const day = getDailyKey()
  const current = autoCollectDailyLimits.get(groupId)
  if (!current || current.day !== day) {
    autoCollectDailyLimits.set(groupId, { day, count: 1 })
    return false
  }
  if (current.count >= limit) return true
  current.count++
  return false
}

function trackImageFrequency(hash: string, groupId: string, windowMs: number): { count: number; alreadyStaged: boolean } {
  const now = Date.now()
  const key = `${groupId}:${hash}`
  const record = autoCollectFrequencyTracker.get(key) || { timestamps: [], staged: false }
  record.timestamps = record.timestamps.filter((timestamp) => now - timestamp <= windowMs)
  record.timestamps.push(now)
  autoCollectFrequencyTracker.set(key, record)
  return { count: record.timestamps.length, alreadyStaged: record.staged }
}

function markImageFrequencyStaged(hash: string, groupId: string) {
  const key = `${groupId}:${hash}`
  const record = autoCollectFrequencyTracker.get(key)
  if (record) record.staged = true
}

function cleanupAutoCollectFrequency(windowMs: number) {
  const now = Date.now()
  for (const [key, record] of autoCollectFrequencyTracker.entries()) {
    record.timestamps = record.timestamps.filter((timestamp) => now - timestamp <= windowMs)
    if (!record.timestamps.length) {
      autoCollectFrequencyTracker.delete(key)
    }
  }
}
async function buildAdminState(service: MemesLunaService) {
  const endpoints = await service.getEndpoints()
  const collectionNames = await service.getCollections()
  const collections = await Promise.all(collectionNames.map((name) => service.getCollectionInfo(name)))
  const stagedImages = await service.getStagedImages()

  return {
    endpoints,
    collectionNames,
    collections: collections.filter(Boolean),
    stagedImages,
  }
}

async function updateMemesVariable(ctx: Context, config: Config, service: MemesLunaService) {

  const baseUrl = toAbsoluteBaseUrl(ctx, config)
  const inventory = await service.buildRouteInventory(config.backendPath)

  ;(ctx as any).chatluna.promptRenderer.setVariable('endpoint', inventory || '- 暂无可用路由')

  const memeslunaText = config.injectVariablesPrompt
    .replaceAll('{endpoint}', inventory || '- 暂无可用路由')
    .replaceAll('{base_url}', baseUrl)

  ;(ctx as any).chatluna.promptRenderer.setVariable('memesluna', memeslunaText)
}

function applyConsole(ctx: Context, config: Config, service: MemesLunaService) {
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
}


function applyAutoCollect(ctx: Context, config: Config) {
  if (!config.autoCollect) return

  const whitelist = new Set((config.whitelistGroups || []).map((group) => group.trim()).filter(Boolean))

  const windowMinutes = Math.max(1, config.emojiFrequencyWindowMinutes || 10)
  const windowMs = windowMinutes * 60 * 1000
  const threshold = Math.max(1, config.emojiFrequencyThreshold || 3)
  const minBytes = Math.max(0, config.minEmojiSize || 50) * 1024
  const maxBytes = Math.max(1, config.maxEmojiSize || 15) * 1024 * 1024
  const dailyLimit = Math.max(1, config.groupAutoCollectLimit || 300)

  ctx.on('message', async (session) => {
    if (session.isDirect) return

    const groupId = getSessionGroupId(session)
    if (!groupId) return
    if (whitelist.size && !whitelist.has(groupId)) return

    const imageUrls = getMessageImages(session)
    if (!imageUrls.length) return

    const service = ctx.memesluna
    await service.ready

    for (const url of imageUrls) {
      try {
        const buffer = await downloadImage(ctx, url)
        const ext = getExtFromMagicBytes(buffer)
        if (!ext) continue
        if (buffer.length < minBytes || buffer.length > maxBytes) continue

        const hash = hashImageBuffer(buffer)
        const frequency = trackImageFrequency(hash, groupId, windowMs)
        if (frequency.alreadyStaged || frequency.count < threshold) continue

        const duplicate = await service.getDuplicateImageByHash(hash, { includeStaged: true, includeImages: true })
        if (duplicate) {
          markImageFrequencyStaged(hash, groupId)
          continue
        }

        if (hitDailyAutoCollectLimit(groupId, dailyLimit)) {
          ctx.logger('memesluna').debug(`Auto collect daily limit reached for group ${groupId}`)
          continue
        }

        await service.addStagedImageBuffer(
          buffer,
          `auto-${Date.now()}${ext}`,
          `auto:${groupId}`,
          `${windowMinutes} 分钟内出现 ${frequency.count} 次`
        )
        markImageFrequencyStaged(hash, groupId)
      } catch (error) {
        ctx.logger('memesluna').debug(`Auto collect image skipped: ${(error as Error).message}`)
      }
    }
  })

  ctx.setInterval(() => cleanupAutoCollectFrequency(windowMs), Math.max(60 * 1000, windowMs))
  ctx.logger('memesluna').info(`Auto collect started: ${windowMinutes}m/${threshold} times, ${config.minEmojiSize || 50}KB-${config.maxEmojiSize || 15}MB, ${dailyLimit}/day/group`)
}

function applyStagingCleanup(ctx: Context, config: Config) {
  const retentionDays = config.stagingRetentionDays || 0
  if (retentionDays <= 0) return

  const cleanupIntervalMs = Math.max(60 * 60 * 1000, retentionDays * 24 * 60 * 60 * 1000 / 4)
  ctx.setInterval(async () => {
    try {
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
function applyServer(ctx: Context, config: Config, service: MemesLunaService) {
  if (!ctx.server) return

  const basePath = config.backendPath

  ctx.server.get(`${basePath}/api/homepage-data`, async (koa) => {
    const baseUrl = toAbsoluteBaseUrl(ctx, config)
    const endpoints = await service.getEndpoints()
    const collections = await service.getCollections()
    const collectionInfos = await Promise.all(collections.map((name) => service.getCollectionInfo(name)))
    const inventory = await service.buildRouteInventory(basePath)

    const llmPrompt = config.injectVariablesPrompt
      .replaceAll('{endpoint}', inventory || '- 暂无可用路由')
      .replaceAll('{base_url}', baseUrl)

    koa.body = {
      llmPrompt,
      routeInventory: inventory,
      endpoints,
      collections: collectionInfos.filter(Boolean),
    }
  })

    ctx.server.get(`${basePath}/api/admin/state`, async (koa) => {
      koa.body = await buildAdminState(service)
    })

  ctx.server.post(`${basePath}/api/admin/collections`, async (koa) => {
    const body = getRequestBody(koa)
    const name = toTrimmedString(body.name)
    if (!name) {
      koa.status = 400
      koa.body = { error: 'Collection name is required' }
      return
    }

    try {
      const created = await service.createCollection(name)
      if (!created) {
        koa.status = 409
        koa.body = { error: 'Collection already exists' }
        return
      }
      koa.body = { ok: true }
    } catch (error) {
      koa.status = 400
      koa.body = { error: (error as Error).message || 'Failed to create collection' }
    }
  })

  ctx.server.delete(`${basePath}/api/admin/collections/:name`, async (koa) => {
    const name = toTrimmedString(koa.params.name)
    if (!name) {
      koa.status = 400
      koa.body = { error: 'Collection name is required' }
      return
    }

    const deleted = await service.deleteCollection(name)
    if (!deleted) {
      koa.status = 404
      koa.body = { error: 'Collection not found' }
      return
    }

    koa.body = { ok: true }
  })

  ctx.server.get(`${basePath}/api/admin/staged-images/similar`, async (koa) => {
    koa.body = await service.getSimilarStagedImages(config.similarityThreshold)
  })
  ctx.server.get(`${basePath}/api/admin/staged-images/:id`, async (koa) => {
    const id = toTrimmedString(koa.params.id)
    const image = await service.getStagedImageBuffer(id)
    if (!image) {
      koa.status = 404
      koa.body = { error: 'Staged image not found' }
      return
    }

    koa.status = 200
    koa.set('Content-Type', image.mime)
    koa.body = image.buffer
  })

  ctx.server.post(`${basePath}/api/admin/staged-images`, async (koa) => {
    const body = getRequestBody(koa)
    const base64 = toTrimmedString(body.base64)
    if (!base64) {
      koa.status = 400
      koa.body = { error: 'base64 is required' }
      return
    }

    const staged = await service.addStagedImageBase64(
      base64,
      toTrimmedString(body.originalName) || undefined,
      toTrimmedString(body.source) || 'filter',
      toTrimmedString(body.reason)
    )

    koa.body = { ok: true, staged }
  })

  ctx.server.delete(`${basePath}/api/admin/staged-images`, async (koa) => {
    const deleted = await service.deleteAllStagedImages()
    koa.body = { ok: true, deleted }
  })

  ctx.server.patch(`${basePath}/api/admin/collections/:name/description`, async (koa) => {
    const name = toTrimmedString(koa.params.name)
    const body = getRequestBody(koa)
    const description = toTrimmedString(body.description)

    const updated = await service.setCollectionDescription(name, description)
    if (!updated) {
      koa.status = 404
      koa.body = { error: 'Collection not found' }
      return
    }

    koa.body = { ok: true }
  })

  ctx.server.get(`${basePath}/api/admin/collections/:name/images/:filename`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    const filename = toTrimmedString(koa.params.filename)

    const image = await service.getLocalImageBuffer(collectionName, filename)
    if (!image) {
      koa.status = 404
      koa.body = { error: 'Image not found' }
      return
    }

    koa.status = 200
    koa.set('Content-Type', image.mime)
    koa.body = image.buffer
  })

  ctx.server.post(`${basePath}/api/admin/collections/:name/images`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    const body = getRequestBody(koa)
    const items = Array.isArray(body.images)
      ? (body.images as Array<Record<string, unknown>>)
      : []

    if (!items.length) {
      koa.status = 400
      koa.body = { error: 'No images provided' }
      return
    }

    const uploaded: string[] = []
    for (const item of items) {
      const base64 = toTrimmedString(item.base64)
      const originalName = toTrimmedString(item.originalName)
      if (!base64) continue
      const saved = await service.addLocalImageBase64(collectionName, base64, originalName || undefined)
      uploaded.push(saved)
    }

    koa.body = {
      ok: true,
      uploaded,
    }
  })

  ctx.server.delete(`${basePath}/api/admin/collections/:name/images/:filename`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    const filename = toTrimmedString(koa.params.filename)

    const deleted = await service.deleteImageFromCollection(collectionName, filename)
    if (!deleted) {
      koa.status = 404
      koa.body = { error: 'Image not found' }
      return
    }

    koa.body = { ok: true }
  })

  ctx.server.post(`${basePath}/api/admin/collections/:name/images/:filename/move`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    const filename = toTrimmedString(koa.params.filename)
    const body = getRequestBody(koa)
    const targetCollection = toTrimmedString(body.targetCollection)

    if (!targetCollection) {
      koa.status = 400
      koa.body = { error: 'targetCollection is required' }
      return
    }

    const movedName = await service.moveImageToCollection(collectionName, targetCollection, filename)
    if (!movedName) {
      koa.status = 400
      koa.body = { error: 'Failed to move image' }
      return
    }

    koa.body = {
      ok: true,
      filename: movedName,
    }
  })

  ctx.server.post(`${basePath}/api/admin/collections/:name/links`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    const body = getRequestBody(koa)
    const links = toStringArray(body.links)

    if (!links.length) {
      koa.status = 400
      koa.body = { error: 'No links provided' }
      return
    }

    const added = await service.addLinksToCollection(collectionName, links)
    koa.body = { ok: true, added }
  })

  ctx.server.delete(`${basePath}/api/admin/collections/:name/links`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    const body = getRequestBody(koa)
    const link = toTrimmedString(body.link)

    if (!link) {
      koa.status = 400
      koa.body = { error: 'link is required' }
      return
    }

    const removed = await service.removeLinkFromCollection(collectionName, link)
    if (!removed) {
      koa.status = 404
      koa.body = { error: 'Link not found' }
      return
    }

    koa.body = { ok: true }
  })

  ctx.server.get(`${basePath}/api/admin/endpoints`, async (koa) => {
    koa.body = {
      endpoints: await service.getEndpoints(),
    }
  })

  ctx.server.post(`${basePath}/api/admin/endpoints`, async (koa) => {
    const body = getRequestBody(koa)

    const name = toTrimmedString(body.name)
    const url = toTrimmedString(body.url)

    if (!name || !url) {
      koa.status = 400
      koa.body = { error: 'name and url are required' }
      return
    }

    const payload = {
      name,
      group: toTrimmedString(body.group) || '默认分组',
      description: toTrimmedString(body.description),
      url,
      method: 'redirect' as const,
    }

    try {
      const id = await service.addEndpoint(payload)
      koa.body = { ok: true, id }
    } catch (error) {
      koa.status = 400
      koa.body = { error: (error as Error).message || 'Failed to create endpoint' }
    }
  })

  ctx.server.patch(`${basePath}/api/admin/endpoints/:name`, async (koa) => {
    const currentName = toTrimmedString(koa.params.name)
    const body = getRequestBody(koa)

    const payload: Record<string, unknown> = {}

    if (body.group !== undefined) payload.group = toTrimmedString(body.group) || '默认分组'
    if (body.description !== undefined) payload.description = toTrimmedString(body.description)
    if (body.url !== undefined) payload.url = toTrimmedString(body.url)
    payload.method = 'redirect'

    const updated = await service.updateEndpoint(currentName, payload)
    if (!updated) {
      koa.status = 404
      koa.body = { error: 'Endpoint not found' }
      return
    }

    koa.body = { ok: true }
  })

  ctx.server.delete(`${basePath}/api/admin/endpoints/:name`, async (koa) => {
    const name = toTrimmedString(koa.params.name)
    const deleted = await service.deleteEndpoint(name)
    if (!deleted) {
      koa.status = 404
      koa.body = { error: 'Endpoint not found' }
      return
    }

    koa.body = { ok: true }
  })

  ctx.server.get(`${basePath}/admin`, async (koa) => {
    koa.redirect('/console/memesluna')
  })

  ctx.server.get(`${basePath}/admin/endpoint`, async (koa) => {
    koa.redirect('/console/memesluna')
  })

  ctx.server.get(`${basePath}/api/collections/:name/resources`, async (koa) => {
    const collectionName = koa.params.name
    const images = await service.getCollectionImages(collectionName)
    const links = await service.getCollectionLinks(collectionName)
    koa.body = {
      name: collectionName,
      images,
      links,
    }
  })

  ctx.server.get(`${basePath}/api/collections/:name/images/:filename`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    const filename = toTrimmedString(koa.params.filename)

    const image = await service.getLocalImageBuffer(collectionName, filename)
    if (!image) {
      koa.status = 404
      koa.body = { error: 'Image not found' }
      return
    }

    koa.status = 200
    koa.set('Content-Type', image.mime)
    koa.body = image.buffer
  })

  ctx.server.get(`${basePath}/`, async (koa) => {
    koa.redirect('/console/memesluna')
  })

  ctx.server.get(`${basePath}/:name`, async (koa) => {
    const routeName = koa.params.name as string

    if (isReservedPath(routeName)) {
      koa.status = 404
      koa.body = { error: 'Not Found' }
      return
    }

    const result = await applyDynamicForward(
      ctx,
      config,
      service,
      routeName,
      koa.request.query as Record<string, unknown>,
      koa.request.origin
    )

    setKoaResponse(koa, result)
  })

  ctx.server.get(`${basePath}/:name/:filename`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    const filename = toTrimmedString(koa.params.filename)

    if (isReservedPath(collectionName)) {
      koa.status = 404
      koa.body = { error: 'Not Found' }
      return
    }

    const image = await service.getLocalImageBuffer(collectionName, filename)
    if (!image) {
      koa.status = 404
      koa.body = { error: 'Image not found' }
      return
    }

    koa.status = 200
    koa.set('Content-Type', image.mime)
    koa.body = image.buffer
  })
}

export function apply(ctx: Context, config: Config) {
  ctx.plugin(MemesLunaService, config)
  applyAutoCollect(ctx, config)
  applyStagingCleanup(ctx, config)

  ctx.inject(['memesluna', 'server'], async (ctx) => {
    const service = ctx.memesluna
    await service.ready
    applyServer(ctx, config, service)
  })

  ctx.inject(['memesluna', 'console'], async (ctx) => {
    const service = ctx.memesluna
    applyConsole(ctx, config, service)
  })

  const root = ctx.command('memesluna', 'MemesLuna 命令')

  root
    .subcommand('.list', '查看当前可用表情路由')
    .action(async () => {
      const service = ctx.memesluna
      await service.ready

      const [collectionNames, endpoints] = await Promise.all([
        service.getCollections(),
        service.getEndpoints(),
      ])

      const lines: string[] = []

      for (const collectionName of collectionNames) {
        const info = await service.getCollectionInfo(collectionName)
        if (!info?.hasContent) continue
        lines.push(`${collectionName} ${collectionName}表情包`)
      }

      for (const endpoint of endpoints) {
        const endpointLabel = endpoint.description || `${endpoint.name}端点`
        lines.push(`${endpoint.name} ${endpointLabel}`)
      }

      if (!lines.length) {
        return '暂无可用表情路由'
      }

      return lines.join('\n')
    })

  root
    .subcommand('.add <name:string> [description:string]', '快速创建表情包')
    .alias('.create')
    .alias('.creat')
    .action(async ({ session }, name, description) => {
      if (!name) return '请输入表情包名称，例如: memesluna.add cool_emojis'
      const service = ctx.memesluna
      await service.ready
      try {
        const created = await service.createCollection(name)
        if (!created) {
          return `表情包 "${name}" 已存在。`
        }
        if (description) {
          await service.setCollectionDescription(name, description)
        }
        return `表情包 "${name}" 创建成功！${description ? `描述为: ${description}` : ''}`
      } catch (err) {
        return `创建表情包失败: ${(err as Error).message}`
      }
    })

  const stoleAction = async (session: any, name: string) => {
    if (!session) return
    if (!name) {
      return '使用方式：引用图片并回复 "偷了 [表情包名称]" 或 "memesluna stole [表情包名称]"'
    }

    const service = ctx.memesluna
    await service.ready

    try {
      if (!(await service.collectionExists(name))) {
        await service.createCollection(name)
      }
    } catch (err) {
      return `检查/创建表情包失败: ${(err as Error).message}`
    }

    let imageUrls: string[] = []
    if (session.quote) {
      const images = h.select(session.quote.content, 'image')
      imageUrls = images.map((img) => img.attrs.url || img.attrs.src).filter(Boolean)
    } else {
      const images = h.select(session.elements || [], 'image')
      imageUrls = images.map((img) => img.attrs.url || img.attrs.src).filter(Boolean)
    }

    if (!imageUrls.length) {
      return '没有找到要偷的图片。请引用包含图片的聊天记录，或者在发送图片的同时回复 "偷了 [表情包名称]"'
    }

    let successCount = 0
    const savedFilenames: string[] = []

    for (const url of imageUrls) {
      try {
        const buffer = await downloadImage(ctx, url)
        const ext = getExtFromMagicBytes(buffer)
        if (!ext) {
          return '图片格式不兼容，仅支持 JPG/PNG/GIF/WEBP/BMP 格式图片（已拒绝 AVIF，且不会放入暂缓区）'
        }

        const base64 = buffer.toString('base64')
        const filename = await service.addLocalImageBase64(name, base64, `stole${ext}`)
        savedFilenames.push(filename)
        successCount++
      } catch (err) {
        ctx.logger('memesluna').error(`Failed to steal image from URL: ${url}`, err)
      }
    }

    if (successCount === 0) {
      return '偷表情包失败，下载图片或上传保存时发生错误。'
    }

    return `成功偷了 ${successCount} 张表情包存入表情包 "${name}"！新文件名：${savedFilenames.join(', ')}`
  }

  root
    .subcommand('.stole <name:string>', '偷取引用消息中的图片并存入指定表情包')
    .action(async ({ session }, name) => {
      return await stoleAction(session, name)
    })

  if (config.injectVariables) {
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
        ;(ctx as any).chatluna.promptRenderer.removeVariable('memesluna')
      })
    })
  }
}

export * from './config'
export * from './service'

export const inject = {
  required: ['database', 'chatluna', 'server'],
  optional: ['memesluna'],
}





