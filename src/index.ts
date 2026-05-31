import fs from 'fs/promises'
import path from 'path'
import type {} from '@koishijs/plugin-console'
import type {} from 'koishi-plugin-chatluna'

import { Context } from 'koishi'
import { Config, ProxySettings, QueryParamConfig } from './config'
import { MemesLunaService } from './service'

const RESERVED_PATHS = new Set([
  'config',
  'admin',
  'admin-login',
  'admin-logout',
  'api',
  'css',
  'js',
  'picture',
  'view',
  'project_bg',
  'static',
  'favicon.ico',
])

const IMAGE_URL_REGEXP = /\.(jpeg|jpg|gif|png|webp|bmp|svg)(\?.*)?$/i

function isReservedPath(name: string): boolean {
  return RESERVED_PATHS.has(name) || name.includes('.')
}

function getValueByDotNotation(obj: unknown, dotPath?: string): unknown {
  if (!dotPath) return undefined
  const parts = dotPath.split('.').filter(Boolean)
  let current: unknown = obj

  for (const part of parts) {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part]
      continue
    }
    return undefined
  }

  return current
}

function normalizeContentType(contentType: string | null | undefined): string {
  if (!contentType) return ''
  return contentType.toLowerCase().split(';')[0].trim()
}

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

async function handleProxyRequest(targetUrl: string, proxySettings: ProxySettings = {}) {
  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        accept: 'application/json, text/plain, */*',
      },
      signal: AbortSignal.timeout(15000),
    })

    const status = response.status
    const contentType = normalizeContentType(response.headers.get('content-type'))

    if (status >= 400) {
      if (contentType === 'application/json') {
        try {
          return {
            status,
            body: await response.json(),
            contentType: 'application/json',
          }
        } catch {
          return {
            status,
            body: { error: `Target API error (${status})` },
            contentType: 'application/json',
          }
        }
      }

      return {
        status,
        body: { error: `Target API error (${status})` },
        contentType: 'application/json',
      }
    }

    let jsonObject: unknown = undefined
    if (contentType === 'application/json') {
      try {
        jsonObject = await response.json()
      } catch {
        jsonObject = undefined
      }
    }

    const imageUrlField =
      typeof proxySettings.imageUrlField === 'string' ? proxySettings.imageUrlField : undefined
    const candidate = imageUrlField ? getValueByDotNotation(jsonObject, imageUrlField) : undefined

    if (typeof candidate === 'string' && IMAGE_URL_REGEXP.test(candidate)) {
      return {
        redirectTo: candidate,
      }
    }

    const fallbackAction =
      proxySettings.fallbackAction === 'error' ? 'error' : 'returnJson'

    if (fallbackAction === 'error') {
      return {
        status: 404,
        body: { error: 'Could not extract image URL' },
        contentType: 'application/json',
      }
    }

    if (jsonObject !== undefined) {
      return {
        status,
        body: jsonObject,
        contentType: 'application/json',
      }
    }

    return {
      status,
      body: await response.text(),
      contentType: contentType || 'text/plain',
    }
  } catch (error) {
    const message = (error as Error).message || 'Proxy setup failed'
    const isTimeout =
      message.toLowerCase().includes('timeout') ||
      (error instanceof DOMException && error.name === 'TimeoutError')

    return {
      status: isTimeout ? 504 : 500,
      body: { error: isTimeout ? 'Proxy request timeout' : 'Proxy setup failed' },
      contentType: 'application/json',
    }
  }
}

function toAbsoluteBaseUrl(ctx: Context, config: Config): string {
  return config.selfUrl || ctx.server?.selfUrl || ''
}

