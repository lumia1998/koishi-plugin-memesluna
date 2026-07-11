import { createHash, randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { Context, Service, Eval } from 'koishi'
import type { Config } from './config'
import type { AIAnnotator } from './aiAnnotator'
import {
  DHASH_BITS,
  DHASH_WIDTH,
  DHASH_HEIGHT,
} from './constants'

export const MEMESLUNA_IMAGES_UPDATED = 'memesluna/images-updated'

export function sanitizeFilename(filename: string): string {
  // 先提取扩展名
  const ext = path.extname(filename).toLowerCase()

  // 移除扩展名后的部分
  let base = ext ? filename.slice(0, filename.length - ext.length) : filename

  // 过滤危险字符（将路径分隔符也替换）
  base = base.replace(/[\s/\\?%*:|"<>,;=@]+/g, '_')

  // 移除前导/尾随点和下划线
  base = base.replace(/^[._]+|[._]+$/g, '')

  // 如果清理后为空，使用随机名
  if (!base) {
    base = `file_${Date.now()}`
  }

  // Windows 保留名检查
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
  if (reserved.test(base)) {
    base = `_${base}`
  }

  // 限制长度（255字节 - 扩展名 - 余量）
  const maxLen = 200 - ext.length
  if (Buffer.byteLength(base, 'utf8') > maxLen) {
    // 截断到安全长度
    while (Buffer.byteLength(base, 'utf8') > maxLen && base.length > 1) {
      base = base.slice(0, -1)
    }
  }

  return `${base}${ext}`
}

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

let cachedSharp: any = undefined
let cachedPhoton: any = undefined

export function loadOptionalSharp(): any | null {
  if (cachedSharp !== undefined) return cachedSharp
  try {
    const packageName = 'sharp'
    const sharpModule = require(packageName)
    cachedSharp = sharpModule.default || sharpModule
  } catch {
    cachedSharp = null
  }
  return cachedSharp
}

export function loadPhoton(): any | null {
  if (cachedPhoton !== undefined) return cachedPhoton
  try {
    const packageName = '@cf-wasm/photon/node'
    cachedPhoton = require(packageName)
  } catch {
    cachedPhoton = null
  }
  return cachedPhoton
}

function countHexBitDistance(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return DHASH_BITS
  let distance = 0
  for (let i = 0; i < a.length; i++) {
    const diff = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16)
    distance += diff.toString(2).replace(/0/g, '').length
  }
  return distance
}

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
const ENDPOINT_NAME_REGEXP = /^[^\/\\?%*:|"<>.]+$/

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
  cover?: string
  access: CollectionAccess
}

export interface CollectionResource {
  type: 'local' | 'external'
  filename?: string
  value: string
  public_url?: string
}

export type CollectionAccessMode = 'disabled' | 'whitelist' | 'blacklist'

export interface CollectionAccess {
  mode: CollectionAccessMode
  groups: string[]
}

export interface CollectionAccessSession {
  platform?: string
  guildId?: string
  channelId?: string
  /** 私聊会话：为 true 时始终允许，即便带有 channelId（部分适配器私聊也有 channelId） */
  isDirect?: boolean
}

const DEFAULT_COLLECTION_ACCESS: CollectionAccess = { mode: 'disabled', groups: [] }

export function isCollectionAccessMode(value: unknown): value is CollectionAccessMode {
  return value === 'disabled' || value === 'whitelist' || value === 'blacklist'
}

export function normalizeCollectionAccess(value: unknown): CollectionAccess {
  if (!value || typeof value !== 'object') return { ...DEFAULT_COLLECTION_ACCESS }
  const input = value as { mode?: unknown; groups?: unknown }
  if (!isCollectionAccessMode(input.mode)) {
    return { ...DEFAULT_COLLECTION_ACCESS }
  }
  const groups = Array.isArray(input.groups)
    ? Array.from(new Set(input.groups.filter((group): group is string => typeof group === 'string').map((group) => group.trim()).filter(Boolean)))
    : []
  return { mode: input.mode, groups }
}

export function getSessionAccessCandidates(session: CollectionAccessSession): string[] {
  const plain = [session.guildId, session.channelId].filter((value): value is string => !!value)
  const prefixed = session.platform ? plain.map((value) => `${session.platform}:${value}`) : []
  return Array.from(new Set([...plain, ...prefixed]))
}

export function isCollectionAccessAllowed(access: CollectionAccess, session: CollectionAccessSession): boolean {
  const normalized = normalizeCollectionAccess(access)
  if (normalized.mode === 'disabled') return true
  // 不能用“缺少 guildId”判断私聊：部分群适配器只有 channelId
  if (session.isDirect === true) return true
  const candidates = getSessionAccessCandidates(session)
  if (!candidates.length) return true
  const matched = candidates.some((candidate) => normalized.groups.includes(candidate))
  return normalized.mode === 'whitelist' ? matched : !matched
}

/** 从 Koishi session 组装访问判定上下文（可测） */
export function toCollectionAccessSession(session: {
  platform?: string
  guildId?: string
  channelId?: string
  isDirect?: boolean
  subtype?: string
} | null | undefined): CollectionAccessSession {
  if (!session) return {}
  const isDirect = session.isDirect === true
    || session.subtype === 'private'
    || (!session.guildId && !session.channelId)
  return {
    platform: session.platform,
    guildId: session.guildId,
    channelId: session.channelId,
    isDirect: isDirect || undefined,
  }
}

/** 按会话过滤合集列表（可测）；私聊与 disabled 策略均保留 */
export function filterCollectionsByAccess<T extends { access?: CollectionAccess }>(
  items: T[],
  session: CollectionAccessSession,
): T[] {
  return items.filter((item) => isCollectionAccessAllowed(
    item.access ?? DEFAULT_COLLECTION_ACCESS,
    session,
  ))
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
  private _annotator: AIAnnotator | null = null

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

  private notifyImagesChanged() {
    ;(this.ctx as any).emit(MEMESLUNA_IMAGES_UPDATED)
  }

  setAnnotator(annotator: AIAnnotator): void {
    this._annotator = annotator
  }

  get annotator(): AIAnnotator | null {
    return this._annotator
  }

  /**
   * 将已存在于数据库的图片行推入 AI 标注队列（异步执行，不阻塞调用方）
   * 供 .stole 命令在偷图成功后调用
   */
  async queueAnnotation(rows: any[]): Promise<void> {
    if (!this._annotator || !rows.length) return
    const concurrency = this.config.aiConcurrency || 2
    const queue = [...rows]

    const worker = async () => {
      while (queue.length > 0) {
        const row = queue.shift()
        if (!row) break
        try {
          const stored = row.id ? await this.getImageById(row.id) : null
          if (stored) {
            let aliases: string[] = []
            let tags: string[] = []
            try { const p = JSON.parse(stored.aliases || '[]'); aliases = Array.isArray(p) ? p : [] } catch {}
            try { const p = JSON.parse(stored.tags || '[]'); tags = Array.isArray(p) ? p : [] } catch {}
            if (aliases.length > 0 || tags.length > 0) continue
          }

          const image = await this.getLocalImageBuffer(row.collection, row.filename)
          if (!image) continue
          const result = await this._annotator!.annotate(image.buffer, {
            filename: row.filename,
            collectionName: row.collection,
            imageUrl: `${this.config.backendPath}/${encodeURIComponent(row.collection)}/${encodeURIComponent(row.filename)}`,
          })
          if (result) {
            await this.updateImageAnnotation(row.id, result.aliases, result.tags)
          }
          if (queue.length > 0 && this.config.aiBatchDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.config.aiBatchDelay))
          }
        } catch (err) {
          this.ctx.logger('memesluna').warn(`queueAnnotation failed for ${row.filename}:`, err)
        }
      }
    }

    const workers = Array(Math.min(concurrency, rows.length)).fill(null).map(() => worker())
    await Promise.all(workers)
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
        aliases: { type: 'string', initial: '[]' },
        tags: { type: 'string', initial: '[]' },
        created_at: 'timestamp',
      },
      {
        primary: 'id',
        unique: [['collection', 'index']],
        indexes: ['hash', 'collection', 'perceptual_hash'],
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
        indexes: ['hash'],
      }
    )
  }

  private getStorageRoot() {
    return path.resolve(this.ctx.baseDir, 'data/memesluna')
  }

  private getStagingDir() {
    return path.join(this.getStorageRoot(), '.staging')
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

    const foldersSet = new Set(folders)
    try {
      const allDbImages = await this.ctx.database.get('memesluna_images', {}, ['collection'])
      const dbCollections = new Set(allDbImages.map((img) => img.collection))
      const missingCollections = Array.from(dbCollections).filter((col) => !foldersSet.has(col))
      if (missingCollections.length > 0) {
        await this.ctx.database.remove('memesluna_images', { collection: missingCollections })
      }
    } catch (err) {
      this.ctx.logger('memesluna').warn('Failed to cleanup missing collections from database:', err)
    }

    await Promise.all(folders.map(async (colName) => {
      const colDir = this.getCollectionDir(colName)
      let files: string[] = []
      try {
        const entries = await fs.readdir(colDir, { withFileTypes: true })
        files = entries.filter((e) => e.isFile() && this.isImageFile(e.name)).map((e) => e.name)
      } catch {
        return
      }

      // Fetch all registered images for this collection at once
      const existingImages = await this.ctx.database.get('memesluna_images', { collection: colName })
      const existingFilenames = new Set(existingImages.map((img) => img.filename))
      const existingExternalValues = new Set(
        existingImages.filter((img) => img.type === 'external').map((img) => img.value)
      )
      const existingIndices = new Set(existingImages.map((img) => img.index))
      let maxIndex = existingImages.reduce((max, img) => Math.max(max, img.index), 0)

      // Sync local files
      for (const filename of files) {
        const safeName = sanitizeFilename(filename)
        let currentName = filename

        // Rename on disk if the name was not safe
        if (safeName !== filename) {
          const oldPath = path.join(colDir, filename)
          const newPath = path.join(colDir, safeName)
          try {
            await fs.rename(oldPath, newPath)
            currentName = safeName
          } catch {}
        }

        // Check if already registered
        if (!existingFilenames.has(currentName)) {
          const index = ++maxIndex
          try {
            await this.ctx.database.create('memesluna_images', {
              id: randomUUID(),
              collection: colName,
              index,
              filename: currentName,
              type: 'local',
              value: currentName,
              mime: this.getMimeByFilename(currentName),
              hash: '',
              perceptual_hash: '',
              created_at: new Date(),
            })
            existingFilenames.add(currentName)
          } catch {}
        }
      }

      // Cleanup deleted local files from database
      const filesSet = new Set(files.map(sanitizeFilename))
      const missingLocalImages = existingImages.filter(
        (img) => img.type === 'local' && !filesSet.has(img.value || img.filename)
      )
      if (missingLocalImages.length > 0) {
        await this.ctx.database.remove('memesluna_images', {
          id: missingLocalImages.map((img) => img.id),
        })
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
          if (!existingExternalValues.has(link)) {
            const index = ++maxIndex
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
            existingExternalValues.add(link)
            existingIndices.add(index)
          }
        }
        // Cleanup migrated links file so we don't scan it repeatedly
        await fs.rm(linksFile, { force: true })
      } catch {}
    }))
  }

  private async ensureStorage() {
    await fs.mkdir(this.getStorageRoot(), { recursive: true })
    await fs.mkdir(this.getStagingDir(), { recursive: true })
    await this.syncExistingFilesToDatabase()
    Promise.all([
      this.backfillImagesFingerprints(),
      this.backfillStagedFingerprints()
    ]).catch((err) => {
      this.ctx.logger('memesluna').warn('Failed to backfill image fingerprints in background:', err)
    })
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

    return null
  }

  private async backfillImagesFingerprints() {
    const images = await this.ctx.database.get('memesluna_images', {
      $or: [
        { hash: '' },
        { hash: { $exists: false } },
        { perceptual_hash: '' },
        { perceptual_hash: { $exists: false } }
      ]
    })
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
  }

  private async backfillStagedFingerprints() {
    const stagedRows = await this.ctx.database.get('memesluna_staged_images', {
      $or: [
        { hash: '' },
        { hash: { $exists: false } },
        { perceptual_hash: '' },
        { perceptual_hash: { $exists: false } }
      ]
    })
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
    options: { includeStaged?: boolean; includeImages?: boolean; ignoreStagedId?: string; collection?: string } = {}
  ): Promise<string | null> {
    if (!hash) return null

    const includeStaged = options.includeStaged ?? true
    const includeImages = options.includeImages ?? true

    if (includeStaged) {
      const stagedRows = await this.ctx.database.get('memesluna_staged_images', { hash })
      for (const staged of stagedRows) {
        if (staged.id === options.ignoreStagedId) continue
        try {
          const fullPath = this.resolveStagedImagePath(staged.filename)
          await fs.access(fullPath)
          return `暂缓区/${staged.original_name || staged.filename}`
        } catch {
          await this.ctx.database.remove('memesluna_staged_images', { id: staged.id })
        }
      }
    }

    if (includeImages) {
      const query: any = { hash }
      if (options.collection) {
        query.collection = options.collection
      }
      const imageRows = await this.ctx.database.get('memesluna_images', query)
      for (const image of imageRows) {
        if (image.type === 'local') {
          try {
            const fullPath = this.resolveLocalImagePath(image.collection, image.value)
            await fs.access(fullPath)
            return `${image.collection}/${image.filename}`
          } catch {
            await this.ctx.database.remove('memesluna_images', { id: image.id })
            this.notifyImagesChanged()
          }
        } else {
          return `${image.collection}/${image.filename}`
        }
      }
    }

    return null
  }

  private async getExistingImageRowByHash(hash: string, collectionName: string): Promise<any | null> {
    if (!hash) return null

    const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName, hash })
    for (const row of rows) {
      if (row.type === 'local') {
        try {
          await fs.access(this.resolveLocalImagePath(row.collection, row.value || row.filename))
          return row
        } catch {
          await this.ctx.database.remove('memesluna_images', { id: row.id })
          this.notifyImagesChanged()
        }
      } else {
        return row
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
    await this.backfillStagedFingerprints()
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
      throw new Error('Invalid collection name: special characters like /\\?%*:|"<>. are not allowed.')
    }
  }

  private ensureEndpointName(name: string) {
    if (!name || !ENDPOINT_NAME_REGEXP.test(name)) {
      throw new Error('Invalid endpoint name: special characters like /\\?%*:|"<>. are not allowed.')
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

  private getCollectionAccessFile(collectionName: string) {
    return path.join(this.getCollectionDir(collectionName), '.access.json')
  }

  async getCollectionAccess(collectionName: string): Promise<CollectionAccess> {
    if (!this.isValidCollectionName(collectionName)) return { ...DEFAULT_COLLECTION_ACCESS }
    try {
      return normalizeCollectionAccess(JSON.parse(await fs.readFile(this.getCollectionAccessFile(collectionName), 'utf8')))
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        try {
          this.ctx.logger('memesluna').warn(`Failed to read access policy for collection "${collectionName}": ${error?.message || error}`)
        } catch {
          // 单元测试等无 logger 上下文时忽略
        }
      }
      return { ...DEFAULT_COLLECTION_ACCESS }
    }
  }

  async setCollectionAccess(collectionName: string, access: CollectionAccess): Promise<boolean> {
    this.ensureCollectionName(collectionName)
    if (!(await this.collectionExists(collectionName))) return false
    if (!access || typeof access !== 'object' || !isCollectionAccessMode(access.mode)) {
      throw new Error('Invalid collection access mode. Expected disabled, whitelist, or blacklist.')
    }
    const normalized = normalizeCollectionAccess(access)
    const target = this.getCollectionAccessFile(collectionName)
    const dir = path.dirname(target)
    const temp = path.join(dir, `.access.json.${process.pid}.${Date.now()}.tmp`)
    try {
      await fs.writeFile(temp, JSON.stringify(normalized, null, 2), 'utf8')
      await fs.rename(temp, target)
    } catch (error) {
      try {
        await fs.unlink(temp)
      } catch {
        // 尽力删除临时文件，忽略清理失败
      }
      throw error
    }
    return true
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
    if (await this.getEndpointByName(collectionName)) {
      throw new Error(`Collection name conflicts with existing endpoint: ${collectionName}`)
    }
    const dir = this.getCollectionDir(collectionName)
    try {
      await fs.mkdir(dir)
      this.notifyImagesChanged()
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
      await this.ctx.database.remove('memesluna_images', { collection: collectionName })
      this.notifyImagesChanged()
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

    const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName, type: 'local' })
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

    const existingImages = await this.ctx.database.get('memesluna_images', { collection: collectionName })
    const existingExternalValues = new Set(
      existingImages.filter((img) => img.type === 'external').map((img) => img.value)
    )
    let maxIndex = existingImages.reduce((max, img) => Math.max(max, img.index), 0)

    let addedCount = 0
    for (const link of normalized) {
      if (!existingExternalValues.has(link)) {
        const index = ++maxIndex
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
        existingExternalValues.add(link)
        addedCount++
      }
    }
    if (addedCount > 0) this.notifyImagesChanged()
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
    this.notifyImagesChanged()
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

  private async deduplicateDatabaseFilename(collectionName: string, filename: string): Promise<string> {
    const parsed = path.parse(filename)
    let counter = 1
    let candidate = filename

    while (true) {
      const rows = await this.ctx.database.get('memesluna_images', { collection: collectionName, filename: candidate })
      if (!rows.length) {
        return candidate
      }
      candidate = `${parsed.name}_${counter}${parsed.ext}`
      counter++
    }
  }

  async addLocalImageBuffer(
    collectionName: string,
    buffer: Buffer,
    originalName?: string,
    extHint?: string
  ): Promise<{ id: string; filename: string }> {
    this.ensureCollectionName(collectionName)
    if (!(await this.collectionExists(collectionName))) {
      throw new Error(`Collection not found: ${collectionName}`)
    }

    if (!buffer.length) {
      throw new Error('Invalid image payload')
    }

    const fingerprints = await this.getImageFingerprints(buffer)
    const duplicate = await this.getExistingImageRowByHash(fingerprints.hash, collectionName)
    const preservedAliases = duplicate?.aliases || '[]'
    const preservedTags = duplicate?.tags || '[]'
    if (duplicate) {
      await this.deleteImageFromCollection(duplicate.collection, duplicate.filename)
    }

    // Determine the next index
    const maxImg = await this.ctx.database.get('memesluna_images', { collection: collectionName }, { limit: 1, sort: { index: 'desc' } })
    const index = maxImg.length ? maxImg[0].index + 1 : 1

    const rawExt = (path.parse(originalName ?? '').ext || (extHint ? `.${extHint}` : '') || '.png').toLowerCase()
    const finalExt = rawExt === '.jpeg' ? '.jpg' : rawExt
    if (!IMAGE_EXTENSIONS.has(finalExt)) {
      throw new Error('Unsupported image format')
    }

    const baseName = originalName ? path.basename(originalName, path.extname(originalName)) : `image-${Date.now()}`
    const safeBase = sanitizeFilename(`${baseName}${finalExt}`)
    const finalName = await this.deduplicateDatabaseFilename(collectionName, safeBase)

    const id = randomUUID()
    // Local upload
    const dir = this.getCollectionDir(collectionName)
    await fs.writeFile(path.join(dir, finalName), buffer)
    await this.ctx.database.create('memesluna_images', {
      id,
      collection: collectionName,
      index,
      filename: finalName,
      type: 'local',
      value: finalName,
      mime: this.getMimeByFilename(finalName),
      ...fingerprints,
      aliases: preservedAliases,
      tags: preservedTags,
      created_at: new Date(),
    })
    this.notifyImagesChanged()

    return { id, filename: finalName }
  }



  async getImageById(id: string) {
    const rows = await this.ctx.database.get('memesluna_images', { id })
    return rows[0] ?? null
  }

  async updateImageAnnotation(id: string, aliases?: string[], tags?: string[]): Promise<boolean> {
    const row = await this.getImageById(id)
    if (!row) return false
    const update: any = {}
    if (aliases !== undefined) update.aliases = JSON.stringify(aliases)
    if (tags !== undefined) update.tags = JSON.stringify(tags)
    await this.ctx.database.set('memesluna_images', { id }, update)
    this.notifyImagesChanged()
    return true
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

  async deleteExpiredStagedImages(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    const rows = await this.ctx.database.get('memesluna_staged_images', {})
    const expired = rows.filter((row) => new Date(row.created_at).getTime() < cutoff.getTime())
    if (!expired.length) return 0

    for (const row of expired) {
      try {
        await fs.unlink(this.resolveStagedImagePath((row as MemesLunaStagedImageRow).filename))
      } catch {}
    }

    const ids = expired.map((row) => row.id)
    await this.ctx.database.remove('memesluna_staged_images', { id: ids })
    return ids.length
  }

  async deleteAllStagedImages(): Promise<number> {
    const rows = await this.ctx.database.get('memesluna_staged_images', {})
    if (!rows.length) return 0

    for (const row of rows) {
      try {
        await fs.unlink(this.resolveStagedImagePath((row as MemesLunaStagedImageRow).filename))
      } catch {}
    }

    const ids = rows.map((row) => row.id)
    await this.ctx.database.remove('memesluna_staged_images', { id: ids })
    return ids.length
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

    // P1 修复：添加事务性保护，防止归档过程中的数据不一致
    let savedResult: any
    try {
      const originalName = this.isImageFile(row.original_name) ? row.original_name : row.filename
      savedResult = await this.addLocalImageBuffer(collectionName, staged.buffer, originalName)

      // 只有在成功写入正式合集后才删除暂缓区图片
      await this.deleteStagedImage(id)
    } catch (error) {
      // 如果归档失败，暂缓区图片保持不变
      this.ctx.logger('memesluna').error(`Failed to promote staged image ${id}:`, error)
      throw error
    }

    const saved = savedResult.filename

    if (this._annotator) {
      void this.queueAnnotation([{
        id: savedResult.id,
        collection: collectionName,
        filename: saved,
      }])
    }

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
    if (image.type === 'local') {
      const fullPath = path.join(this.getCollectionDir(collectionName), safeName)
      try {
        await fs.unlink(fullPath)
      } catch {}
    }

    await this.ctx.database.remove('memesluna_images', { id: image.id })
    this.notifyImagesChanged()
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

    if (image.type === 'local') {
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
        this.notifyImagesChanged()
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
    const access = await this.getCollectionAccess(collectionName)
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
    return {
      name: collectionName,
      description,
      localCount: localImages.length,
      linkCount: links.length,
      totalCount: localImages.length + links.length,
      hasContent: localImages.length > 0 || links.length > 0,
      createdAt,
      updatedAt,
      cover: localImages[0],
      access,
    }
  }



  async getRandomResource(collectionName: string): Promise<CollectionResource | null> {
    if (!this.isValidCollectionName(collectionName)) {
      return null
    }
    if (!(await this.collectionExists(collectionName))) {
      return null
    }

    const count = await this.ctx.database.eval('memesluna_images', (row) => Eval.count(row.id), { collection: collectionName })
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
    } else {
      return {
        type: 'local',
        filename: image.filename,
        value: path.join(this.getCollectionDir(collectionName), image.filename),
      }
    }
  }

  async getResourceByRow(image: any): Promise<CollectionResource | null> {
    if (image.type === 'external') {
      return { type: 'external', value: image.value }
    } else {
      return {
        type: 'local',
        filename: image.filename,
        value: path.join(this.getCollectionDir(image.collection), image.filename),
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
    if (await this.getEndpointByName(input.name)) {
      throw new Error(`Endpoint already exists: ${input.name}`)
    }
    if (await this.collectionExists(input.name)) {
      throw new Error(`Endpoint name conflicts with existing collection: ${input.name}`)
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

    const sections: string[] = []

    // 端点分节
    if (endpoints.length > 0) {
      const endpointLines = endpoints.map(ep => {
        const desc = ep.description || ep.name
        return `  - ${ep.name}：${desc} → ${backendPath}/${encodeURIComponent(ep.name)}`
      })
      sections.push(`【端点转发】\n${endpointLines.join('\n')}`)
    }

    // 表情包合集分节
    const collectionLines: string[] = []
    for (const collection of collections) {
      const info = await this.getCollectionInfo(collection)
      if (info?.hasContent) {
        const desc = info.description ? `（${info.description}）` : ''
        collectionLines.push(`  - ${collection}${desc} → ${backendPath}/${encodeURIComponent(collection)}`)
      }
    }
    if (collectionLines.length > 0) {
      sections.push(`【表情包合集】\n${collectionLines.join('\n')}`)
    }

    return sections.join('\n\n')
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
      aliases: string
      tags: string
      created_at: Date
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
