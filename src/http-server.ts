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

export function applyServer(ctx: Context, config: Config, service: MemesLunaService) {
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
        koa.body = { error: (err as Error).message || 'Failed to parse upload stream' }
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
