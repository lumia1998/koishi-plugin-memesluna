import { createHash, randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { Context, Service } from 'koishi'
import type { Config } from './config'

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

export function hashImageBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function loadOptionalSharp(): any | null {
  try {
    const packageName = 'sharp'
    const sharpModule = require(packageName)
    return sharpModule.default || sharpModule
  } catch {
    return null
  }
}

function loadPhoton(): any | null {
  try {
    const packageName = '@cf-wasm/photon/node'
    return require(packageName)
  } catch {
    return null
  }
}

function countHexBitDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return 64
  let distance = 0
  for (let i = 0; i < a.length; i++) {
    const diff = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16)
    distance += diff.toString(2).replace(/0/g, '').length
  }
  return distance
}

const DHASH_BITS = 64
const DHASH_WIDTH = 9
const DHASH_HEIGHT = 8

function lumaFromRgba(data: Buffer | Uint8Array, offset: number): number {
  const alpha = data[offset + 3] / 255
  const r = data[offset] * alpha + 255 * (1 - alpha)
  const g = data[offset + 1] * alpha + 255 * (1 - alpha)
  const b = data[offset + 2] * alpha + 255 * (1 - alpha)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function buildDhashFromRgbaPixels(raw: Buffer | Uint8Array): string {
  if (raw.length < DHASH_WIDTH * DHASH_HEIGHT * 4) return ''

  let bits = ''
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    const row = y * DHASH_WIDTH * 4
    for (let x = 0; x < DHASH_WIDTH - 1; x++) {
      const left = lumaFromRgba(raw, row + x * 4)
      const right = lumaFromRgba(raw, row + (x + 1) * 4)
      bits += left > right ? '1' : '0'
    }
  }

  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

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
  method: 'redirect'
  createdAt: Date
  updatedAt: Date
}

export interface ApiEndpointInput {
  name: string
  group?: string
  description?: string
  url: string
  method?: 'redirect'
}

export interface CollectionInfo {
  name: string
  description: string
  totalCount: number
  localCount: number
  linkCount: number
  hasContent: boolean
  createdAt?: Date
  updatedAt?: Date
  apiCallCount: number
  cover?: string
}

export interface CollectionResource {
  type: 'local' | 'external' | 'storage'
  filename?: string
  value: string
  public_url?: string
}

export interface StagedImageInfo {
  id: string
  filename: string
  originalName: string
  source: string
  reason: string
  mime: string
  size: number
  createdAt: Date
  hash: string
  perceptualHash: string
}

export interface SimilarStagedImageGroup {
  id: string
  items: StagedImageInfo[]
  similarity: number
}

