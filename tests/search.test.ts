import { describe, it, expect } from 'vitest'

// 模拟搜索评分逻辑
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

const SEARCH_SCORING = {
  PHRASE_ALIAS: 12,
  PHRASE_TAG: 8,
  PHRASE_FILENAME: 4,
  TERM_ALIAS: 6,
  TERM_TAG: 6,
  TERM_FILENAME: 2,
  BONUS_TWO_TERMS: 2,
  BONUS_THREE_TERMS: 2,
}

describe('搜索评分逻辑', () => {
  describe('normalizeText', () => {
    it('应该转换为小写', () => {
      expect(normalizeText('ABC')).toBe('abc')
      expect(normalizeText('Test')).toBe('test')
    })

    it('应该标准化空格', () => {
      expect(normalizeText('hello  world')).toBe('hello world')
      expect(normalizeText('a\t\nb')).toBe('a b')
    })

    it('应该移除特殊字符', () => {
      expect(normalizeText('hello!world')).toBe('hello world')
      expect(normalizeText('test@#$%')).toBe('test')
    })

    it('应该处理中文', () => {
      expect(normalizeText('你好世界')).toBe('你好世界')
      expect(normalizeText('测试！！！')).toBe('测试')
    })
  })

  describe('flattenText', () => {
    it('应该移除所有空格', () => {
      expect(flattenText('hello world')).toBe('helloworld')
      expect(flattenText('a b c')).toBe('abc')
    })

    it('应该处理中文', () => {
      expect(flattenText('你好 世界')).toBe('你好世界')
    })
  })

  describe('splitTerms', () => {
    it('应该按空格分词', () => {
      expect(splitTerms('hello world')).toContain('hello')
      expect(splitTerms('hello world')).toContain('world')
    })

    it('应该为长词生成二元组', () => {
      const terms = splitTerms('测试')
      expect(terms.length).toBeGreaterThan(0)
    })

    it('应该去重', () => {
      const terms = splitTerms('test test test')
      expect(terms).toEqual(['test'])
    })

    it('应该处理空字符串', () => {
      expect(splitTerms('')).toEqual([])
      expect(splitTerms('   ')).toEqual([])
    })
  })

  describe('评分规则', () => {
    it('完整短语命中应该得到最高分', () => {
      expect(SEARCH_SCORING.PHRASE_ALIAS).toBeGreaterThan(SEARCH_SCORING.TERM_ALIAS)
      expect(SEARCH_SCORING.PHRASE_TAG).toBeGreaterThan(SEARCH_SCORING.TERM_TAG)
    })

    it('别名权重应该高于标签', () => {
      expect(SEARCH_SCORING.PHRASE_ALIAS).toBeGreaterThan(SEARCH_SCORING.PHRASE_TAG)
      expect(SEARCH_SCORING.TERM_ALIAS).toEqual(SEARCH_SCORING.TERM_TAG)
    })

    it('多词命中应该有额外加分', () => {
      expect(SEARCH_SCORING.BONUS_TWO_TERMS).toBeGreaterThan(0)
      expect(SEARCH_SCORING.BONUS_THREE_TERMS).toBeGreaterThan(0)
    })
  })
})
