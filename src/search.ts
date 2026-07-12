import type { Context } from 'koishi'
import type { Config } from './config'
import type { MemesLunaService } from './service'
import {
  ALL_IMAGES_CACHE_TTL,
  SEARCH_INVERTED_INDEX_THRESHOLD,
  SEARCH_SCORE_THRESHOLD,
  SEARCH_SCORING,
} from './constants'
import { parseJsonStringArray } from './utils'
import { getLocalBaseUrl } from './urls'

export function normalizeText(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export function flattenText(input: string): string {
  return normalizeText(input).replace(/\s+/g, '')
}

export function splitTerms(input: string): string[] {
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

/** Precomputed flattened fields so we don't re-parse JSON every request */
export interface CachedImage {
  row: any
  aliasesFlat: string[]
  tagsFlat: string[]
  filenameFlat: string
}

export interface RankedImage {
  image: any
  score: number
  matchedTerms: string[]
}

/** token / bigram -> image indices（用于大缓存候选过滤） */
export type InvertedIndex = Map<string, number[]>

export function toCachedImage(row: any): CachedImage {
  const aliases = parseJsonStringArray(row.aliases)
  const tags = parseJsonStringArray(row.tags)
  return {
    row,
    aliasesFlat: aliases.map((a: string) => flattenText(a)),
    tagsFlat: tags.map((t: string) => flattenText(t)),
    filenameFlat: flattenText(row.filename || ''),
  }
}

/** 为字段字符串建立全文 token + bigram 索引项 */
function addFieldTokens(index: InvertedIndex, field: string, imageIndex: number) {
  if (!field) return
  const add = (token: string) => {
    if (!token) return
    const list = index.get(token)
    if (list) {
      if (list[list.length - 1] !== imageIndex) list.push(imageIndex)
    } else {
      index.set(token, [imageIndex])
    }
  }

  add(field)
  if (field.length >= 2) {
    for (let i = 0; i < field.length - 1; i++) {
      add(field.slice(i, i + 2))
    }
  }
}

/**
 * 构建倒排索引：完整 flatten 字段 + 其 bigram。
 * 查询侧用 term/phrase 及其 bigram 取并集候选，再对候选做完整 includes 评分，保持正确性。
 */
export function buildInvertedIndex(images: CachedImage[]): InvertedIndex {
  const index: InvertedIndex = new Map()
  for (let i = 0; i < images.length; i++) {
    const { aliasesFlat, tagsFlat, filenameFlat } = images[i]
    for (const s of aliasesFlat) addFieldTokens(index, s, i)
    for (const s of tagsFlat) addFieldTokens(index, s, i)
    addFieldTokens(index, filenameFlat, i)
  }
  return index
}

function collectLookupTokens(text: string): string[] {
  const flat = flattenText(text)
  if (!flat) return []
  const tokens = new Set<string>([flat])
  if (flat.length >= 2) {
    for (let i = 0; i < flat.length - 1; i++) {
      tokens.add(flat.slice(i, i + 2))
    }
  }
  return Array.from(tokens)
}

/**
 * 用倒排索引收集候选下标；无命中时返回空数组（表示无候选）。
 * 若未提供 index 或规模较小，调用方应直接全量扫描。
 */
export function collectCandidateIndices(
  index: InvertedIndex,
  query: string
): number[] {
  const phrase = flattenText(query)
  const terms = splitTerms(query)
  const candidateSet = new Set<number>()

  const addFromTokens = (tokens: string[]) => {
    for (const token of tokens) {
      const hits = index.get(token)
      if (!hits) continue
      for (const idx of hits) candidateSet.add(idx)
    }
  }

  if (phrase.length >= 2) {
    addFromTokens(collectLookupTokens(phrase))
  }
  for (const term of terms) {
    addFromTokens(collectLookupTokens(term))
  }

  return Array.from(candidateSet)
}

function scoreCachedImage(
  cached: CachedImage,
  phrase: string,
  terms: string[]
): RankedImage | null {
  const { aliasesFlat, tagsFlat, filenameFlat } = cached
  if (!aliasesFlat.length && !tagsFlat.length && !filenameFlat) {
    return null
  }

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

  if (score <= 0) return null
  return { image: cached.row, score, matchedTerms: Array.from(matchedTerms) }
}

export function rankImagesByQuery(
  images: CachedImage[],
  query: string,
  invertedIndex?: InvertedIndex | null
): RankedImage[] {
  const rawQuery = query.trim()
  if (!rawQuery) return []

  const phrase = flattenText(rawQuery)
  const terms = splitTerms(rawQuery)
  const ranked: RankedImage[] = []

  const useIndex =
    invertedIndex &&
    images.length > SEARCH_INVERTED_INDEX_THRESHOLD

  if (useIndex) {
    const candidateIndices = collectCandidateIndices(invertedIndex, rawQuery)
    if (!candidateIndices.length) return []
    for (const idx of candidateIndices) {
      const cached = images[idx]
      if (!cached) continue
      const hit = scoreCachedImage(cached, phrase, terms)
      if (hit) ranked.push(hit)
    }
  } else {
    for (const cached of images) {
      const hit = scoreCachedImage(cached, phrase, terms)
      if (hit) ranked.push(hit)
    }
  }

  ranked.sort((a, b) => b.score - a.score)
  return ranked
}

// ── 全表扫描缓存，避免每次 HTTP 请求都打数据库 ──
let _allImagesCacheTime = 0
let _allImagesCache: CachedImage[] = []
let _allImagesInvertedIndex: InvertedIndex | null = null

export async function getAllImagesCached(ctx: Context): Promise<CachedImage[]> {
  const now = Date.now()
  if (now - _allImagesCacheTime < ALL_IMAGES_CACHE_TTL) return _allImagesCache
  const rows = await ctx.database.get('memesluna_images', {})
  _allImagesCache = rows.map(toCachedImage)
  _allImagesCacheTime = now
  // 大缓存时预建倒排索引；小缓存直接全扫更便宜
  _allImagesInvertedIndex =
    _allImagesCache.length > SEARCH_INVERTED_INDEX_THRESHOLD
      ? buildInvertedIndex(_allImagesCache)
      : null
  return _allImagesCache
}

/** 主动失效缓存（写操作后调用） */
export function invalidateAllImagesCache() {
  _allImagesCacheTime = 0
  _allImagesInvertedIndex = null
}

export async function findByQuery(
  ctx: Context,
  config: Config,
  service: MemesLunaService,
  query: string,
  requestOrigin?: string,
  collectionName?: string,
): Promise<{ redirectTo: string } | null> {
  const rawQuery = query.trim()
  if (!rawQuery) return null

  let images: CachedImage[]
  let invertedIndex: InvertedIndex | null = null

  if (collectionName) {
    images = (await ctx.database.get('memesluna_images', { collection: collectionName })).map(toCachedImage)
    // 合集通常较小：仅在 > 阈值时临时建索引
    if (images.length > SEARCH_INVERTED_INDEX_THRESHOLD) {
      invertedIndex = buildInvertedIndex(images)
    }
  } else {
    images = await getAllImagesCached(ctx)
    invertedIndex =
      images.length > SEARCH_INVERTED_INDEX_THRESHOLD
        ? buildInvertedIndex(images)
        : null
  }

  if (!images.length) return null

  const ranked = rankImagesByQuery(images, rawQuery, invertedIndex)
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