export interface SimilarStagedImagesResult {
  available: boolean
  threshold: number
  groups: SimilarStagedImageGroup[]
  message: string
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

interface MemesLunaStagedImageRow {
  id: string
  filename: string
  original_name: string
  source: string
  reason: string
  mime: string
  size: number
  created_at: Date
  hash: string
  perceptual_hash: string
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
        hash: 'string',
        perceptual_hash: 'string',
        created_at: 'timestamp',
      },
      {
        primary: 'id',
        unique: [['collection', 'index']],
      }
    )

    this.ctx.database.extend(
      'memesluna_collection_stats',
      {
        collection: 'string',
        api_call_count: 'integer',
        updated_at: 'timestamp',
      },
      {
        primary: 'collection',
      }
    )

    this.ctx.database.extend(
      'memesluna_staged_images',
      {
        id: 'string',
        filename: 'string',
        original_name: 'string',
        source: 'string',
        reason: 'string',
        mime: 'string',
        size: 'integer',
        hash: 'string',
        perceptual_hash: 'string',
        created_at: 'timestamp',
      },
      {
        primary: 'id',
        unique: ['filename'],
      }
    )
  }

  private getStorageRoot() {
    return path.resolve(this.ctx.baseDir, this.config.storagePath || 'data/memesluna')
  }

  private getStagingDir() {
    return path.join(this.getStorageRoot(), '.staging')
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
              ...(await this.getImageFingerprints(await fs.readFile(newPath))),
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
              ...(await this.getImageFingerprints(await fs.readFile(path.join(colDir, filename)))),
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
              hash: '',
              perceptual_hash: '',
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
    await fs.mkdir(this.getStagingDir(), { recursive: true })
    await this.syncExistingFilesToDatabase()
    await this.backfillImageFingerprints()
  }

  private async getImagePerceptualHash(buffer: Buffer): Promise<string> {
    const photon = loadPhoton()
    if (photon) {
      let inputImage: any | null = null
      let resizedImage: any | null = null
      try {
        inputImage = photon.PhotonImage.new_from_byteslice(new Uint8Array(buffer))
        resizedImage = photon.resize(inputImage, DHASH_WIDTH, DHASH_HEIGHT, photon.SamplingFilter.Nearest)
        const hash = buildDhashFromRgbaPixels(resizedImage.get_raw_pixels())
        if (hash) return hash
      } catch (error) {
        this.ctx.logger('memesluna').debug(`Failed to calculate perceptual hash with photon: ${(error as Error).message}`)
      } finally {
        try {
          resizedImage?.free?.()
        } catch {}
        try {
          inputImage?.free?.()
        } catch {}
      }
    }

    const sharp = loadOptionalSharp()
    if (!sharp) return ''

    try {
      const raw = await sharp(buffer, { animated: false, failOn: 'none' })
        .resize(9, 8, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer()

      if (raw.length < 72) return ''

      let bits = ''
      for (let y = 0; y < 8; y++) {
        const row = y * 9
        for (let x = 0; x < 8; x++) {
          bits += raw[row + x] > raw[row + x + 1] ? '1' : '0'
        }
      }

      let hex = ''
      for (let i = 0; i < bits.length; i += 4) {
        hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16)
      }
      return hex
    } catch (error) {
      this.ctx.logger('memesluna').debug(`Failed to calculate perceptual hash: ${(error as Error).message}`)
      return ''
    }
  }

  private async getImageFingerprints(buffer: Buffer): Promise<{ hash: string; perceptual_hash: string }> {
    return {
      hash: hashImageBuffer(buffer),
      perceptual_hash: await this.getImagePerceptualHash(buffer),
    }
  }

  private async getImageRowBuffer(row: any): Promise<Buffer | null> {
    if (row.type === 'local') {
      try {
        return await fs.readFile(path.join(this.getCollectionDir(row.collection), row.value || row.filename))
      } catch {
        return null
      }
    }

    if (row.type === 'storage') {
      const backend = this.getStorageBackend()
      if (!backend) return null
      try {
        return await backend.download(row.value)
      } catch {
        return null
      }
    }

    return null
  }

  private async backfillImageFingerprints() {
    const images = await this.ctx.database.get('memesluna_images', {})
    for (const row of images) {
      if (row.hash && row.perceptual_hash) continue
      const buffer = await this.getImageRowBuffer(row)
      if (!buffer) {
        if (!row.hash || row.perceptual_hash === undefined) {
          await this.ctx.database.set('memesluna_images', { id: row.id }, {
            hash: row.hash || '',
            perceptual_hash: row.perceptual_hash || '',
          })
        }
        continue
      }
      await this.ctx.database.set('memesluna_images', { id: row.id }, await this.getImageFingerprints(buffer))
    }

    const stagedRows = await this.ctx.database.get('memesluna_staged_images', {})
    for (const row of stagedRows) {
      if (row.hash && row.perceptual_hash) continue
      try {
        const buffer = await fs.readFile(this.resolveStagedImagePath(row.filename))
        await this.ctx.database.set('memesluna_staged_images', { id: row.id }, await this.getImageFingerprints(buffer))
      } catch {
        await this.ctx.database.set('memesluna_staged_images', { id: row.id }, {
          hash: row.hash || '',
          perceptual_hash: row.perceptual_hash || '',
        })
      }
    }
  }

  async getDuplicateImageByHash(
    hash: string,
    options: { includeStaged?: boolean; includeImages?: boolean; ignoreStagedId?: string } = {}
  ): Promise<string | null> {
    if (!hash) return null

    const includeStaged = options.includeStaged ?? true
    const includeImages = options.includeImages ?? true

    if (includeStaged) {
      const stagedRows = await this.ctx.database.get('memesluna_staged_images', { hash })
      const staged = stagedRows.find((row) => row.id !== options.ignoreStagedId)
      if (staged) {
        return `暂缓区/${staged.original_name || staged.filename}`
      }
    }

    if (includeImages) {
      const imageRows = await this.ctx.database.get('memesluna_images', { hash }, { limit: 1 })
      if (imageRows.length) {
        const image = imageRows[0]
        return `${image.collection}/${image.filename}`
      }
    }

    return null
  }

  private getHashSimilarity(a: string, b: string): number {
    if (!a || !b || a.length !== b.length) return 0
    return 1 - countHexBitDistance(a, b) / DHASH_BITS
  }

  async getSimilarStagedImages(threshold = this.config.similarityThreshold || 0.9): Promise<SimilarStagedImagesResult> {
    const normalizedThreshold = Math.min(1, Math.max(0.5, Number(threshold) || 0.9))
    await this.backfillImageFingerprints()
    const rows = await this.ctx.database.get('memesluna_staged_images', {})
    const items = rows
      .map((row) => this.mapStagedImage(row as MemesLunaStagedImageRow))
      .filter((item) => item.perceptualHash)

    if (!items.length) {
      return {
        available: true,
        threshold: normalizedThreshold,
        groups: [],
        message: rows.length ? '暂缓区图片暂未生成可比较的感知哈希' : '暂缓区暂无图片',
      }
    }

    const parent = new Map<string, string>()
    const groupSimilarity = new Map<string, number>()
    const find = (id: string): string => {
      const current = parent.get(id) || id
      if (current === id) return id
      const root = find(current)
      parent.set(id, root)
      return root
    }
    const union = (a: string, b: string, similarity: number) => {
      const rootA = find(a)
      const rootB = find(b)
      if (rootA === rootB) {
        groupSimilarity.set(rootA, Math.max(groupSimilarity.get(rootA) || 0, similarity))
        return
      }
      parent.set(rootB, rootA)
      groupSimilarity.set(rootA, Math.max(groupSimilarity.get(rootA) || 0, groupSimilarity.get(rootB) || 0, similarity))
    }

    for (const item of items) parent.set(item.id, item.id)

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const similarity = this.getHashSimilarity(items[i].perceptualHash, items[j].perceptualHash)
        if (similarity >= normalizedThreshold) {
          union(items[i].id, items[j].id, similarity)
        }
      }
    }

    const grouped = new Map<string, StagedImageInfo[]>()
    for (const item of items) {
      const root = find(item.id)
      const list = grouped.get(root) || []
      list.push(item)
      grouped.set(root, list)
    }

    const groups = Array.from(grouped.entries())
      .filter(([, list]) => list.length > 1)
      .map(([root, list], index) => ({
        id: `similar-${index + 1}`,
        items: list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        similarity: groupSimilarity.get(root) || normalizedThreshold,
      }))
      .sort((a, b) => b.items.length - a.items.length || b.similarity - a.similarity)

    return {
      available: true,
      threshold: normalizedThreshold,
      groups,
      message: groups.length ? `找到 ${groups.length} 组相似图片` : '暂缓区没有达到阈值的相似图片',
    }
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

  private isStagedImageFile(filename: string): boolean {
    return this.isImageFile(filename)
  }

  private ensureSafeStagedImageFilename(filename: string): string {
    const normalized = path.basename(filename || '')
    if (!filename || normalized !== filename || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid staged image filename')
    }
    if (!this.isStagedImageFile(normalized)) {
      throw new Error('Invalid staged image filename')
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

  private mapStagedImage(row: MemesLunaStagedImageRow): StagedImageInfo {
    return {
      id: row.id,
      filename: row.filename,
      originalName: row.original_name || '',
      source: row.source || '',
      reason: row.reason || '',
      mime: row.mime || this.getMimeByFilename(row.filename),
      size: row.size || 0,
      createdAt: row.created_at,
      hash: row.hash || '',
      perceptualHash: row.perceptual_hash || '',
    }
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
          hash: '',
          perceptual_hash: '',
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

  private isAvifBuffer(buffer: Buffer): boolean {
    return buffer.length >= 12 && buffer.toString('ascii', 4, 12) === 'ftypavif'
  }

  private buildStagedFilename(originalName: string | undefined, extHint: string | undefined): string {
    const src = (originalName ?? '').trim()
    const rawExt = (path.parse(src).ext || (extHint ? `.${extHint}` : '') || '.png').toLowerCase()
    const normalizedExt = rawExt === '.jpeg' ? '.jpg' : rawExt
    const finalExt = IMAGE_EXTENSIONS.has(normalizedExt) ? normalizedExt : '.png'
    return `${Date.now()}-${randomUUID()}${finalExt}`
  }

  private resolveStagedImagePath(filename: string): string {
    return path.join(this.getStagingDir(), this.ensureSafeStagedImageFilename(filename))
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

    const fingerprints = await this.getImageFingerprints(buffer)
    const duplicate = await this.getDuplicateImageByHash(fingerprints.hash, { includeStaged: false, includeImages: true })
    if (duplicate) {
      throw new Error('Duplicate image already exists: ' + duplicate)
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
        ...fingerprints,
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
        ...fingerprints,
        created_at: new Date(),
      })
    }

    return finalName
  }


  async addStagedImageBuffer(
    buffer: Buffer,
    originalName?: string,
    source = 'filter',
    reason = ''
  ): Promise<StagedImageInfo> {
    if (!buffer.length) {
      throw new Error('Invalid image payload')
    }

    if (this.isAvifBuffer(buffer) || path.extname(originalName ?? '').toLowerCase() === '.avif') {
      throw new Error('AVIF images are not staged. Convert to JPG/PNG/GIF/WEBP first.')
    }

    const fingerprints = await this.getImageFingerprints(buffer)
    const duplicate = await this.getDuplicateImageByHash(fingerprints.hash, { includeStaged: true, includeImages: true })
    if (duplicate) {
      throw new Error('Duplicate image already exists: ' + duplicate)
    }

    const extHint = path.parse(originalName ?? '').ext.replace('.', '') || undefined
    const filename = this.buildStagedFilename(originalName, extHint)
    const mime = this.getMimeByFilename(filename)
    const targetPath = this.resolveStagedImagePath(filename)
    const now = new Date()

    await fs.mkdir(this.getStagingDir(), { recursive: true })
    await fs.writeFile(targetPath, buffer)

    const row = {
      id: randomUUID(),
      filename,
      original_name: originalName || filename,
      source: source || 'filter',
      reason: reason || '',
      mime,
      size: buffer.length,
      ...fingerprints,
      created_at: now,
    }

    await this.ctx.database.create('memesluna_staged_images', row)
    return this.mapStagedImage(row)
  }

  async addStagedImageBase64(
    base64Data: string,
    originalName?: string,
    source = 'filter',
    reason = ''
  ): Promise<StagedImageInfo> {
    const { base64, extHint } = this.normalizeBase64(base64Data)
    const buffer = Buffer.from(base64, 'base64')
    const name = originalName || (extHint ? `filtered.${extHint}` : undefined)
    return this.addStagedImageBuffer(buffer, name, source, reason)
  }

  async getStagedImages(): Promise<StagedImageInfo[]> {
    const rows = await this.ctx.database.get('memesluna_staged_images', {})
    return rows
      .map((row) => this.mapStagedImage(row as MemesLunaStagedImageRow))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  async getStagedImageBuffer(id: string): Promise<{ buffer: Buffer; mime: string; filename: string } | null> {
    const rows = await this.ctx.database.get('memesluna_staged_images', { id })
    if (!rows.length) return null
    const row = rows[0] as MemesLunaStagedImageRow

    try {
      const buffer = await fs.readFile(this.resolveStagedImagePath(row.filename))
      return { buffer, mime: row.mime || this.getMimeByFilename(row.filename), filename: row.filename }
    } catch {
      return null
    }
  }

  async deleteStagedImage(id: string): Promise<boolean> {
    const rows = await this.ctx.database.get('memesluna_staged_images', { id })
    if (!rows.length) return false
    const row = rows[0] as MemesLunaStagedImageRow

    try {
      await fs.unlink(this.resolveStagedImagePath(row.filename))
    } catch {}

    await this.ctx.database.remove('memesluna_staged_images', { id })
    return true
  }

  async promoteStagedImage(id: string, collectionName: string): Promise<string | null> {
    this.ensureCollectionName(collectionName)
    if (!(await this.collectionExists(collectionName))) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    const rows = await this.ctx.database.get('memesluna_staged_images', { id })
    if (!rows.length) return null
    const row = rows[0] as MemesLunaStagedImageRow
    const staged = await this.getStagedImageBuffer(id)
    if (!staged) return null

    const originalName = this.isImageFile(row.original_name) ? row.original_name : row.filename
    const saved = await this.addLocalImageBase64(collectionName, staged.buffer.toString('base64'), originalName)
    await this.deleteStagedImage(id)
    return saved
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
    const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName }, ['created_at'])
    const dates = rows
      .map((row) => new Date(row.created_at as Date))
      .filter((date) => !Number.isNaN(date.getTime()))

    let statCreatedAt: Date | undefined
    let statUpdatedAt: Date | undefined
    try {
      const stat = await fs.stat(this.getCollectionDir(collectionName))
      statCreatedAt = stat.birthtime
      statUpdatedAt = stat.mtime
    } catch {}

    const createdAt = dates.length
      ? new Date(Math.min(...dates.map((date) => date.getTime()), statCreatedAt?.getTime() || Infinity))
      : statCreatedAt
    const updatedAt = dates.length
      ? new Date(Math.max(...dates.map((date) => date.getTime()), statUpdatedAt?.getTime() || 0))
      : statUpdatedAt
    const apiCallCount = await this.getCollectionApiCallCount(collectionName)

    return {
      name: collectionName,
      description,
      localCount: localImages.length,
      linkCount: links.length,
      totalCount: localImages.length + links.length,
      hasContent: localImages.length > 0 || links.length > 0,
      createdAt,
      updatedAt,
      apiCallCount,
      cover: localImages[0],
    }
  }

  async getCollectionApiCallCount(collectionName: string): Promise<number> {
    if (!this.isValidCollectionName(collectionName)) {
      return 0
    }

    const rows = await this.ctx.database.get('memesluna_collection_stats', { collection: collectionName })
    return rows[0]?.api_call_count || 0
  }

  async incrementCollectionApiCallCount(collectionName: string): Promise<void> {
    if (!this.isValidCollectionName(collectionName)) {
      return
    }

    const rows = await this.ctx.database.get('memesluna_collection_stats', { collection: collectionName })
    const now = new Date()
    if (rows.length) {
      await this.ctx.database.set('memesluna_collection_stats', { collection: collectionName }, {
        api_call_count: (rows[0].api_call_count || 0) + 1,
        updated_at: now,
      })
      return
    }

    await this.ctx.database.create('memesluna_collection_stats', {
      collection: collectionName,
      api_call_count: 1,
      updated_at: now,
    })
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

  private mapEndpoint(row: MemesLunaEndpointRow): ApiEndpoint {
    return {
      id: row.id,
      name: row.name,
      group: row.group || '默认分组',
      description: row.description || '',
      url: row.url,
      method: 'redirect',
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
      method: 'redirect',
      url_construction: 'normal',
      model_name: '',
      query_params: JSON.stringify([]),
      proxy_settings: JSON.stringify({}),
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
    payload.method = 'redirect'
    payload.url_construction = 'normal'
    payload.model_name = ''
    payload.query_params = JSON.stringify([])
    payload.proxy_settings = JSON.stringify({})

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
      const desc = endpoint.description || endpoint.name
      lines.push(`- 端点名: ${endpoint.name} | 描述: ${desc} | 接口地址: ${backendPath}/${endpoint.name}`)
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
      hash: string
      perceptual_hash: string
      created_at: Date
    }
    memesluna_collection_stats: {
      collection: string
      api_call_count: number
      updated_at: Date
    }
    memesluna_staged_images: {
      id: string
      filename: string
      original_name: string
      source: string
      reason: string
      mime: string
      size: number
      hash: string
      perceptual_hash: string
      created_at: Date
    }
  }
}