async function applyDynamicForward(
  ctx: Context,
  config: Config,
  service: MemesLunaService,
  routeName: string,
  query: Record<string, unknown>
) {
  const endpoint = await service.getEndpointByName(routeName)
  const isCollection = await service.collectionExists(routeName)

  if (!endpoint && !isCollection) {
    return { notFound: true }
  }

  if (endpoint) {
    const urlConstruction = endpoint.urlConstruction || 'normal'

    if (urlConstruction === 'special_forward') {
      const target = typeof query.url === 'string' ? query.url : undefined
      const fieldFromQuery = typeof query.field === 'string' ? query.field : undefined
      const defaultField = endpoint.proxySettings.imageUrlFieldFromParamDefault || 'url'
      const field = fieldFromQuery || defaultField

      if (!target) {
        return {
          status: 400,
          body: { error: 'Missing url parameter' },
          contentType: 'application/json',
        }
      }

      return await handleProxyRequest(target, {
        ...endpoint.proxySettings,
        imageUrlField: field,
      })
    }

    if (urlConstruction === 'special_pollinations') {
      const tags = typeof query.tags === 'string' ? query.tags : undefined
      if (!tags) {
        return {
          status: 400,
          body: { error: 'Missing tags parameter' },
          contentType: 'application/json',
        }
      }

      const modelName = endpoint.modelName || ''
      const prefix = endpoint.url || ''
      const promptUrl = `${prefix}${encodeURIComponent(tags)}?&model=${encodeURIComponent(modelName)}&nologo=true`

      return { redirectTo: promptUrl }
    }

    if (urlConstruction === 'special_draw_redirect') {
      const tags = typeof query.tags === 'string' ? query.tags : undefined
      if (!tags) {
        return {
          status: 400,
          body: { error: 'Missing tags parameter' },
          contentType: 'application/json',
        }
      }

      const defaultModel =
        endpoint.queryParams.find((item) => item.name === 'model')?.defaultValue || 'flux'
      const model =
        typeof query.model === 'string' && query.model.trim().length > 0
          ? query.model
          : defaultModel

      return {
        redirectTo: `${config.backendPath}/${encodeURIComponent(model)}?tags=${encodeURIComponent(tags)}`,
      }
    }

    const validated = new URLSearchParams()
    const errors: string[] = []

    for (const param of endpoint.queryParams) {
      const name = param.name
      const raw = query[name]
      const value = Array.isArray(raw) ? raw[0] : raw

      if (typeof value === 'string') {
        if (param.validValues && param.validValues.length > 0 && !param.validValues.includes(value)) {
          errors.push(`Invalid value for '${name}'`)
        } else {
          validated.set(name, value)
        }
        continue
      }

      if (param.required) {
        errors.push(`Missing required parameter: ${name}`)
        continue
      }

      if (param.defaultValue !== undefined) {
        validated.set(name, param.defaultValue)
      }
    }

    if (errors.length > 0) {
      return {
        status: 400,
        body: { error: 'Invalid parameters', details: errors },
        contentType: 'application/json',
      }
    }

    if (!endpoint.url) {
      return {
        status: 500,
        body: { error: 'Configuration URL missing' },
        contentType: 'application/json',
      }
    }

    const target = new URL(endpoint.url)
    for (const [k, v] of validated) {
      target.searchParams.set(k, v)
    }

    if (endpoint.method === 'proxy') {
      return await handleProxyRequest(target.toString(), endpoint.proxySettings)
    }

    return { redirectTo: target.toString() }
  }

  const resource = await service.getRandomResource(routeName)
  if (!resource) {
    return { notFound: true }
  }

  if (resource.type === 'external') {
    return { redirectTo: resource.value }
  }

  const fileBuffer = await fs.readFile(resource.value)
  return {
    status: 200,
    body: fileBuffer,
    contentType: guessMimeByExt(resource.value),
  }
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

function parseJsonLike<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return fallback
    try {
      return JSON.parse(text) as T
    } catch {
      return fallback
    }
  }
  if (typeof value === 'object') {
    return value as T
  }
  return fallback
}

function normalizeForwardMethod(value: unknown): 'redirect' | 'proxy' {
  return toTrimmedString(value) === 'proxy' ? 'proxy' : 'redirect'
}

function normalizeUrlConstruction(value: unknown):
  | 'normal'
  | 'special_forward'
  | 'special_pollinations'
  | 'special_draw_redirect' {
  const normalized = toTrimmedString(value)
  if (
    normalized === 'special_forward' ||
    normalized === 'special_pollinations' ||
    normalized === 'special_draw_redirect'
  ) {
    return normalized
  }
  return 'normal'
}

