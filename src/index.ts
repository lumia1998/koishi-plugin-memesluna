import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import type {} from '@koishijs/plugin-console'
import type {} from 'koishi-plugin-chatluna'

import { Context, h } from 'koishi'
import { Config } from './config'
import {
  MEMESLUNA_IMAGES_UPDATED,
  MemesLunaService,
  filterCollectionsByAccess,
  hashImageBuffer,
  isReservedPath,
  isCollectionAccessAllowed,
  toCollectionAccessSession,
  type CollectionAccess,
} from './service'
import { AIAnnotator } from './aiAnnotator'
import {
  ALL_IMAGES_CACHE_TTL,
  MAX_METADATA_ALIASES,
  MAX_METADATA_ITEM_LENGTH,
  MAX_METADATA_TAGS,
  SEARCH_SCORE_THRESHOLD,
  SEARCH_SCORING,
} from './constants'
import formidable from 'formidable'

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

function isPrivateIP(hostname: string): boolean {
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

async function downloadImage(ctx: Context, url: string, maxBytes?: number): Promise<Buffer> {
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
  for (let i = 0; i < 3; i++) {
    try {
      const data = await ctx.http.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxContentLength: maxBytes,
      } as any)
      const buffer = Buffer.from(data)
      if (maxBytes && buffer.length > maxBytes) {
        throw new Error(`Downloaded image size exceeds maximum limit of ${maxBytes} bytes`)
      }
      return buffer
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
  const url = config.selfUrl || ctx.server?.selfUrl || ''
  return url.replace(/\/+$/, '')
}

function getLocalBaseUrl(ctx: Context, config: Config, requestOrigin?: string): string {
  const url = requestOrigin || toAbsoluteBaseUrl(ctx, config)
  return url.replace(/\/+$/, '')
}

function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function flattenText(input: string): string {
  return normalizeText(input).replace(/\s+/g, '')
}

function splitTerms(input: string): string[] {
  const normalized = normalizeText(input)
  if (!normalized) return []

  const terms = normalized.split(/\s+/).filter(Boolean)
  const joined = normalized.replace(/\s+/g, '')

  if (terms.length <= 1 && joined.length >= 4) {
    for (let i = 0; i < joined.length - 1; i++) {
      terms.push(joined.slice(i, i + 2))
    }
  }

  return Array.from(new Set(terms.filter((t) => t.length > 0)))
}

function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

interface RankedImage {
  image: any
  score: number
  matchedTerms: string[]
}

function rankImagesByQuery(
  images: any[],
  query: string
): RankedImage[] {
  const rawQuery = query.trim()
  if (!rawQuery) return []

  const phrase = flattenText(rawQuery)
  const terms = splitTerms(rawQuery)
  const ranked: RankedImage[] = []

  for (const image of images) {
    const aliases = parseJsonStringArray(image.aliases)
    const tags = parseJsonStringArray(image.tags)

    const aliasesFlat = aliases.map((a: string) => flattenText(a))
    const tagsFlat = tags.map((t: string) => flattenText(t))
    const filenameFlat = flattenText(image.filename || '')

    let score = 0
    const matchedTerms = new Set<string>()

    if (phrase.length >= 2) {
      if (aliasesFlat.some((a: string) => a.includes(phrase))) score += SEARCH_SCORING.PHRASE_ALIAS
      if (tagsFlat.some((t: string) => t.includes(phrase))) score += SEARCH_SCORING.PHRASE_TAG
      if (filenameFlat.includes(phrase)) score += SEARCH_SCORING.PHRASE_FILENAME
    }

    for (const term of terms) {
      const t = flattenText(term)
      if (!t) continue

      let matched = false
      if (aliasesFlat.some((a: string) => a.includes(t))) { score += SEARCH_SCORING.TERM_ALIAS; matched = true }
      if (tagsFlat.some((tag: string) => tag.includes(t))) { score += SEARCH_SCORING.TERM_TAG; matched = true }
      if (filenameFlat.includes(t)) { score += SEARCH_SCORING.TERM_FILENAME; matched = true }
      if (matched) matchedTerms.add(term)
    }

    if (matchedTerms.size >= 2) score += SEARCH_SCORING.BONUS_TWO_TERMS
    if (matchedTerms.size >= 3) score += SEARCH_SCORING.BONUS_THREE_TERMS

    if (score > 0) {
      ranked.push({ image, score, matchedTerms: Array.from(matchedTerms) })
    }
  }

  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

function getInjectVariablesPromptTemplate(config: Config): string {
  return config.injectVariablesPrompt || ''
}

// ── 全表扫描缓存，避免每次 HTTP 请求都打数据库 ──
let _allImagesCacheTime = 0
let _allImagesCache: any[] = []

async function getAllImagesCached(ctx: Context): Promise<any[]> {
  const now = Date.now()
  if (now - _allImagesCacheTime < ALL_IMAGES_CACHE_TTL) return _allImagesCache
  _allImagesCache = await ctx.database.get('memesluna_images', {})
  _allImagesCacheTime = now
  return _allImagesCache
}

/** 主动失效缓存（写操作后调用） */
function invalidateAllImagesCache() {
  _allImagesCacheTime = 0
}

async function findByQuery(
  ctx: Context,
  config: Config,
  service: MemesLunaService,
  query: string,
  requestOrigin?: string,
  collectionName?: string
): Promise<{ redirectTo: string } | null> {
  const rawQuery = query.trim()
  if (!rawQuery) return null

  const images = collectionName
    ? await ctx.database.get('memesluna_images', { collection: collectionName })
    : await getAllImagesCached(ctx)
  if (!images.length) return null

  const ranked = rankImagesByQuery(images, rawQuery)
  const qualified = ranked.filter((item) => item.score >= SEARCH_SCORE_THRESHOLD)
  if (!qualified.length) return null

  const maxScore = Math.max(...qualified.map((item) => item.score))
  const topMatches = qualified.filter((item) => item.score === maxScore)
  const pick = topMatches[Math.floor(Math.random() * topMatches.length)]
  const resource = await service.getResourceByRow(pick.image)
  if (!resource) return null

  if (resource.type === 'external') return { redirectTo: resource.value }

  const collection = pick.image.collection || collectionName || ''
  const localUrl = `${getLocalBaseUrl(ctx, config, requestOrigin)}${config.backendPath}/api/collections/${encodeURIComponent(collection)}/images/${encodeURIComponent(resource.filename || '')}`
  return { redirectTo: localUrl }
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

  const query = typeof _query?.q === 'string' ? _query.q.trim() : ''
  if (query && isCollection) {
    const queryResult = await findByQuery(ctx, config, service, query, requestOrigin, routeName)
    if (queryResult) return queryResult
  }

  const resource = await service.getRandomResource(routeName)
  if (!resource) {
    return { notFound: true }
  }

  if (resource.type === 'external') {
    return { redirectTo: resource.value }
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

function normalizeMetadataList(value: string[], maxItems: number, maxLength: number): string[] {
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

interface AutoCollectFrequencyRecord {
  timestamps: number[]
  staged: boolean
}

interface AutoCollectDailyLimitRecord {
  day: string
  count: number
}

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

function hitDailyAutoCollectLimit(
  groupId: string, limit: number,
  autoCollectDailyLimits: Map<string, AutoCollectDailyLimitRecord>
): boolean {
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

function isDailyAutoCollectLimitReached(
  groupId: string, limit: number,
  autoCollectDailyLimits: Map<string, AutoCollectDailyLimitRecord>
): boolean {
  const day = getDailyKey()
  const current = autoCollectDailyLimits.get(groupId)
  if (!current || current.day !== day) return false
  return current.count >= limit
}

function trackImageFrequency(
  hash: string, groupId: string, windowMs: number,
  autoCollectFrequencyTracker: Map<string, AutoCollectFrequencyRecord>
): { count: number; alreadyStaged: boolean } {
  const now = Date.now()
  const key = `${groupId}:${hash}`
  const record = autoCollectFrequencyTracker.get(key) || { timestamps: [], staged: false }
  record.timestamps = record.timestamps.filter((timestamp) => now - timestamp <= windowMs)
  record.timestamps.push(now)
  autoCollectFrequencyTracker.set(key, record)
  return { count: record.timestamps.length, alreadyStaged: record.staged }
}

function markImageFrequencyStaged(
  hash: string, groupId: string,
  autoCollectFrequencyTracker: Map<string, AutoCollectFrequencyRecord>
) {
  const key = `${groupId}:${hash}`
  const record = autoCollectFrequencyTracker.get(key)
  if (record) record.staged = true
}

function cleanupAutoCollectFrequency(
  windowMs: number,
  autoCollectFrequencyTracker: Map<string, AutoCollectFrequencyRecord>
) {
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

  const memeslunaText = getInjectVariablesPromptTemplate(config)
    .replaceAll('{endpoint}', inventory || '- 暂无可用路由')
    .replaceAll('{base_url}', baseUrl)
    .replaceAll('{backend_path}', config.backendPath)
    .replaceAll('{tag_routes}', '')
    .replaceAll('{tags}', '')

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
    'memesluna/getCollectionAccess',
    withReady(async (name: string) => {
      return await service.getCollectionAccess(name)
    })
  )

  consoleService.addListener(
    'memesluna/setCollectionAccess',
    withReady(async (name: string, access: CollectionAccess) => {
      return await service.setCollectionAccess(name, access)
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

function applyAutoCollect(ctx: Context, config: Config) {
  if (!config.autoCollect) return

  // 局部 Map：热重载时随插件 ctx dispose 一起销毁，不会累积
  const autoCollectFrequencyTracker = new Map<string, AutoCollectFrequencyRecord>()
  const autoCollectDailyLimits = new Map<string, AutoCollectDailyLimitRecord>()

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

    if (isDailyAutoCollectLimitReached(groupId, dailyLimit, autoCollectDailyLimits)) return

    const imageUrls = getMessageImages(session)
    if (!imageUrls.length) return

    const service = ctx.memesluna
    await service.ready

    for (const url of imageUrls) {
      try {
        const buffer = await downloadImage(ctx, url, maxBytes)
        const ext = getExtFromMagicBytes(buffer)
        if (!ext) continue
        if (buffer.length < minBytes || buffer.length > maxBytes) continue

        const hash = hashImageBuffer(buffer)
        const frequency = trackImageFrequency(hash, groupId, windowMs, autoCollectFrequencyTracker)
        if (frequency.alreadyStaged || frequency.count < threshold) continue

        const duplicate = await service.getDuplicateImageByHash(hash, { includeStaged: true, includeImages: true })
        if (duplicate) {
          markImageFrequencyStaged(hash, groupId, autoCollectFrequencyTracker)
          continue
        }

        if (hitDailyAutoCollectLimit(groupId, dailyLimit, autoCollectDailyLimits)) {
          ctx.logger('memesluna').debug(`Auto collect daily limit reached for group ${groupId}`)
          continue
        }

        await service.addStagedImageBuffer(
          buffer,
          `auto-${Date.now()}${ext}`,
          `auto:${groupId}`,
          `${windowMinutes} 分钟内出现 ${frequency.count} 次`
        )
        markImageFrequencyStaged(hash, groupId, autoCollectFrequencyTracker)
      } catch (error) {
        ctx.logger('memesluna').debug(`Auto collect image skipped: ${(error as Error).message}`)
      }
    }
  })

  ctx.setInterval(() => cleanupAutoCollectFrequency(windowMs, autoCollectFrequencyTracker), Math.max(60 * 1000, windowMs))
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

    const llmPrompt = getInjectVariablesPromptTemplate(config)
      .replaceAll('{endpoint}', inventory || '- 暂无可用路由')
      .replaceAll('{base_url}', baseUrl)
      .replaceAll('{backend_path}', config.backendPath)
      .replaceAll('{tag_routes}', '')
      .replaceAll('{tags}', '')

    koa.body = {
      llmPrompt,
      routeInventory: inventory,
      tagRoutes: '',
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
    if (!collectionName) {
      koa.status = 400
      koa.body = { error: 'Collection name is required' }
      return
    }

    let fileList: any[] = []

    // 1. Check if the upstream server middleware has already parsed the files
    const request = koa.request as any
    const parsedFiles = request.files || request.body?.files || request.body?.images

    if (parsedFiles) {
      const fileField = parsedFiles.images || parsedFiles.file || parsedFiles.files || parsedFiles
      if (fileField) {
        if (Array.isArray(fileField)) {
          fileList.push(...fileField)
        } else {
          fileList.push(fileField)
        }
      }
    } else {
      // 2. If not pre-parsed by any upstream middleware, parse using formidable
      const storageRoot = path.resolve(ctx.baseDir, 'data/memesluna')
      const tempDir = path.join(storageRoot, '.temp_upload')
      await fs.mkdir(tempDir, { recursive: true })

      const form = formidable({
        uploadDir: tempDir,
        keepExtensions: true,
        maxFileSize: 100 * 1024 * 1024, // 100MB
        multiples: true,
      })

      try {
        const [fields, files] = await new Promise<[any, any]>((resolve, reject) => {
          form.parse(koa.req, (err, fields, files) => {
            if (err) return reject(err)
            resolve([fields, files])
          })
        })

        const fileField = files.images || files.file || files.files
        if (fileField) {
          if (Array.isArray(fileField)) {
            fileList.push(...fileField)
          } else {
            fileList.push(fileField)
          }
        }
      } catch (err) {
        koa.status = 400
        koa.body = { error: err.message || 'Failed to parse upload stream' }
        return
      } finally {
        await fs.rmdir(tempDir).catch(() => {})
      }
    }

    if (!fileList.length) {
      koa.status = 400
      koa.body = { error: 'No images provided' }
      return
    }

    try {
      const uploaded: string[] = []
      const rowsToAnnotate: any[] = []
      for (const file of fileList) {
        const filePath = file.filepath || file.path
        const originalFilename = file.originalFilename || file.name || file.newFilename
        if (!filePath) continue

        const buffer = await fs.readFile(filePath)
        const result = await service.addLocalImageBuffer(
          collectionName,
          buffer,
          originalFilename
        )
        uploaded.push(result.filename)
        rowsToAnnotate.push({
          id: result.id,
          collection: collectionName,
          filename: result.filename,
        })

        // Delete temporary file
        await fs.unlink(filePath).catch(() => {})
      }

      if (service.annotator && rowsToAnnotate.length > 0) {
        void service.queueAnnotation(rowsToAnnotate)
      }

      koa.body = {
        ok: true,
        uploaded,
      }
    } catch (error) {
      koa.status = 400
      koa.body = { error: (error as Error).message || 'Failed to upload images' }
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
    const query = typeof koa.request.query?.q === 'string' ? koa.request.query.q.trim() : ''
    if (query) {
      const result = await findByQuery(ctx, config, service, query, koa.request.origin)
      setKoaResponse(koa, result || { notFound: true })
      return
    }

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
  ;(ctx as any).on(MEMESLUNA_IMAGES_UPDATED, invalidateAllImagesCache)
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

  if (config.model) {
    ctx.inject(['memesluna', 'chatluna'], async (ctx) => {
      const annotator = new AIAnnotator(ctx, config)
      await annotator.initialize()
      ctx.memesluna.setAnnotator(annotator)
    })
  }

  const root = ctx.command('memesluna', 'MemesLuna 命令')

  root
    .subcommand('.list', '查看当前可用表情路由')
    .action(async ({ session }) => {
      const service = ctx.memesluna
      await service.ready

      const accessSession = toCollectionAccessSession(session)
      const [collectionNames, endpoints] = await Promise.all([
        service.getCollections(),
        service.getEndpoints(),
      ])

      const collectionInfos = (
        await Promise.all(collectionNames.map((collectionName) => service.getCollectionInfo(collectionName)))
      ).filter((info): info is NonNullable<typeof info> => !!info?.hasContent)

      const lines: string[] = filterCollectionsByAccess(collectionInfos, accessSession)
        .map((info) => `${info.name} ${info.name}表情包`)

      for (const endpoint of endpoints) {
        const endpointLabel = endpoint.description || `${endpoint.name}端点`
        lines.push(`${endpoint.name} ${endpointLabel}`)
      }

      if (!lines.length) {
        return '暂无可用表情路由'
      }

      return lines.join('\n')
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
        return `表情包合集 "${name}" 不存在，请先在 Koishi Console 的 MemesLuna 页面创建。`
      }
    } catch (err) {
      return `检查表情包失败: ${(err as Error).message}`
    }

    // 权限检查必须在下载/写文件之前
    const access = await service.getCollectionAccess(name)
    const accessSession = toCollectionAccessSession(session)
    if (!isCollectionAccessAllowed(access, accessSession)) {
      return `当前会话无权向表情包合集「${name}」写入图片（访问限制：${access.mode === 'whitelist' ? '白名单' : '黑名单'}）。`
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
    let incompatibleCount = 0
    let failedCount = 0
    const savedFilenames: string[] = []
    const rowsToAnnotate: any[] = []

    for (const url of imageUrls) {
      try {
        const buffer = await downloadImage(ctx, url, 50 * 1024 * 1024)
        const ext = getExtFromMagicBytes(buffer)
        if (!ext) {
          incompatibleCount++
          continue
        }

        const result = await service.addLocalImageBuffer(name, buffer, `stole${ext}`)
        savedFilenames.push(result.filename)
        rowsToAnnotate.push({
          id: result.id,
          collection: name,
          filename: result.filename,
        })
        successCount++
      } catch (err) {
        failedCount++
        ctx.logger('memesluna').error(`Failed to steal image from URL: ${url}`, err)
      }
    }

    if (successCount === 0) {
      if (incompatibleCount > 0 && failedCount === 0) {
        return '偷表情包失败，图片格式不兼容。仅支持 JPG/PNG/GIF/WEBP/BMP 格式图片（已拒绝 AVIF，且不会放入暂缓区）。'
      }
      return '偷表情包失败，下载图片或上传保存时发生错误。'
    }

    if (service.annotator && rowsToAnnotate.length > 0) {
      void service.queueAnnotation(rowsToAnnotate)
    }

    const skippedHints = [
      incompatibleCount ? `跳过 ${incompatibleCount} 张格式不兼容图片` : '',
      failedCount ? `${failedCount} 张下载或保存失败` : '',
    ].filter(Boolean)
    const skippedText = skippedHints.length ? `（${skippedHints.join('，')}）` : ''

    return `成功偷了 ${successCount} 张表情包存入表情包 "${name}"！${skippedText}新文件名：${savedFilenames.join(', ')}`
  }

  root
    .subcommand('.stole <name:string>', '偷取引用消息中的图片并存入指定表情包')
    .action(async ({ session }, name) => {
      return await stoleAction(session, name)
    })

  root
    .subcommand('.tagall', '批量为以往的图片自动进行 AI 语义打标', { authority: 3 })
    .option('force', '-f 强制为已打标的图片重新进行 AI 标注')
    .action(async ({ session, options }) => {
      const service = ctx.memesluna
      await service.ready
      const annotator = service.annotator
      if (!annotator) return 'AI 标注器未就绪，请先在配置中指定模型（model）。'

      const images = await ctx.database.get('memesluna_images', {})
      const targets = images.filter((img) => {
        if (options?.force) return true
        let tags: string[] = []
        try { const p = JSON.parse(img.tags || '[]'); tags = Array.isArray(p) ? p : [] } catch {}
        return tags.length === 0
      })

      if (targets.length === 0) {
        return '没有发现需要标注的图片。'
      }

      if (session) {
        await session.send(`开始批量为 ${targets.length} 张图片进行 AI 自动标注，这可能需要一些时间，请稍候...`)
      }

      let successCount = 0
      let failCount = 0
      const chunkSize = 20

      for (let i = 0; i < targets.length; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize)
        if (session) {
          await session.send(`正在处理第 ${i + 1} ~ ${Math.min(i + chunkSize, targets.length)} 张图片（当前成功：${successCount}，失败：${failCount}）...`)
        }

        const concurrency = config.aiConcurrency || 2
        const chunkTargets = [...chunk]
        const workers = Array(concurrency).fill(null).map(async () => {
          while (chunkTargets.length > 0) {
            const row = chunkTargets.shift()
            if (!row) break
            try {
              if (row.type !== 'local') continue
              const image = await service.getLocalImageBuffer(row.collection, row.filename)
              if (!image) {
                failCount++
                continue
              }
              const result = await annotator.annotate(image.buffer, {
                filename: row.filename,
                collectionName: row.collection,
                imageUrl: `${config.backendPath}/${encodeURIComponent(row.collection)}/${encodeURIComponent(row.filename)}`,
              })
              if (result) {
                await service.updateImageAnnotation(row.id, result.aliases, result.tags)
                successCount++
              } else {
                failCount++
              }
              // Delay between requests to avoid rate limits
              await new Promise((resolve) => setTimeout(resolve, config.aiBatchDelay || 500))
            } catch (err) {
              failCount++
              ctx.logger('memesluna').error(`Failed batch annotating image ${row.filename}:`, err)
            }
          }
        })
        await Promise.all(workers)
      }

      return `批量 AI 标注已完成！\n成功：${successCount} 张\n失败：${failCount} 张`
    })

  root
    .subcommand('.untagall', '一键清空表情图片的标签', { authority: 3 })
    .alias('.cleartags')
    .option('collection', '-c <collection:string> 仅清空指定合集的图片标签')
    .action(async ({ session, options }) => {
      const service = ctx.memesluna
      await service.ready

      const filter: any = {}
      if (options?.collection) {
        const hasCol = await service.collectionExists(options.collection)
        if (!hasCol) {
          return `表情包合集 "${options.collection}" 不存在。`
        }
        filter.collection = options.collection
      }

      const images = await ctx.database.get('memesluna_images', filter)
      const targets = images.filter((img) => {
        let tags: string[] = []
        try { const p = JSON.parse(img.tags || '[]'); tags = Array.isArray(p) ? p : [] } catch {}
        return tags.length > 0
      })

      if (targets.length === 0) {
        return '没有发现需要清空标签的图片。'
      }

      if (session) {
        await session.send(`开始清空 ${targets.length} 张表情图片的标签，请稍候...`)
      }

      let successCount = 0
      for (const row of targets) {
        try {
          await service.updateImageAnnotation(row.id, undefined, [])
          successCount++
        } catch (err) {
          ctx.logger('memesluna').error(`Failed clearing tag for ${row.filename}:`, err)
        }
      }

      return `已成功清空 ${successCount} 张表情图片的标签！`
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
        ;(ctx as any).chatluna.promptRenderer.removeVariable('tag_routes')
        ;(ctx as any).chatluna.promptRenderer.removeVariable('memesluna')
      })
    })
  }
}

export * from './config'
export * from './service'

export const inject = {
  required: ['database', 'chatluna', 'server'],
  optional: ['console'],
}
