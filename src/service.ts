import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { Context, Service } from 'koishi'
import type {
  ForwardMethod,
  ProxySettings,
  QueryParamConfig,
  UrlConstruction,
  Config,
} from './config'

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.bmp',
  '.webp',
  '.svg',
  '.tif',
  '.tiff',
  '.avif',
  '.psd',
])

const COLLECTION_NAME_REGEXP = /^[a-zA-Z0-9_-]+$/
const ENDPOINT_NAME_REGEXP = /^[a-zA-Z0-9_-]+$/

export interface ApiEndpoint {
  id: string
  name: string
  group: string
  description: string
  url: string
  method: ForwardMethod
  urlConstruction: UrlConstruction
  modelName: string
  queryParams: QueryParamConfig[]
  proxySettings: ProxySettings
  createdAt: Date
  updatedAt: Date
}

export interface ApiEndpointInput {
  name: string
  group?: string
  description?: string
  url: string
  method: ForwardMethod
  urlConstruction?: UrlConstruction
  modelName?: string
  queryParams?: QueryParamConfig[]
  proxySettings?: ProxySettings
}

export interface CollectionInfo {
  name: string
  totalCount: number
  localCount: number
  linkCount: number
  hasContent: boolean
  cover?: string
}

export interface CollectionResource {
  type: 'local' | 'external'
  value: string
}

interface MemesLunaEndpointRow {
  id: string
  name: string
  group: string
  description: string
  url: string
  method: string
  url_construction: string
  model_name: string
  query_params: string
  proxy_settings: string
  created_at: Date
  updated_at: Date
}