async function buildAdminState(service: MemesLunaService) {
  const endpoints = await service.getEndpoints()
  const collectionNames = await service.getCollections()
  const collections = await Promise.all(collectionNames.map((name) => service.getCollectionInfo(name)))

  return {
    endpoints,
    collectionNames,
    collections: collections.filter(Boolean),
  }
}

async function updateMemesVariable(ctx: Context, config: Config, service: MemesLunaService) {

  const baseUrl = toAbsoluteBaseUrl(ctx, config)
  const inventory = await service.buildRouteInventory(config.backendPath)

  ;(ctx as any).chatluna.promptRenderer.setVariable('endpoint', inventory || '- 暂无可用路由')

  const memeslunaText = config.injectVariablesPrompt
    .replace('{endpoint}', inventory || '- 暂无可用路由')
    .replace('{base_url}', baseUrl)

  ;(ctx as any).chatluna.promptRenderer.setVariable('memesluna', memeslunaText)
}

function applyConsole(ctx: Context, config: Config, service: MemesLunaService) {
  console.log('[MemesLuna] applyConsole started!');
  if (!ctx.console) {
    console.log('[MemesLuna] ctx.console is missing!');
    return;
  }

  const consoleService = ctx.console as any;
  const packageBase = path.resolve(__dirname, '..');
  console.log('[MemesLuna] packageBase:', packageBase);
  
  const devPath = path.resolve(packageBase, 'client/index.ts');
  const prodPath = path.resolve(packageBase, 'dist');
  console.log('[MemesLuna] Registering console entry:', { dev: devPath, prod: prodPath });

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

      return {
        backendPath: config.backendPath,
        endpoints,
        collections: detailedCollections.filter(Boolean),
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
    'memesluna/uploadLocalImage',
    withReady(async (collectionName: string, imageBase64: string, originalName?: string) => {
      return await service.addLocalImageBase64(collectionName, imageBase64, originalName)
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

  consoleService.addListener('memesluna/getBaseUrl', async () => {
    return `${toAbsoluteBaseUrl(ctx, config)}${config.backendPath}`
  })
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
      .replace('{endpoint}', inventory || '- 暂无可用路由')
      .replace('{base_url}', baseUrl)

    koa.body = {
      llmPrompt,
      routeInventory: inventory,
      endpoints,
      collections: collectionInfos.filter(Boolean),
    }
  })

    ctx.server.get(`${basePath}/api/admin/state`, async (koa) => {
      const state = await buildAdminState(service)
      console.log('Admin State:', JSON.stringify(state, null, 2))
      koa.body = state
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
      method: normalizeForwardMethod(body.method),
      urlConstruction: normalizeUrlConstruction(body.urlConstruction),
      modelName: toTrimmedString(body.modelName),
      queryParams: parseJsonLike<QueryParamConfig[]>(body.queryParams, []),
      proxySettings: parseJsonLike<ProxySettings>(body.proxySettings, { fallbackAction: 'returnJson' }),
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
    if (body.method !== undefined) payload.method = normalizeForwardMethod(body.method)
    if (body.urlConstruction !== undefined)
      payload.urlConstruction = normalizeUrlConstruction(body.urlConstruction)
    if (body.modelName !== undefined) payload.modelName = toTrimmedString(body.modelName)
    if (body.queryParams !== undefined)
      payload.queryParams = parseJsonLike<QueryParamConfig[]>(body.queryParams, [])
    if (body.proxySettings !== undefined)
      payload.proxySettings = parseJsonLike<ProxySettings>(body.proxySettings, { fallbackAction: 'returnJson' })

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
      koa.request.query as Record<string, unknown>
    )

    setKoaResponse(koa, result)
  })
}

export function apply(ctx: Context, config: Config) {
  ctx.plugin(MemesLunaService, config)

  ctx.inject(['memesluna', 'server'], async (ctx) => {
    const service = ctx.memesluna
    await service.ready
    applyServer(ctx, config, service)
  })

  ctx.inject(['memesluna', 'console'], async (ctx) => {
    console.log('[MemesLuna] Console inject hook triggered!');
    const service = ctx.memesluna
    applyConsole(ctx, config, service)
  })

  ctx.inject(['memesluna'], (ctx) => {
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

export const inject = ['database', 'chatluna', 'server']
