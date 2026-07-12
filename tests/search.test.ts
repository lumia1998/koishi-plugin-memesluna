import { describe, it, expect } from 'vitest'
import {
  normalizeText,
  flattenText,
  splitTerms,
  rankImagesByQuery,
  toCachedImage,
} from '../src/search'
import { SEARCH_SCORING, SEARCH_SCORE_THRESHOLD } from '../src/constants'

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

  describe('rankImagesByQuery', () => {
    const samples = [
      toCachedImage({
        id: 1,
        filename: 'cat.png',
        aliases: JSON.stringify(['可爱猫咪', '喵喵']),
        tags: JSON.stringify(['动物', '宠物']),
      }),
      toCachedImage({
        id: 2,
        filename: 'dog.jpg',
        aliases: JSON.stringify(['小狗']),
        tags: JSON.stringify(['动物']),
      }),
      toCachedImage({
        id: 3,
        filename: 'empty.webp',
        aliases: '[]',
        tags: '[]',
      }),
    ]

    it('空查询应返回空数组', () => {
      expect(rankImagesByQuery(samples, '')).toEqual([])
      expect(rankImagesByQuery(samples, '   ')).toEqual([])
    })

    it('应按别名短语命中并得到高分', () => {
      const ranked = rankImagesByQuery(samples, '可爱猫咪')
      expect(ranked.length).toBeGreaterThan(0)
      expect(ranked[0].image.id).toBe(1)
      expect(ranked[0].score).toBeGreaterThanOrEqual(SEARCH_SCORE_THRESHOLD)
      // phrase alias + term matches
      expect(ranked[0].score).toBeGreaterThanOrEqual(SEARCH_SCORING.PHRASE_ALIAS)
    })

    it('应按文件名命中', () => {
      const ranked = rankImagesByQuery(samples, 'dog')
      expect(ranked.some((r) => r.image.id === 2)).toBe(true)
    })

    it('无元数据且文件名不匹配时应被跳过', () => {
      const ranked = rankImagesByQuery(samples, '不存在的关键词xyz')
      expect(ranked.every((r) => r.image.id !== 3)).toBe(true)
    })

    it('应按分数降序排序', () => {
      const ranked = rankImagesByQuery(samples, '动物')
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
      }
    })
  })
})
