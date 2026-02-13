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

function buildHomepageHtml(basePath: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>图床转发 - 首页</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.3/font/bootstrap-icons.css">
  <style>
    :root {
      --page-bg-image-opacity: 0.25;
      --navbar-bg-opacity: 0.65;
    }

    body {
      min-height: 100vh;
      margin: 0;
      color: #212529;
      background-color: #f4f6fb;
    }

    body.has-global-background {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      background-attachment: fixed;
    }

    body.has-global-background::before {
      content: '';
      position: fixed;
      inset: 0;
      background-color: white;
      opacity: calc(1 - var(--page-bg-image-opacity, 1));
      z-index: -1;
    }

    .navbar.acrylic-navbar {
      background-color: rgba(248, 249, 250, var(--navbar-bg-opacity));
      -webkit-backdrop-filter: blur(12px) saturate(150%);
      backdrop-filter: blur(12px) saturate(150%);
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    .page-container {
      max-width: 1240px;
    }

    .group-section {
      margin-bottom: 1.25rem;
    }

    .group-title-home {
      margin-bottom: 0.75rem;
      font-size: 1.05rem;
      font-weight: 700;
      color: #334155;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .cards-row {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 0.9rem;
    }

    .api-card {
      background: rgba(255, 255, 255, 0.78);
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.4);
      -webkit-backdrop-filter: blur(8px) saturate(120%);
      backdrop-filter: blur(8px) saturate(120%);
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .api-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.14);
    }

    .api-card-image {
      position: relative;
      width: 100%;
      aspect-ratio: 4 / 3;
      background: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
    }

    .api-card-image img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .api-card:hover .api-card-image img {
      transform: scale(1.05);
    }

    .api-card-image .image-overlay {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      padding: 0.5rem;
      background: linear-gradient(180deg, transparent 0%, rgba(15, 23, 42, 0.55) 100%);
      display: flex;
      justify-content: flex-end;
      pointer-events: none;
    }

    .refresh-hint {
      color: #fff;
      font-size: 0.75rem;
      background: rgba(15, 23, 42, 0.35);
      border-radius: 999px;
      padding: 2px 8px;
      display: inline-flex;
      align-items: center;
      gap: 0;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .api-card-image:hover .refresh-hint {
      opacity: 1;
    }

    .api-badge {
      position: absolute;
      right: 8px;
      bottom: 8px;
      max-width: calc(100% - 16px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid rgba(255, 255, 255, 0.44);
      color: #334155;
      border-radius: 8px;
      padding: 3px 9px;
      font-size: 0.82rem;
      font-weight: 600;
      -webkit-backdrop-filter: blur(8px) saturate(120%);
      backdrop-filter: blur(8px) saturate(120%);
      pointer-events: none;
    }

    .api-card-info {
      padding: 0.65rem 0.8rem 0.75rem;
    }

    .api-hint,
    .api-url {
      margin: 0;
      font-size: 0.8rem;
      line-height: 1.4;
      color: #64748b;
      word-break: break-all;
    }

    .api-url {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      margin-top: 0.2rem;
    }

    .media-loader {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      font-size: 0.82rem;
      z-index: 2;
    }

    .loader-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #cbd5e1;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    .error-panel {
      display: none !important;
    }

    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (max-width: 768px) {
      .cards-row {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body
  class="has-global-background"
  style="background-image: url('/project_bg/default_background.jpg'); --page-bg-image-opacity: 0.25;"
  data-bs-theme="auto">
  <nav class="navbar navbar-expand-lg navbar-light acrylic-navbar">
    <div class="container page-container">
      <a class="navbar-brand" href="${basePath}/">MemesLuna</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <a class="nav-link active" href="${basePath}/">首页</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="${basePath}/admin">管理</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>

  <div class="container page-container mt-3 pb-4">
    <div class="group-section">
      <h3 class="group-title-home">🌐 接口端点</h3>
      <div class="cards-row" id="endpoint-cards"></div>
    </div>

    <div class="group-section">
      <h3 class="group-title-home">📷 本地图片合集</h3>
      <div class="cards-row" id="collection-cards"></div>
    </div>

    <div class="alert alert-danger error-panel" id="error-panel">
      <strong>加载失败：</strong><span id="error-text"></span>
    </div>
  </div>

  <script>
    const BASE_PATH = '${basePath}'
    const API_URL = BASE_PATH + '/api/homepage-data'

    function showError(message) {
      const panel = document.getElementById('error-panel')
      const text = document.getElementById('error-text')
      if (text) text.textContent = message
      if (panel) panel.classList.remove('error-panel')
      if (panel) panel.style.display = 'block'
    }

    function createLoader() {
      const loader = document.createElement('div')
      loader.className = 'media-loader'
      loader.innerHTML = '<div class="loader-spinner"></div><span>加载中...</span>'
      return loader
    }

    function createCardImage(imageUrl, badgeText, clickUrl, clickable = true) {
      const wrap = document.createElement('div')
      wrap.className = 'api-card-image'

      const loader = createLoader()
      wrap.appendChild(loader)

      const img = document.createElement('img')
      img.src = imageUrl
      img.alt = badgeText
      img.loading = 'lazy'
      img.addEventListener('load', () => loader.remove())
      img.addEventListener('error', () => {
        loader.remove()
        img.style.display = 'none'
      })
      wrap.appendChild(img)

      const overlay = document.createElement('div')
      overlay.className = 'image-overlay'
      overlay.innerHTML = '<span class="refresh-hint"><i class="bi bi-arrow-clockwise"></i></span>'
      wrap.appendChild(overlay)

      const badge = document.createElement('span')
      badge.className = 'api-badge'
      badge.textContent = badgeText
      wrap.appendChild(badge)

      if (clickable && clickUrl) {
        wrap.addEventListener('click', () => {
          img.src = clickUrl + '?t=' + Date.now()
        })
      }

      return wrap
    }

    function buildEndpointCard(item) {
      const card = document.createElement('div')
      card.className = 'api-card'

      const endpointName = String(item.name || '')
      const endpointPath = BASE_PATH + '/' + encodeURIComponent(endpointName)
      const sampleImage = 'https://picsum.photos/seed/' + encodeURIComponent(endpointName || 'memesluna') + '/640/480'

      card.appendChild(createCardImage(sampleImage, endpointName || 'endpoint', endpointPath))

      const info = document.createElement('div')
      info.className = 'api-card-info'
      const method = String(item.method || 'redirect').toUpperCase()
      const mode = String(item.urlConstruction || 'normal')
      const target = String(item.url || '')

      info.innerHTML =
        '<p class="api-hint">⚙️ ' + method + ' · ' + mode + '</p>' +
        '<p class="api-url">' + endpointPath + '</p>' +
        '<p class="api-url">→ ' + target + '</p>'

      card.appendChild(info)
      return card
    }

    function buildCollectionCard(item) {
      const card = document.createElement('div')
      card.className = 'api-card'

      const name = String(item.name || '')
      const route = BASE_PATH + '/' + encodeURIComponent(name)
      const hasCover = typeof item.cover === 'string' && item.cover.length > 0
      const coverUrl = hasCover
        ? route + '?t=' + Date.now()
        : 'https://picsum.photos/seed/' + encodeURIComponent(name || 'collection') + '/640/480'

      card.appendChild(createCardImage(coverUrl, name || 'collection', route, true))

      const info = document.createElement('div')
      info.className = 'api-card-info'
      const localCount = Number(item.localCount || 0)
      const linkCount = Number(item.linkCount || 0)
      const totalCount = Number(item.totalCount || 0)

      info.innerHTML =
        '<p class="api-hint">📁 本地 ' + localCount + ' · 外链 ' + linkCount + ' · 总计 ' + totalCount + '</p>' +
        '<p class="api-url">' + route + '</p>'

      card.appendChild(info)
      return card
    }

    async function load() {
      try {
        const res = await fetch(API_URL)
        if (!res.ok) {
          throw new Error(String(res.status) + ' ' + String(res.statusText))
        }

        const data = await res.json()
        const endpoints = Array.isArray(data.endpoints) ? data.endpoints : []
        const collections = Array.isArray(data.collections) ? data.collections : []
        const endpointWrap = document.getElementById('endpoint-cards')
        if (endpointWrap) {
          endpointWrap.textContent = ''
          if (!endpoints.length) {
            const empty = document.createElement('div')
            empty.className = 'alert alert-secondary mb-0'
            empty.textContent = '暂无 endpoint'
            endpointWrap.appendChild(empty)
          } else {
            endpoints.forEach((item) => endpointWrap.appendChild(buildEndpointCard(item)))
          }
        }

        const collectionWrap = document.getElementById('collection-cards')
        if (collectionWrap) {
          collectionWrap.textContent = ''
          if (!collections.length) {
            const empty = document.createElement('div')
            empty.className = 'alert alert-secondary mb-0'
            empty.textContent = '暂无 collection'
            collectionWrap.appendChild(empty)
          } else {
            collections.forEach((item) => collectionWrap.appendChild(buildCollectionCard(item)))
          }
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error))
      }
    }

    load()
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`
}

function buildAdminHtml(basePath: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>图床转发 - 合集管理</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.3/font/bootstrap-icons.css">
  <style>
    body {
      min-height: 100vh;
      margin: 0;
      color: #1f2937;
      background-color: #f4f6fb;
      background-image: url('/project_bg/default_background.jpg');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      background-attachment: fixed;
    }

    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-color: rgba(255, 255, 255, 0.78);
      z-index: -1;
    }

    .acrylic-navbar {
      background-color: rgba(248, 249, 250, 0.68);
      -webkit-backdrop-filter: blur(12px) saturate(150%);
      backdrop-filter: blur(12px) saturate(150%);
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    .admin-shell {
      max-width: 1320px;
    }

    .panel {
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.72);
      -webkit-backdrop-filter: blur(10px) saturate(130%);
      backdrop-filter: blur(10px) saturate(130%);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
      padding: 1rem;
    }

    .sub-card {
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.72);
      -webkit-backdrop-filter: blur(10px) saturate(130%);
      backdrop-filter: blur(10px) saturate(130%);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
      padding: 0.9rem;
    }

    .folder-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }

    .folder-card {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: rgba(255, 255, 255, 0.88);
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .folder-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
    }

    .folder-card .folder-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100px;
      background: linear-gradient(135deg, #e0e7ff 0%, #f0f4ff 100%);
      font-size: 2.5rem;
      color: #6366f1;
    }

    .folder-card .folder-info {
      padding: 0.6rem 0.8rem;
    }

    .folder-card .folder-name {
      font-weight: 700;
      font-size: 0.95rem;
      color: #334155;
    }

    .folder-card .folder-meta {
      font-size: 0.78rem;
      color: #64748b;
    }

    .folder-card .folder-desc {
      font-size: 0.78rem;
      color: #94a3b8;
      margin-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .folder-card .folder-path {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.72rem;
      color: #a5b4fc;
      margin-top: 2px;
    }

    .desc-editor {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.8rem;
    }

    .desc-editor input {
      flex: 1;
    }

    .desc-display {
      font-size: 0.88rem;
      color: #64748b;
      margin-bottom: 0.5rem;
    }

    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 0.8rem;
    }

    .image-card {
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(255, 255, 255, 0.9);
    }

    .image-card img {
      width: 100%;
      height: 140px;
      object-fit: cover;
      display: block;
      background: #f1f5f9;
    }

    .code-url {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.8rem;
      word-break: break-all;
    }

    .section-title {
      font-size: 1rem;
      font-weight: 700;
      color: #334155;
    }

    .empty-tip {
      color: #64748b;
      font-size: 0.9rem;
    }

    .drop-zone {
      border: 2px dashed #94a3b8;
      border-radius: 12px;
      padding: 2rem;
      text-align: center;
      color: #64748b;
      transition: border-color 0.2s, background 0.2s;
      cursor: pointer;
    }

    .drop-zone.drag-over {
      border-color: #6366f1;
      background: rgba(99, 102, 241, 0.06);
    }
  </style>
</head>
<body>
  <nav class="navbar navbar-expand-lg navbar-light acrylic-navbar">
    <div class="container admin-shell">
      <a class="navbar-brand" href="${basePath}/">MemesLuna</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavAdmin">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNavAdmin">
        <ul class="navbar-nav me-auto">
          <li class="nav-item"><a class="nav-link" href="${basePath}/">首页</a></li>
          <li class="nav-item"><a class="nav-link active" href="${basePath}/admin">管理</a></li>
          <li class="nav-item"><a class="nav-link" href="${basePath}/admin/endpoint">端点</a></li>
        </ul>
      </div>
    </div>
  </nav>

  <div class="container admin-shell mt-3 pb-4">
    <!-- View: folder list (main) -->
    <div id="view-folders">
      <div class="panel mb-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0">合集管理</h5>
          <div class="d-flex gap-2">
            <input id="new-collection-name" class="form-control form-control-sm" style="width:180px" placeholder="新合集名称" />
            <button id="create-collection" class="btn btn-sm btn-primary">创建</button>
          </div>
        </div>
        <div id="folder-grid" class="folder-grid"></div>
        <div id="folders-empty" class="empty-tip mt-2">暂无合集，请先创建</div>
      </div>
    </div>

    <!-- View: collection detail -->
    <div id="view-detail" style="display:none">
      <div class="panel mb-3">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="d-flex align-items-center gap-2">
            <button id="back-to-folders" class="btn btn-sm btn-outline-secondary"><i class="bi bi-arrow-left"></i> 返回</button>
            <h5 class="mb-0" id="detail-title"></h5>
          </div>
          <div class="d-flex gap-2">
            <button id="refresh-resources" class="btn btn-sm btn-outline-primary"><i class="bi bi-arrow-clockwise"></i> 刷新缓存</button>
            <button id="delete-collection" class="btn btn-sm btn-outline-danger">删除合集</button>
          </div>
        </div>
        <div id="detail-path" class="desc-display" style="font-family:monospace;color:#a5b4fc;font-size:0.82rem"></div>
        <div class="desc-editor">
          <input id="desc-input" class="form-control form-control-sm" placeholder="为这个合集添加描述，例如：千恋万花的丛雨表情包" />
          <button id="save-desc" class="btn btn-sm btn-outline-primary">保存描述</button>
        </div>

        <div class="row g-3 mb-3">
          <div class="col-md-6">
            <div class="sub-card h-100">
              <div class="section-title mb-2">上传图片</div>
              <div id="drop-zone" class="drop-zone mb-2">
                <i class="bi bi-cloud-arrow-up" style="font-size:1.5rem"></i>
                <div>拖放图片到此处，或点击选择文件</div>
                <input id="upload-files" type="file" class="d-none" multiple accept="image/*" />
              </div>
            </div>
          </div>
          <div class="col-md-6">
            <div class="sub-card h-100">
              <div class="section-title mb-2">添加外链</div>
              <textarea id="links-input" class="form-control mb-2" rows="3" placeholder="每行一个 http/https 链接"></textarea>
              <button id="add-links" class="btn btn-primary btn-sm w-100">添加外链</button>
            </div>
          </div>
        </div>

        <div class="sub-card mb-3">
          <div class="section-title mb-2">本地图片</div>
          <div id="images-grid" class="image-grid"></div>
          <div id="images-empty" class="empty-tip mt-2">暂无本地图片</div>
        </div>

        <div class="sub-card">
          <div class="section-title mb-2">外链列表</div>
          <div id="links-list" class="list-group"></div>
          <div id="links-empty" class="empty-tip mt-2">暂无外链</div>
        </div>
      </div>
    </div>

    <div id="admin-alert" class="alert mt-3 d-none"></div>
  </div>

  <script>
    const BASE_PATH = '${basePath}'
    const state = {
      collectionNames: [],
      collections: [],
      selectedCollection: '',
      images: [],
      links: [],
    }

    const byId = (id) => document.getElementById(id)

    function showAlert(message, type) {
      type = type || 'info'
      var el = byId('admin-alert')
      el.className = 'alert alert-' + type + ' mt-3'
      el.textContent = message
      el.classList.remove('d-none')
      setTimeout(function() { el.classList.add('d-none') }, 2200)
    }

    async function request(url, options) {
      options = options || {}
      var headers = Object.assign({}, options.headers || {})
      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }
      var res = await fetch(url, Object.assign({}, options, { headers: headers }))
      var data = null
      try { data = await res.json() } catch(e) { data = null }
      if (!res.ok) {
        throw new Error(data && data.error ? data.error : String(res.status) + ' ' + String(res.statusText))
      }
      return data
    }

    function readFileAsDataURL(file) {
      return new Promise(function(resolve, reject) {
        var reader = new FileReader()
        reader.onload = function() { resolve(reader.result) }
        reader.onerror = function() { reject(new Error('读取文件失败')) }
        reader.readAsDataURL(file)
      })
    }

    /* --- Folder list view --- */
    async function refreshState() {
      var data = await request(BASE_PATH + '/api/admin/state')
      state.collectionNames = Array.isArray(data.collectionNames) ? data.collectionNames : []
      state.collections = Array.isArray(data.collections) ? data.collections : []
      renderFolderGrid()
    }

    function renderFolderGrid() {
      var grid = byId('folder-grid')
      var empty = byId('folders-empty')
      grid.textContent = ''
      empty.style.display = state.collections.length ? 'none' : 'block'

      state.collections.forEach(function(col) {
        var card = document.createElement('div')
        card.className = 'folder-card'
        card.addEventListener('click', function() { enterCollection(col.name) })

        var icon = document.createElement('div')
        icon.className = 'folder-icon'
        icon.innerHTML = '<i class="bi bi-folder-fill"></i>'
        card.appendChild(icon)

        var info = document.createElement('div')
        info.className = 'folder-info'
        var nameEl = document.createElement('div')
        nameEl.className = 'folder-name'
        nameEl.textContent = col.name
        info.appendChild(nameEl)
        if (col.description) {
          var descEl = document.createElement('div')
          descEl.className = 'folder-desc'
          descEl.textContent = col.description
          descEl.title = col.description
          info.appendChild(descEl)
        }
        var pathEl = document.createElement('div')
        pathEl.className = 'folder-path'
        pathEl.textContent = BASE_PATH + '/' + col.name
        info.appendChild(pathEl)
        var meta = document.createElement('div')
        meta.className = 'folder-meta'
        meta.textContent = '本地 ' + (col.localCount || 0) + ' / 外链 ' + (col.linkCount || 0)
        info.appendChild(meta)
        card.appendChild(info)
        grid.appendChild(card)
      })
    }

    function enterCollection(name) {
      state.selectedCollection = name
      byId('view-folders').style.display = 'none'
      byId('view-detail').style.display = 'block'
      byId('detail-title').textContent = name
      byId('detail-path').textContent = '端点路径: ' + BASE_PATH + '/' + name
      var col = state.collections.find(function(c) { return c.name === name })
      byId('desc-input').value = (col && col.description) ? col.description : ''
      refreshCollectionResources()
    }

    function backToFolders() {
      state.selectedCollection = ''
      byId('view-detail').style.display = 'none'
      byId('view-folders').style.display = 'block'
      refreshState()
    }

    /* --- Detail view --- */
    async function refreshCollectionResources() {
      if (!state.selectedCollection) { state.images = []; state.links = []; renderImages(); renderLinks(); return }
      var data = await request(BASE_PATH + '/api/collections/' + encodeURIComponent(state.selectedCollection) + '/resources')
      state.images = Array.isArray(data.images) ? data.images : []
      state.links = Array.isArray(data.links) ? data.links : []
      renderImages()
      renderLinks()
    }

    function imagePreviewUrl(filename) {
      return BASE_PATH + '/api/admin/collections/' + encodeURIComponent(state.selectedCollection) + '/images/' + encodeURIComponent(filename)
    }

    function renderImages() {
      var grid = byId('images-grid')
      var empty = byId('images-empty')
      grid.textContent = ''
      empty.style.display = state.images.length ? 'none' : 'block'

      state.images.forEach(function(name) {
        var card = document.createElement('div')
        card.className = 'image-card'

        var img = document.createElement('img')
        img.src = imagePreviewUrl(name)
        img.alt = name
        card.appendChild(img)

        var body = document.createElement('div')
        body.className = 'p-2'
        var title = document.createElement('div')
        title.className = 'small text-truncate mb-2'
        title.textContent = name
        body.appendChild(title)

        var row = document.createElement('div')
        row.className = 'd-flex gap-1'

        var moveSelect = document.createElement('select')
        moveSelect.className = 'form-select form-select-sm'
        var others = state.collectionNames.filter(function(c) { return c !== state.selectedCollection })
        var ph = document.createElement('option')
        ph.value = ''
        ph.textContent = '移动到...'
        moveSelect.appendChild(ph)
        others.forEach(function(t) {
          var opt = document.createElement('option')
          opt.value = t; opt.textContent = t
          moveSelect.appendChild(opt)
        })

        var moveBtn = document.createElement('button')
        moveBtn.className = 'btn btn-sm btn-outline-primary'
        moveBtn.textContent = '移动'
        moveBtn.disabled = others.length === 0
        moveBtn.addEventListener('click', async function() {
          var tc = moveSelect.value
          if (!tc) return
          await request(
            BASE_PATH + '/api/admin/collections/' + encodeURIComponent(state.selectedCollection) + '/images/' + encodeURIComponent(name) + '/move',
            { method: 'POST', body: JSON.stringify({ targetCollection: tc }) }
          )
          showAlert('图片已移动', 'success')
          refreshCollectionResources()
        })

        var delBtn = document.createElement('button')
        delBtn.className = 'btn btn-sm btn-outline-danger'
        delBtn.textContent = '删除'
        delBtn.addEventListener('click', async function() {
          await request(
            BASE_PATH + '/api/admin/collections/' + encodeURIComponent(state.selectedCollection) + '/images/' + encodeURIComponent(name),
            { method: 'DELETE' }
          )
          showAlert('图片已删除', 'success')
          refreshCollectionResources()
        })

        row.appendChild(moveSelect)
        row.appendChild(moveBtn)
        row.appendChild(delBtn)
        body.appendChild(row)
        card.appendChild(body)
        grid.appendChild(card)
      })
    }

    function renderLinks() {
      var wrap = byId('links-list')
      var empty = byId('links-empty')
      wrap.textContent = ''
      empty.style.display = state.links.length ? 'none' : 'block'
      state.links.forEach(function(link) {
        var row = document.createElement('div')
        row.className = 'list-group-item d-flex justify-content-between align-items-center gap-2'

        var text = document.createElement('div')
        text.className = 'code-url flex-grow-1'
        text.textContent = link

        var actions = document.createElement('div')
        actions.className = 'd-flex gap-1'

        var openEl = document.createElement('a')
        openEl.className = 'btn btn-sm btn-outline-primary'
        openEl.textContent = '查看'
        openEl.href = link
        openEl.target = '_blank'

        var del = document.createElement('button')
        del.className = 'btn btn-sm btn-outline-danger'
        del.textContent = '删除'
        del.addEventListener('click', async function() {
          await request(
            BASE_PATH + '/api/admin/collections/' + encodeURIComponent(state.selectedCollection) + '/links',
            { method: 'DELETE', body: JSON.stringify({ link: link }) }
          )
          showAlert('外链已删除', 'success')
          refreshCollectionResources()
        })

        actions.appendChild(openEl)
        actions.appendChild(del)
        row.appendChild(text)
        row.appendChild(actions)
        wrap.appendChild(row)
      })
    }

    /* --- Upload with drag/drop --- */
    async function uploadFiles(files) {
      if (!state.selectedCollection || !files || !files.length) return
      var images = []
      for (var i = 0; i < files.length; i++) {
        var b64 = await readFileAsDataURL(files[i])
        images.push({ base64: b64, originalName: files[i].name })
      }
      await request(BASE_PATH + '/api/admin/collections/' + encodeURIComponent(state.selectedCollection) + '/images', {
        method: 'POST',
        body: JSON.stringify({ images: images }),
      })
      showAlert('图片上传成功', 'success')
      refreshCollectionResources()
    }

    var dropZone = byId('drop-zone')
    var fileInput = byId('upload-files')

    dropZone.addEventListener('click', function() { fileInput.click() })
    fileInput.addEventListener('change', function() { uploadFiles(fileInput.files); fileInput.value = '' })

    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('drag-over') })
    dropZone.addEventListener('dragleave', function(e) { e.preventDefault(); dropZone.classList.remove('drag-over') })
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault()
      dropZone.classList.remove('drag-over')
      if (e.dataTransfer && e.dataTransfer.files) uploadFiles(e.dataTransfer.files)
    })

    /* --- Buttons --- */
    byId('create-collection').addEventListener('click', async function() {
      var name = byId('new-collection-name').value.trim()
      if (!name) return
      await request(BASE_PATH + '/api/admin/collections', {
        method: 'POST',
        body: JSON.stringify({ name: name }),
      })
      byId('new-collection-name').value = ''
      showAlert('合集创建成功', 'success')
      refreshState()
    })

    byId('delete-collection').addEventListener('click', async function() {
      if (!state.selectedCollection) return
      if (!confirm('确定删除合集 ' + state.selectedCollection + ' ?')) return
      await request(BASE_PATH + '/api/admin/collections/' + encodeURIComponent(state.selectedCollection), {
        method: 'DELETE',
      })
      showAlert('合集已删除', 'success')
      backToFolders()
    })

    byId('back-to-folders').addEventListener('click', backToFolders)

    byId('save-desc').addEventListener('click', async function() {
      if (!state.selectedCollection) return
      var desc = byId('desc-input').value.trim()
      await request(BASE_PATH + '/api/admin/collections/' + encodeURIComponent(state.selectedCollection) + '/description', {
        method: 'PATCH',
        body: JSON.stringify({ description: desc }),
      })
      var col = state.collections.find(function(c) { return c.name === state.selectedCollection })
      if (col) col.description = desc
      showAlert('描述已保存', 'success')
    })

    byId('refresh-resources').addEventListener('click', function() {
      refreshCollectionResources()
      showAlert('已刷新', 'success')
    })

    byId('add-links').addEventListener('click', async function() {
      if (!state.selectedCollection) return
      var text = byId('links-input').value
      var lines = text.split(/\\r?\\n/g).map(function(l) { return l.trim() }).filter(Boolean)
      if (!lines.length) return
      await request(BASE_PATH + '/api/admin/collections/' + encodeURIComponent(state.selectedCollection) + '/links', {
        method: 'POST',
        body: JSON.stringify({ links: lines }),
      })
      byId('links-input').value = ''
      showAlert('外链添加成功', 'success')
      refreshCollectionResources()
    })

    refreshState().catch(function(error) {
      showAlert(error instanceof Error ? error.message : String(error), 'danger')
    })
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`
}

function buildAdminEndpointHtml(basePath: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>图床转发 - 302 端点管理</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.3/font/bootstrap-icons.css">
  <style>
    body {
      min-height: 100vh;
      margin: 0;
      color: #1f2937;
      background-color: #f4f6fb;
      background-image: url('/project_bg/default_background.jpg');
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      background-attachment: fixed;
    }

    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-color: rgba(255, 255, 255, 0.78);
      z-index: -1;
    }

    .acrylic-navbar {
      background-color: rgba(248, 249, 250, 0.68);
      -webkit-backdrop-filter: blur(12px) saturate(150%);
      backdrop-filter: blur(12px) saturate(150%);
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    .layout-shell {
      max-width: 1320px;
    }

    .panel {
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.72);
      -webkit-backdrop-filter: blur(10px) saturate(130%);
      backdrop-filter: blur(10px) saturate(130%);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
      padding: 1rem;
    }

    .sidebar-panel {
      position: sticky;
      top: 1rem;
    }

    .code-text {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 0.8rem;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <nav class="navbar navbar-expand-lg navbar-light acrylic-navbar">
    <div class="container layout-shell">
      <a class="navbar-brand" href="${basePath}/">MemesLuna</a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNavEndpoint">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNavEndpoint">
        <ul class="navbar-nav me-auto">
          <li class="nav-item"><a class="nav-link" href="${basePath}/">首页</a></li>
          <li class="nav-item"><a class="nav-link" href="${basePath}/admin">管理</a></li>
          <li class="nav-item"><a class="nav-link active" href="${basePath}/admin/endpoint">端点</a></li>
        </ul>
      </div>
    </div>
  </nav>

  <div class="container layout-shell mt-3 pb-4">
    <div class="row g-3">
      <div class="col-lg-3">
        <div class="panel sidebar-panel">
          <h5 class="mb-3">添加 / 编辑端点</h5>
          <input id="endpoint-name" class="form-control mb-2" placeholder="端点名称" />
          <input id="endpoint-description" class="form-control mb-2" placeholder="描述" />
          <input id="endpoint-url" class="form-control mb-2" placeholder="目标 URL" />

          <div class="d-grid gap-2 mt-3">
            <button id="save-endpoint" class="btn btn-primary">创建</button>
            <button id="reset-endpoint" class="btn btn-outline-secondary">清空</button>
          </div>
        </div>
      </div>

      <div class="col-lg-9">
        <div class="panel">
          <h4 class="mb-3">302 跳转端点管理</h4>
          <p class="text-muted mb-3">通过 <code>${basePath}/端点名称</code> 访问，自动 302 跳转到目标 URL。</p>

          <div class="table-responsive">
            <table class="table table-sm align-middle">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>描述</th>
                  <th>目标 URL</th>
                  <th>访问</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="endpoint-table"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div id="endpoint-alert" class="alert mt-3 d-none"></div>
  </div>

  <script>
    var BASE_PATH = '${basePath}'
    var endpointState = {
      endpoints: [],
      editingName: '',
    }

    var byId = function(id) { return document.getElementById(id) }

    function showAlert(message, type) {
      type = type || 'info'
      var el = byId('endpoint-alert')
      el.className = 'alert alert-' + type + ' mt-3'
      el.textContent = message
      el.classList.remove('d-none')
      setTimeout(function() { el.classList.add('d-none') }, 2400)
    }

    async function request(url, options) {
      options = options || {}
      var headers = Object.assign({}, options.headers || {})
      if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }
      var res = await fetch(url, Object.assign({}, options, { headers: headers }))
      var data = null
      try { data = await res.json() } catch(e) { data = null }
      if (!res.ok) {
        throw new Error(data && data.error ? data.error : String(res.status) + ' ' + String(res.statusText))
      }
      return data
    }

    function resetForm() {
      endpointState.editingName = ''
      byId('endpoint-name').value = ''
      byId('endpoint-description').value = ''
      byId('endpoint-url').value = ''
      byId('save-endpoint').textContent = '创建'
      byId('endpoint-name').disabled = false
    }

    function fillForm(item) {
      endpointState.editingName = item.name || ''
      byId('endpoint-name').value = item.name || ''
      byId('endpoint-description').value = item.description || ''
      byId('endpoint-url').value = item.url || ''
      byId('save-endpoint').textContent = '更新'
      byId('endpoint-name').disabled = true
    }

    function renderTable() {
      var body = byId('endpoint-table')
      body.textContent = ''

      if (!endpointState.endpoints.length) {
        var tr = document.createElement('tr')
        var td = document.createElement('td')
        td.colSpan = 5
        td.className = 'text-muted'
        td.textContent = '暂无端点'
        tr.appendChild(td)
        body.appendChild(tr)
        return
      }

      endpointState.endpoints.forEach(function(item) {
        var tr = document.createElement('tr')
        var visitUrl = BASE_PATH + '/' + encodeURIComponent(item.name || '')

        tr.innerHTML =
          '<td class="code-text"></td>' +
          '<td></td>' +
          '<td class="code-text"></td>' +
          '<td></td>' +
          '<td></td>'

        tr.children[0].textContent = item.name || ''
        tr.children[1].textContent = item.description || '-'
        tr.children[2].textContent = item.url || ''

        var visitLink = document.createElement('a')
        visitLink.href = visitUrl
        visitLink.target = '_blank'
        visitLink.className = 'btn btn-sm btn-outline-secondary'
        visitLink.innerHTML = '<i class="bi bi-box-arrow-up-right"></i>'
        tr.children[3].appendChild(visitLink)

        var actionWrap = document.createElement('div')
        actionWrap.className = 'd-flex gap-1 justify-content-end'

        var editBtn = document.createElement('button')
        editBtn.className = 'btn btn-sm btn-outline-primary'
        editBtn.textContent = '编辑'
        editBtn.addEventListener('click', function() { fillForm(item) })

        var delBtn = document.createElement('button')
        delBtn.className = 'btn btn-sm btn-outline-danger'
        delBtn.textContent = '删除'
        delBtn.addEventListener('click', async function() {
          await request(BASE_PATH + '/api/admin/endpoints/' + encodeURIComponent(item.name || ''), {
            method: 'DELETE',
          })
          showAlert('端点已删除', 'success')
          await loadEndpoints()
          if (endpointState.editingName === item.name) resetForm()
        })

        actionWrap.appendChild(editBtn)
        actionWrap.appendChild(delBtn)
        tr.children[4].appendChild(actionWrap)
        body.appendChild(tr)
      })
    }

    async function loadEndpoints() {
      var data = await request(BASE_PATH + '/api/admin/endpoints')
      endpointState.endpoints = Array.isArray(data.endpoints) ? data.endpoints : []
      renderTable()
    }

    byId('save-endpoint').addEventListener('click', async function() {
      var name = byId('endpoint-name').value.trim()
      var url = byId('endpoint-url').value.trim()
      if (!name || !url) {
        showAlert('名称与目标 URL 必填', 'warning')
        return
      }

      var payload = {
        name: name,
        description: byId('endpoint-description').value.trim(),
        url: url,
        method: 'redirect',
        urlConstruction: 'normal',
        modelName: '',
        queryParams: [],
        proxySettings: { fallbackAction: 'returnJson' },
      }

      if (endpointState.editingName) {
        await request(BASE_PATH + '/api/admin/endpoints/' + encodeURIComponent(endpointState.editingName), {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
        showAlert('端点更新成功', 'success')
      } else {
        await request(BASE_PATH + '/api/admin/endpoints', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
        showAlert('端点创建成功', 'success')
      }

      await loadEndpoints()
      resetForm()
    })

    byId('reset-endpoint').addEventListener('click', resetForm)

    loadEndpoints().catch(function(error) {
      showAlert(error instanceof Error ? error.message : String(error), 'danger')
    })
  </script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>`
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
  if (!ctx.console) return

  const consoleService = ctx.console as any
  const packageBase = path.resolve(ctx.baseDir, 'node_modules/koishi-plugin-memesluna')
  const withReady = <T extends unknown[], R>(handler: (...args: T) => Promise<R> | R) => {
    return async (...args: T): Promise<R> => {
      await service.ready
      return await handler(...args)
    }
  }

  consoleService.addEntry({
    dev: path.resolve(packageBase, 'client/index.ts'),
    prod: path.resolve(packageBase, 'dist'),
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
    koa.status = 200
    koa.set('Content-Type', 'text/html; charset=utf-8')
    koa.body = buildAdminHtml(basePath)
  })

  ctx.server.get(`${basePath}/admin/endpoint`, async (koa) => {
    koa.status = 200
    koa.set('Content-Type', 'text/html; charset=utf-8')
    koa.body = buildAdminEndpointHtml(basePath)
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
    koa.status = 200
    koa.set('Content-Type', 'text/html; charset=utf-8')
    koa.body = buildHomepageHtml(basePath)
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