export class MemesLunaService extends Service {
  private _readyPromise: Promise<void>
  private _readyResolve: () => void

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'memesluna', true)
    this.defineDatabase()

    this._readyPromise = new Promise((resolve) => {
      this._readyResolve = resolve
    })

    ctx.on('ready', async () => {
      await this.ensureStorage()
      this._readyResolve()
    })
  }

  static inject = ['database']

  get ready() {
    return this._readyPromise
  }

  private defineDatabase() {
    this.ctx.database.extend(
      'memesluna_endpoints',
      {
        id: 'string',
        name: 'string',
        group: 'string',
        description: 'string',
        url: 'string',
        method: 'string',
        url_construction: 'string',
        model_name: 'string',
        query_params: 'string',
        proxy_settings: 'string',
        created_at: 'timestamp',
        updated_at: 'timestamp',
      },
      {
        primary: 'id',
        unique: ['name'],
      }
    )
  }

  private getStorageRoot() {
    return path.resolve(this.ctx.baseDir, this.config.storagePath)
  }

  private async ensureStorage() {
    await fs.mkdir(this.getStorageRoot(), { recursive: true })
  }

  private ensureCollectionName(name: string) {
    if (!name || !COLLECTION_NAME_REGEXP.test(name)) {
      throw new Error('Invalid collection name: only letters, numbers, _ and - are allowed.')
    }
  }

  private ensureEndpointName(name: string) {
    if (!name || !ENDPOINT_NAME_REGEXP.test(name)) {
      throw new Error('Invalid endpoint name: only letters, numbers, _ and - are allowed.')
    }
  }

  private getCollectionDir(collectionName: string) {
    return path.join(this.getStorageRoot(), collectionName)
  }

  private getCollectionLinksFile(collectionName: string) {
    return path.join(this.getCollectionDir(collectionName), `${collectionName}.txt`)
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    const dir = this.getCollectionDir(collectionName)
    try {
      const stat = await fs.stat(dir)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  async getCollections(): Promise<string[]> {
    const root = this.getStorageRoot()
    try {
      const entries = await fs.readdir(root, { withFileTypes: true })
      return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
    } catch {
      return []
    }
  }

  async createCollection(collectionName: string): Promise<boolean> {
    this.ensureCollectionName(collectionName)
    const dir = this.getCollectionDir(collectionName)
    try {
      await fs.mkdir(dir)
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return false
      }
      throw error
    }
  }

  async deleteCollection(collectionName: string): Promise<boolean> {
    this.ensureCollectionName(collectionName)
    const dir = this.getCollectionDir(collectionName)
    try {
      await fs.rm(dir, { recursive: true, force: true })
      return true
    } catch {
      return false
    }
  }

  private isImageFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase()
    return IMAGE_EXTENSIONS.has(ext)
  }

  private ensureSafeImageFilename(filename: string): string {
    const normalized = path.basename(filename || '')
    if (!filename || normalized !== filename || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid image filename')
    }
    if (!this.isImageFile(normalized)) {
      throw new Error('Invalid image filename')
    }
    return normalized
  }

  private getMimeByFilename(filename: string): string {
    const ext = path.extname(filename).toLowerCase()
    if (ext === '.png') return 'image/png'
    if (ext === '.gif') return 'image/gif'
    if (ext === '.webp') return 'image/webp'
    if (ext === '.bmp') return 'image/bmp'
    if (ext === '.svg') return 'image/svg+xml'
    if (ext === '.avif') return 'image/avif'
    if (ext === '.tif' || ext === '.tiff') return 'image/tiff'
    return 'image/jpeg'
  }

  private resolveLocalImagePath(collectionName: string, filename: string): string {
    const safeName = this.ensureSafeImageFilename(filename)
    return path.join(this.getCollectionDir(collectionName), safeName)
  }

  async getLocalImageBuffer(
    collectionName: string,
    filename: string
  ): Promise<{ buffer: Buffer; mime: string } | null> {
    if (!(await this.collectionExists(collectionName))) {
      return null
    }

    let fullPath: string
    try {
      fullPath = this.resolveLocalImagePath(collectionName, filename)
    } catch {
      return null
    }

    try {
      const buffer = await fs.readFile(fullPath)
      return {
        buffer,
        mime: this.getMimeByFilename(fullPath),
      }
    } catch {
      return null
    }
  }

  async getCollectionImages(collectionName: string): Promise<string[]> {
    if (!(await this.collectionExists(collectionName))) {
      return []
    }

    const dir = this.getCollectionDir(collectionName)
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && this.isImageFile(entry.name))
      .map((entry) => entry.name)
      .sort()
  }

  async getCollectionLinks(collectionName: string): Promise<string[]> {
    if (!(await this.collectionExists(collectionName))) {
      return []
    }

    const linksPath = this.getCollectionLinksFile(collectionName)
    try {
      const text = await fs.readFile(linksPath, 'utf8')
      return text
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter((line) => line.startsWith('http://') || line.startsWith('https://'))
    } catch {
      return []
    }
  }

  async addLinksToCollection(collectionName: string, links: string[]): Promise<number> {
    if (!(await this.collectionExists(collectionName))) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    const normalized = links
      .map((link) => link.trim())
      .filter((link) => link.startsWith('http://') || link.startsWith('https://'))

    if (!normalized.length) {
      return 0
    }

    const current = await this.getCollectionLinks(collectionName)
    const merged = [...current]
    for (const link of normalized) {
      if (!merged.includes(link)) {
        merged.push(link)
      }
    }

    const linksPath = this.getCollectionLinksFile(collectionName)
    await fs.writeFile(linksPath, `${merged.join('\n')}${merged.length ? '\n' : ''}`, 'utf8')
    return merged.length - current.length
  }

  async removeLinkFromCollection(collectionName: string, link: string): Promise<boolean> {
    if (!(await this.collectionExists(collectionName))) {
      return false
    }

    const current = await this.getCollectionLinks(collectionName)
    const next = current.filter((item) => item !== link)
    if (next.length === current.length) {
      return false
    }

    const linksPath = this.getCollectionLinksFile(collectionName)
    await fs.writeFile(linksPath, `${next.join('\n')}${next.length ? '\n' : ''}`, 'utf8')
    return true
  }

  private detectExtFromDataUrl(dataUrl: string): string {
    const matched = /^data:image\/([a-zA-Z0-9+.-]+);base64,/i.exec(dataUrl)
    const ext = matched?.[1]?.toLowerCase()
    if (!ext) return 'png'
    if (ext === 'jpeg') return 'jpg'
    return ext
  }

  private normalizeBase64(input: string): { base64: string; extHint?: string } {
    const trimmed = input.trim()
    if (trimmed.startsWith('data:')) {
      const extHint = this.detectExtFromDataUrl(trimmed)
      const index = trimmed.indexOf(',')
      return {
        base64: index >= 0 ? trimmed.slice(index + 1) : trimmed,
        extHint,
      }
    }
    return { base64: trimmed }
  }

  private buildSafeFilename(originalName: string | undefined, extHint: string | undefined): string {
    const fallbackName = `${Date.now()}-${Math.floor(Math.random() * 10000)}`
    const src = (originalName ?? fallbackName).trim()
    const parsed = path.parse(src)
    const sanitizedBase = (parsed.name || fallbackName).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)

    const rawExt = (parsed.ext || (extHint ? `.${extHint}` : '') || '.png').toLowerCase()
    const normalizedExt = rawExt === '.jpeg' ? '.jpg' : rawExt
    const finalExt = IMAGE_EXTENSIONS.has(normalizedExt) ? normalizedExt : '.png'

    return `${sanitizedBase}${finalExt}`
  }

  private async deduplicateFilename(collectionDir: string, filename: string): Promise<string> {
    const parsed = path.parse(filename)
    let counter = 1
    let candidate = filename

    while (true) {
      try {
        await fs.access(path.join(collectionDir, candidate))
        candidate = `${parsed.name}_${counter}${parsed.ext}`
        counter++
      } catch {
        return candidate
      }
    }
  }

  async addLocalImageBase64(
    collectionName: string,
    base64Data: string,
    originalName?: string
  ): Promise<string> {
    if (!(await this.collectionExists(collectionName))) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    const { base64, extHint } = this.normalizeBase64(base64Data)
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) {
      throw new Error('Invalid image base64 payload')
    }

    const dir = this.getCollectionDir(collectionName)
    const initialName = this.buildSafeFilename(originalName, extHint)
    const finalName = await this.deduplicateFilename(dir, initialName)
    await fs.writeFile(path.join(dir, finalName), buffer)
    return finalName
  }

  async deleteImageFromCollection(collectionName: string, filename: string): Promise<boolean> {
    if (!(await this.collectionExists(collectionName))) {
      return false
    }

    let safeName: string
    try {
      safeName = this.ensureSafeImageFilename(filename)
    } catch {
      return false
    }

    const fullPath = path.join(this.getCollectionDir(collectionName), safeName)
    try {
      await fs.unlink(fullPath)
      return true
    } catch {
      return false
    }
  }

  async moveImageToCollection(
    sourceCollection: string,
    targetCollection: string,
    filename: string
  ): Promise<string | null> {
    if (!(await this.collectionExists(sourceCollection)) || !(await this.collectionExists(targetCollection))) {
      return null
    }

    let safeName: string
    try {
      safeName = this.ensureSafeImageFilename(filename)
    } catch {
      return null
    }

    const sourcePath = path.join(this.getCollectionDir(sourceCollection), safeName)
    const targetDir = this.getCollectionDir(targetCollection)
    const targetName = await this.deduplicateFilename(targetDir, safeName)
    const targetPath = path.join(targetDir, targetName)

    try {
      await fs.rename(sourcePath, targetPath)
      return targetName
    } catch {
      return null
    }
  }

  async getCollectionInfo(collectionName: string): Promise<CollectionInfo | null> {
    if (!(await this.collectionExists(collectionName))) {
      return null
    }

    const localImages = await this.getCollectionImages(collectionName)
    const links = await this.getCollectionLinks(collectionName)

    return {
      name: collectionName,
      localCount: localImages.length,
      linkCount: links.length,
      totalCount: localImages.length + links.length,
      hasContent: localImages.length > 0 || links.length > 0,
      cover: localImages[0],
    }
  }

  async getRandomResource(collectionName: string): Promise<CollectionResource | null> {
    if (!(await this.collectionExists(collectionName))) {
      return null
    }

    const localImages = await this.getCollectionImages(collectionName)
    const links = await this.getCollectionLinks(collectionName)
    const pool: CollectionResource[] = [
      ...localImages.map((name) => ({
        type: 'local' as const,
        value: path.join(this.getCollectionDir(collectionName), name),
      })),
      ...links.map((link) => ({ type: 'external' as const, value: link })),
    ]

    if (!pool.length) {
      return null
    }

    return pool[Math.floor(Math.random() * pool.length)]
  }

  private parseJsonField<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback
    try {
      return JSON.parse(value) as T
    } catch {
      return fallback
    }
  }

  private mapEndpoint(row: MemesLunaEndpointRow): ApiEndpoint {
    return {
      id: row.id,
      name: row.name,
      group: row.group || '默认分组',
      description: row.description || '',
      url: row.url,
      method: (row.method as ForwardMethod) || 'redirect',
      urlConstruction: (row.url_construction as UrlConstruction) || 'normal',
      modelName: row.model_name || '',
      queryParams: this.parseJsonField<QueryParamConfig[]>(row.query_params, []),
      proxySettings: this.parseJsonField<ProxySettings>(row.proxy_settings, {
        fallbackAction: 'returnJson',
      }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  async getEndpoints(): Promise<ApiEndpoint[]> {
    const rows = await this.ctx.database.get('memesluna_endpoints', {})
    return rows.map((row) => this.mapEndpoint(row)).sort((a, b) => a.name.localeCompare(b.name))
  }

  async getEndpointByName(name: string): Promise<ApiEndpoint | null> {
    const rows = await this.ctx.database.get('memesluna_endpoints', { name })
    if (!rows.length) return null
    return this.mapEndpoint(rows[0])
  }

  async addEndpoint(input: ApiEndpointInput): Promise<string> {
    this.ensureEndpointName(input.name)
    if (!input.url) {
      throw new Error('Endpoint URL is required.')
    }

    const id = randomUUID()
    const now = new Date()
    await this.ctx.database.create('memesluna_endpoints', {
      id,
      name: input.name,
      group: input.group || '默认分组',
      description: input.description || '',
      url: input.url,
      method: input.method || 'redirect',
      url_construction: input.urlConstruction || 'normal',
      model_name: input.modelName || '',
      query_params: JSON.stringify(input.queryParams || []),
      proxy_settings: JSON.stringify({
        fallbackAction: 'returnJson',
        ...(input.proxySettings || {}),
      }),
      created_at: now,
      updated_at: now,
    })
    return id
  }

  async updateEndpoint(name: string, input: Partial<ApiEndpointInput>): Promise<boolean> {
    const current = await this.getEndpointByName(name)
    if (!current) {
      return false
    }

    const payload: Partial<MemesLunaEndpointRow> = {
      updated_at: new Date(),
    }

    if (input.group !== undefined) payload.group = input.group || '默认分组'
    if (input.description !== undefined) payload.description = input.description || ''
    if (input.url !== undefined) payload.url = input.url
    if (input.method !== undefined) payload.method = input.method
    if (input.urlConstruction !== undefined) payload.url_construction = input.urlConstruction
    if (input.modelName !== undefined) payload.model_name = input.modelName
    if (input.queryParams !== undefined) payload.query_params = JSON.stringify(input.queryParams)
    if (input.proxySettings !== undefined) payload.proxy_settings = JSON.stringify(input.proxySettings)

    await this.ctx.database.set('memesluna_endpoints', { name }, payload)
    return true
  }

  async deleteEndpoint(name: string): Promise<boolean> {
    const before = await this.ctx.database.get('memesluna_endpoints', { name })
    if (!before.length) {
      return false
    }
    await this.ctx.database.remove('memesluna_endpoints', { name })
    return true
  }

  async buildRouteInventory(backendPath: string): Promise<string> {
    const endpoints = await this.getEndpoints()
    const collections = await this.getCollections()

    const lines: string[] = []

    for (const endpoint of endpoints) {
      const queryPart = endpoint.queryParams
        .filter((param) => param.required)
        .map((param) => `${param.name}=<${param.name}>`)
        .join('&')
      const suffix = queryPart ? `?${queryPart}` : ''
      const desc = endpoint.description || endpoint.group || endpoint.name
      lines.push(`- ${desc}: ${backendPath}/${endpoint.name}${suffix}`)
    }

    for (const collection of collections) {
      const info = await this.getCollectionInfo(collection)
      if (info?.hasContent) {
        lines.push(`- 集合 ${collection}: ${backendPath}/${collection}`)
      }
    }

    return lines.join('\n')
  }
}

declare module 'koishi' {
  interface Context {
    memesluna: MemesLunaService
  }

  interface Tables {
    memesluna_endpoints: {
      id: string
      name: string
      group: string
      description: string
      url: string
      method: string
      url_construction: string
      model_name: string
      query_params: string
      proxy_settings: string
      created_at: Date
      updated_at: Date
    }
  }
}
