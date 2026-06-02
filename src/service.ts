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
  '.psd',
])

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

export function isReservedPath(name: string): boolean {
  return RESERVED_PATHS.has(name) || name.includes('.')
}

const COLLECTION_NAME_REGEXP = /^[^\/\\?%*:|"<>.]+$/
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
  description: string
  totalCount: number
  localCount: number
  linkCount: number
  hasContent: boolean
  cover?: string
}

export interface CollectionResource {
  type: 'local' | 'external' | 'storage'
  filename?: string
  value: string
  public_url?: string
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

    this.ctx.database.extend(
      'memesluna_images',
      {
        id: 'string',
        collection: 'string',
        index: 'integer',
        filename: 'string',
        type: 'string',
        value: 'string',
        public_url: 'string',
        mime: 'string',
        created_at: 'timestamp',
      },
      {
        primary: 'id',
        unique: [['collection', 'index']],
      }
    )
  }

  private getStorageRoot() {
    return path.resolve(this.ctx.baseDir, this.config.storagePath || 'data/memesluna')
  }

  private getStorageBackend() {
    if (this.ctx.chatluna_storage && (this.ctx.chatluna_storage as any).storageBackend) {
      return (this.ctx.chatluna_storage as any).storageBackend
    }
    return null
  }

  private async syncExistingFilesToDatabase() {
    const root = this.getStorageRoot()
    let folders: string[] = []
    try {
      const entries = await fs.readdir(root, { withFileTypes: true })
      folders = entries.filter((e) => e.isDirectory() && this.isValidCollectionName(e.name)).map((e) => e.name)
    } catch {
      return
    }

    for (const colName of folders) {
      const colDir = this.getCollectionDir(colName)
      let files: string[] = []
      try {
        const entries = await fs.readdir(colDir, { withFileTypes: true })
        files = entries.filter((e) => e.isFile() && this.isImageFile(e.name)).map((e) => e.name)
      } catch {
        continue
      }

      // Sync local files
      for (const filename of files) {
        const ext = path.extname(filename).toLowerCase()
        const basename = path.basename(filename, ext)
        let index = parseInt(basename, 10)

        // Check if filename is not pure sequential number
        if (isNaN(index) || String(index) !== basename || index < 1 || index > 99999) {
          const maxImg = await this.ctx.database.get('memesluna_images', { collection: colName }, { limit: 1, sort: { index: 'desc' } })
          index = maxImg.length ? maxImg[0].index + 1 : 1
          const newFilename = `${index}${ext}`
          const oldPath = path.join(colDir, filename)
          const newPath = path.join(colDir, newFilename)
          try {
            await fs.rename(oldPath, newPath)
            await this.ctx.database.create('memesluna_images', {
              id: randomUUID(),
              collection: colName,
              index,
              filename: newFilename,
              type: 'local',
              value: newFilename,
              mime: this.getMimeByFilename(newFilename),
              created_at: new Date(),
            })
          } catch {}
        } else {
          // Check if already registered
          const existing = await this.ctx.database.get('memesluna_images', { collection: colName, index })
          if (!existing.length) {
            await this.ctx.database.create('memesluna_images', {
              id: randomUUID(),
              collection: colName,
              index,
              filename,
              type: 'local',
              value: filename,
              mime: this.getMimeByFilename(filename),
              created_at: new Date(),
            })
          }
        }
      }

      // Sync links file
      const linksFile = this.getCollectionLinksFile(colName)
      try {
        const text = await fs.readFile(linksFile, 'utf8')
        const links = text
          .split(/\r?\n/g)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('http://') || line.startsWith('https://'))

        for (const link of links) {
          const existing = await this.ctx.database.get('memesluna_images', { collection: colName, value: link, type: 'external' })
          if (!existing.length) {
            const maxImg = await this.ctx.database.get('memesluna_images', { collection: colName }, { limit: 1, sort: { index: 'desc' } })
            const index = maxImg.length ? maxImg[0].index + 1 : 1
            await this.ctx.database.create('memesluna_images', {
              id: randomUUID(),
              collection: colName,
              index,
              filename: `link_${index}`,
              type: 'external',
              value: link,
              mime: 'image/jpeg',
              created_at: new Date(),
            })
          }
        }
        // Cleanup migrated links file so we don't scan it repeatedly
        await fs.rm(linksFile, { force: true })
      } catch {}
    }
  }

  private async ensureStorage() {
    await fs.mkdir(this.getStorageRoot(), { recursive: true })
    await this.syncExistingFilesToDatabase()
  }

  private isValidCollectionName(name: string): boolean {
    return !!name && COLLECTION_NAME_REGEXP.test(name) && !isReservedPath(name)
  }

  private ensureCollectionName(name: string) {
    if (!this.isValidCollectionName(name)) {
      throw new Error('Invalid collection name: only letters, numbers, _ and - are allowed.')
    }
  }

  private ensureEndpointName(name: string) {
    if (!name || !ENDPOINT_NAME_REGEXP.test(name)) {
      throw new Error('Invalid endpoint name: only letters, numbers, _ and - are allowed.')
    }
    if (isReservedPath(name)) {
      throw new Error('Endpoint name is a reserved path.')
    }
  }

  private getCollectionDir(collectionName: string) {
    return path.join(this.getStorageRoot(), collectionName)
  }

  private getCollectionLinksFile(collectionName: string) {
    return path.join(this.getCollectionDir(collectionName), `${collectionName}.txt`)
  }

  private getCollectionDescriptionFile(collectionName: string) {
    return path.join(this.getCollectionDir(collectionName), '.description')
  }

  async getCollectionDescription(collectionName: string): Promise<string> {
    if (!this.isValidCollectionName(collectionName)) {
      return ''
    }
    try {
      return (await fs.readFile(this.getCollectionDescriptionFile(collectionName), 'utf8')).trim()
    } catch {
      return ''
    }
  }

  async setCollectionDescription(collectionName: string, description: string): Promise<boolean> {
    this.ensureCollectionName(collectionName)
    if (!(await this.collectionExists(collectionName))) {
      return false
    }
    await fs.writeFile(this.getCollectionDescriptionFile(collectionName), description.trim(), 'utf8')
    return true
  }

  async collectionExists(collectionName: string): Promise<boolean> {
    if (!this.isValidCollectionName(collectionName)) {
      return false
    }
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
      return entries
        .filter((e) => e.isDirectory() && this.isValidCollectionName(e.name))
        .map((e) => e.name)
        .sort()
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

    const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName, filename })
    if (!rows.length) {
      return null
    }

    const image = rows[0]
    if (image.type === 'storage') {
      const backend = this.getStorageBackend()
      if (backend) {
        try {
          const buffer = await backend.download(image.value)
          return { buffer, mime: image.mime }
        } catch {
          return null
        }
      }
    }

    if (image.type === 'external') {
      try {
        const buffer = await this.ctx.http.get<ArrayBuffer>(image.value, { responseType: 'arraybuffer' })
        return { buffer: Buffer.from(buffer), mime: image.mime }
      } catch {
        return null
      }
    }

    // local
    let fullPath: string
    try {
      fullPath = this.resolveLocalImagePath(collectionName, image.value)
    } catch {
      return null
    }

    try {
      const buffer = await fs.readFile(fullPath)
      return {
        buffer,
        mime: image.mime,
      }
    } catch {
      return null
    }
  }

  async getCollectionImages(collectionName: string): Promise<string[]> {
    if (!this.isValidCollectionName(collectionName)) {
      return []
    }
    if (!(await this.collectionExists(collectionName))) {
      return []
    }

    const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName, type: ['local', 'storage'] })
    return rows.map((img) => img.filename).sort()
  }

  async getCollectionLinks(collectionName: string): Promise<string[]> {
    if (!this.isValidCollectionName(collectionName)) {
      return []
    }
    if (!(await this.collectionExists(collectionName))) {
      return []
    }

    const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName, type: 'external' })
    return rows.map((img) => img.value)
  }

  async addLinksToCollection(collectionName: string, links: string[]): Promise<number> {
    this.ensureCollectionName(collectionName)
    if (!(await this.collectionExists(collectionName))) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    const normalized = links
      .map((link) => link.trim())
      .filter((link) => link.startsWith('http://') || link.startsWith('https://'))

    if (!normalized.length) {
      return 0
    }

    let addedCount = 0
    for (const link of normalized) {
      const existing = await this.ctx.database.get('memesluna_images', { collection: collectionName, value: link, type: 'external' })
      if (!existing.length) {
        const maxImg = await this.ctx.database.get('memesluna_images', { collection: collectionName }, { limit: 1, sort: { index: 'desc' } })
        const index = maxImg.length ? maxImg[0].index + 1 : 1
        await this.ctx.database.create('memesluna_images', {
          id: randomUUID(),
          collection: collectionName,
          index,
          filename: `link_${index}`,
          type: 'external',
          value: link,
          mime: 'image/jpeg',
          created_at: new Date(),
        })
        addedCount++
      }
    }
    return addedCount
  }

  async removeLinkFromCollection(collectionName: string, link: string): Promise<boolean> {
    this.ensureCollectionName(collectionName)
    if (!(await this.collectionExists(collectionName))) {
      return false
    }

    const existing = await this.ctx.database.get('memesluna_images', { collection: collectionName, value: link, type: 'external' })
    if (!existing.length) {
      return false
    }

    await this.ctx.database.remove('memesluna_images', { collection: collectionName, value: link, type: 'external' })
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
    const numericName = `${Date.now()}${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
    const src = (originalName ?? '').trim()
    const parsed = path.parse(src)
    const rawExt = (parsed.ext || (extHint ? `.${extHint}` : '') || '.png').toLowerCase()
    const normalizedExt = rawExt === '.jpeg' ? '.jpg' : rawExt
    const finalExt = IMAGE_EXTENSIONS.has(normalizedExt) ? normalizedExt : '.png'

    return `${numericName}${finalExt}`
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
    this.ensureCollectionName(collectionName)
    if (!(await this.collectionExists(collectionName))) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    const { base64, extHint } = this.normalizeBase64(base64Data)
    const buffer = Buffer.from(base64, 'base64')
    if (!buffer.length) {
      throw new Error('Invalid image base64 payload')
    }

    // Determine the next index
    const maxImg = await this.ctx.database.get('memesluna_images', { collection: collectionName }, { limit: 1, sort: { index: 'desc' } })
    const index = maxImg.length ? maxImg[0].index + 1 : 1

    const rawExt = (path.parse(originalName ?? '').ext || (extHint ? `.${extHint}` : '') || '.png').toLowerCase()
    const finalExt = rawExt === '.jpeg' ? '.jpg' : rawExt
    if (!IMAGE_EXTENSIONS.has(finalExt)) {
      throw new Error('Unsupported image format')
    }
    const finalName = `${index}${finalExt}`

    const backend = this.getStorageBackend()
    if (backend) {
      // S3/WebDAV upload
      const result = await backend.upload(buffer, finalName)
      await this.ctx.database.create('memesluna_images', {
        id: randomUUID(),
        collection: collectionName,
        index,
        filename: finalName,
        type: 'storage',
        value: result.key,
        public_url: result.publicUrl || '',
        mime: this.getMimeByFilename(finalName),
        created_at: new Date(),
      })
    } else {
      // Local upload
      const dir = this.getCollectionDir(collectionName)
      await fs.writeFile(path.join(dir, finalName), buffer)
      await this.ctx.database.create('memesluna_images', {
        id: randomUUID(),
        collection: collectionName,
        index,
        filename: finalName,
        type: 'local',
        value: finalName,
        mime: this.getMimeByFilename(finalName),
        created_at: new Date(),
      })
    }

    return finalName
  }

  async deleteImageFromCollection(collectionName: string, filename: string): Promise<boolean> {
    this.ensureCollectionName(collectionName)
    if (!(await this.collectionExists(collectionName))) {
      return false
    }

    let safeName: string
    try {
      safeName = this.ensureSafeImageFilename(filename)
    } catch {
      return false
    }

    const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName, filename: safeName })
    if (!rows.length) {
      return false
    }

    const image = rows[0]
    if (image.type === 'storage') {
      const backend = this.getStorageBackend()
      if (backend) {
        try {
          await backend.delete(image.value)
        } catch {}
      }
    } else if (image.type === 'local') {
      const fullPath = path.join(this.getCollectionDir(collectionName), safeName)
      try {
        await fs.unlink(fullPath)
      } catch {}
    }

    await this.ctx.database.remove('memesluna_images', { id: image.id })
    return true
  }

  async moveImageToCollection(
    sourceCollection: string,
    targetCollection: string,
    filename: string
  ): Promise<string | null> {
    this.ensureCollectionName(sourceCollection)
    this.ensureCollectionName(targetCollection)
    if (!(await this.collectionExists(sourceCollection)) || !(await this.collectionExists(targetCollection))) {
      return null
    }

    let safeName: string
    try {
      safeName = this.ensureSafeImageFilename(filename)
    } catch {
      return null
    }

    const rows = await this.ctx.database.get('memesluna_images', { collection: sourceCollection, filename: safeName })
    if (!rows.length) {
      return null
    }

    const image = rows[0]

    // Determine the next index in target
    const maxImg = await this.ctx.database.get('memesluna_images', { collection: targetCollection }, { limit: 1, sort: { index: 'desc' } })
    const targetIndex = maxImg.length ? maxImg[0].index + 1 : 1
    const ext = path.extname(safeName).toLowerCase()
    const targetFilename = `${targetIndex}${ext}`

    if (image.type === 'storage') {
      const backend = this.getStorageBackend()
      if (backend) {
        try {
          const buffer = await backend.download(image.value)
          await backend.delete(image.value)
          const result = await backend.upload(buffer, targetFilename)
          await this.ctx.database.set('memesluna_images', { id: image.id }, {
            collection: targetCollection,
            index: targetIndex,
            filename: targetFilename,
            value: result.key,
            public_url: result.publicUrl || '',
          })
          return targetFilename
        } catch {
          return null
        }
      }
    } else if (image.type === 'local') {
      const sourcePath = path.join(this.getCollectionDir(sourceCollection), safeName)
      const targetDir = this.getCollectionDir(targetCollection)
      const targetPath = path.join(targetDir, targetFilename)
      try {
        await fs.rename(sourcePath, targetPath)
        await this.ctx.database.set('memesluna_images', { id: image.id }, {
          collection: targetCollection,
          index: targetIndex,
          filename: targetFilename,
          value: targetFilename,
        })
        return targetFilename
      } catch {
        return null
      }
    }

    return null
  }

  async getCollectionInfo(collectionName: string): Promise<CollectionInfo | null> {
    if (!this.isValidCollectionName(collectionName)) {
      return null
    }
    if (!(await this.collectionExists(collectionName))) {
      return null
    }

    const localImages = await this.getCollectionImages(collectionName)
    const links = await this.getCollectionLinks(collectionName)
    const description = await this.getCollectionDescription(collectionName)

    return {
      name: collectionName,
      description,
      localCount: localImages.length,
      linkCount: links.length,
      totalCount: localImages.length + links.length,
      hasContent: localImages.length > 0 || links.length > 0,
      cover: localImages[0],
    }
  }

  async getRandomResource(collectionName: string): Promise<CollectionResource | null> {
    if (!this.isValidCollectionName(collectionName)) {
      return null
    }
    if (!(await this.collectionExists(collectionName))) {
      return null
    }

    const count = (await this.ctx.database.get('memesluna_images', { collection: collectionName }, ['id'])).length
    if (count === 0) {
      return null
    }

    const offset = Math.floor(Math.random() * count)
    const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName }, { limit: 1, offset })
    if (!rows.length) {
      return null
    }

    const image = rows[0]
    if (image.type === 'external') {
      return { type: 'external', value: image.value }
    } else if (image.type === 'storage') {
      return {
        type: 'storage',
        filename: image.filename,
        value: image.value,
        public_url: image.public_url,
      }
    } else {
      return {
        type: 'local',
        filename: image.filename,
        value: path.join(this.getCollectionDir(collectionName), image.filename),
      }
    }
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
      const desc = endpoint.description || endpoint.name
      lines.push(`- 端点名: ${endpoint.name} | 描述: ${desc} | 接口地址: ${backendPath}/${endpoint.name}${suffix}`)
    }

    for (const collection of collections) {
      const info = await this.getCollectionInfo(collection)
      if (info?.hasContent) {
        const desc = info.description || collection
        const displayName = desc.endsWith('表情包') ? desc : `${desc}表情包`
        lines.push(`- ${displayName} | 描述: ${collection} | 表情包路径: ${backendPath}/${collection}`)
      }
    }

    return lines.join('\n')
  }
}

declare module 'koishi' {
  interface Context {
    memesluna: MemesLunaService
    chatluna_storage: any
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
    memesluna_images: {
      id: string
      collection: string
      index: number
      filename: string
      type: string
      value: string
      public_url: string
      mime: string
      created_at: Date
    }
  }
}
