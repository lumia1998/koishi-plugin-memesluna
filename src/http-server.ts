import fs from 'fs/promises'
import path from 'path'
import { Context } from 'koishi'
import type { Config } from './config'
import { getInjectVariablesPromptTemplate } from './chatluna-inject'
import { findByQuery } from './search'
import {
  isReservedPath,
  type MemesLunaService,
} from './service'
import {
  toStringArray,
  toTrimmedString,
} from './utils'
import { getLocalBaseUrl, toAbsoluteBaseUrl } from './urls'
import formidable from 'formidable'
import { adminHttpGuard } from './admin-auth'
import { MAX_IMAGE_BYTES, MAX_UPLOAD_FILES, MAX_UPLOAD_TOTAL_BYTES } from './constants'

async function applyDynamicForward(
  ctx: Context,
  config: Config,
  service: MemesLunaService,
  routeName: string,
  _query: Record<string, unknown>,
  requestOrigin?: string,
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

async function buildAdminState(service: MemesLunaService) {
  const endpoints = await service.getEndpoints()
  const collections = await service.getCollectionInfos()
  const collectionNames = collections.map((item) => item.name)
  const stagedImages = await service.getStagedImages()

  return {
    endpoints,
    collectionNames,
    collections: collections.filter(Boolean),
    stagedImages,
  }
}

export function applyServer(ctx: Context, config: Config, service: MemesLunaService) {
  if (!ctx.server) return

  const basePath = config.backendPath

  const guard = adminHttpGuard(ctx)
  const server = Object.fromEntries(['get', 'post', 'patch', 'delete'].map((method) => [method,
    (route: string, handler: (koa: any) => Promise<void>) => {
      if (!route.startsWith(`${basePath}/api/admin/`)) {
        return (ctx.server as any)[method](route, handler)
      }
      const run = async (koa: any) => {
        await service.ready
        try { await handler(koa) }
        catch (error) {
          koa.status = 400
          koa.body = { error: (error as Error).message || 'Operation failed' }
        }
      }
      const handle = async (koa: any) => {
        // Multipart 上传由下面的专用解析器负责，JSON 只在鉴权成功后解析。
        if (method === 'post' && route.endsWith('/:name/images')) await run(koa)
        else await (ctx.server as any)._body(koa, () => run(koa))
      }
      return (ctx.server as any)[method](route, guard, handle)
    },
  ])) as Record<'get' | 'post' | 'patch' | 'delete', (route: string, handler: (koa: any) => Promise<void>) => unknown>

  server.get(`${basePath}/api/homepage-data`, async (koa) => {
    const baseUrl = toAbsoluteBaseUrl(ctx, config)
    const endpoints = await service.getEndpoints()
    const collectionInfos = await service.getCollectionInfos()
    const inventory = await service.buildRouteInventory(basePath, { endpoints, collections: collectionInfos })

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

  server.get(`${basePath}/api/admin/state`, async (koa) => {
    koa.body = await buildAdminState(service)
  })

  server.post(`${basePath}/api/admin/collections`, async (koa) => {
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

  server.delete(`${basePath}/api/admin/collections/:name`, async (koa) => {
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

  server.get(`${basePath}/api/admin/staged-images/similar`, async (koa) => {
    koa.body = await service.getSimilarStagedImages(config.similarityThreshold)
  })
  server.get(`${basePath}/api/admin/staged-images/:id`, async (koa) => {
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

  server.post(`${basePath}/api/admin/staged-images`, async (koa) => {
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

  server.delete(`${basePath}/api/admin/staged-images`, async (koa) => {
    const deleted = await service.deleteAllStagedImages()
    koa.body = { ok: true, deleted }
  })

  server.patch(`${basePath}/api/admin/collections/:name/description`, async (koa) => {
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

  server.get(`${basePath}/api/admin/collections/:name/images/:filename`, async (koa) => {
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

  server.post(`${basePath}/api/admin/collections/:name/images`, async (koa) => {
    const collectionName = toTrimmedString(koa.params.name)
    if (!collectionName) {
      koa.status = 400
      koa.body = { error: 'Collection name is required' }
      return
    }

    if (!(koa.get('content-type') || '').toLowerCase().startsWith('multipart/form-data;')) {
      koa.status = 415
      koa.body = { error: 'multipart/form-data is required' }
      return
    }
    const storageRoot = path.resolve(ctx.baseDir, 'data/memesluna')
    await fs.mkdir(storageRoot, { recursive: true })
    const tempDir = await fs.mkdtemp(path.join(storageRoot, '.temp_upload-'))
    const form = formidable({
      uploadDir: tempDir, keepExtensions: true, multiples: true,
      maxFileSize: MAX_IMAGE_BYTES, maxFiles: MAX_UPLOAD_FILES,
      maxTotalFileSize: MAX_UPLOAD_TOTAL_BYTES,
    })
    const uploaded: string[] = []
    const failed: Array<{ filename: string; error: string }> = []
    const rowsToAnnotate: any[] = []
    try {
      const files = await new Promise<formidable.Files>((resolve, reject) => {
        form.parse(koa.req, (error, _fields, files) => error ? reject(error) : resolve(files))
      })
      const field = files.images || files.file || files.files
      const fileList = Array.isArray(field) ? field : field ? [field] : []
      if (!fileList.length) throw new Error('No images provided')
      for (const file of fileList) {
        try {
          const buffer = await fs.readFile(file.filepath)
          const result = await service.addLocalImageBuffer(collectionName, buffer, file.originalFilename || undefined)
          uploaded.push(result.filename)
          rowsToAnnotate.push({ id: result.id, collection: collectionName, filename: result.filename })
        } catch (error) {
          failed.push({ filename: file.originalFilename || '', error: (error as Error).message })
        }
      }
      if (service.annotator && rowsToAnnotate.length) {
        void service.queueAnnotation(rowsToAnnotate).catch((error) => ctx.logger('memesluna').warn(error))
      }
      koa.status = uploaded.length ? 200 : 400
      koa.body = { ok: failed.length === 0, uploaded, failed }
    } catch (error) {
      koa.status = 400
      koa.body = { error: (error as Error).message || 'Failed to parse upload stream' }
    } finally {
      // 包括解析失败、单张失败和剩余未处理文件，不清理其他请求的目录。
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  })

  server.delete(`${basePath}/api/admin/collections/:name/images/:filename`, async (koa) => {
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

  server.post(`${basePath}/api/admin/collections/:name/images/:filename/move`, async (koa) => {
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

  server.post(`${basePath}/api/admin/collections/:name/links`, async (koa) => {
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

  server.delete(`${basePath}/api/admin/collections/:name/links`, async (koa) => {
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

  server.get(`${basePath}/api/admin/endpoints`, async (koa) => {
    koa.body = {
      endpoints: await service.getEndpoints(),
    }
  })

  server.post(`${basePath}/api/admin/endpoints`, async (koa) => {
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

  server.patch(`${basePath}/api/admin/endpoints/:name`, async (koa) => {
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

  server.delete(`${basePath}/api/admin/endpoints/:name`, async (koa) => {
    const name = toTrimmedString(koa.params.name)
    const deleted = await service.deleteEndpoint(name)
    if (!deleted) {
      koa.status = 404
      koa.body = { error: 'Endpoint not found' }
      return
    }

    koa.body = { ok: true }
  })

  server.get(`${basePath}/admin`, async (koa) => {
    koa.redirect('/console/memesluna')
  })

  server.get(`${basePath}/admin/endpoint`, async (koa) => {
    koa.redirect('/console/memesluna')
  })

  server.get(`${basePath}/api/collections/:name/resources`, async (koa) => {
    const collectionName = koa.params.name
    const images = await service.getCollectionImages(collectionName)
    const links = await service.getCollectionLinks(collectionName)
    koa.body = {
      name: collectionName,
      images,
      links,
    }
  })

  server.get(`${basePath}/api/collections/:name/images/:filename`, async (koa) => {
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

  server.get(`${basePath}/`, async (koa) => {
    const query = typeof koa.request.query?.q === 'string' ? koa.request.query.q.trim() : ''
    if (query) {
      const result = await findByQuery(ctx, config, service, query, koa.request.origin)
      setKoaResponse(koa, result || { notFound: true })
      return
    }

    koa.redirect('/console/memesluna')
  })

  server.get(`${basePath}/:name`, async (koa) => {
    const routeName = koa.params.name as string

    if (isReservedPath(routeName)) {
      koa.status = 404
      koa.body = { error: 'Not Found' }
      return
    }

    const query = koa.request.query as Record<string, unknown>
    const result = await applyDynamicForward(
      ctx,
      config,
      service,
      routeName,
      query,
      koa.request.origin,
    )

    setKoaResponse(koa, result)
  })

  server.get(`${basePath}/:name/:filename`, async (koa) => {
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
