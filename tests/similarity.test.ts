import { describe, expect, it } from 'vitest'
import { groupSimilarImages, HashIndex, hashDistance } from '../src/similarity'

describe('感知哈希精确候选与分组', () => {
  it('跨哈希前缀的近邻在 200 和 201 张时保持同组', () => {
    const pair = [{ perceptualHash: '0000000000000000' }, { perceptualHash: '8000000000000000' }]
    for (const count of [2, 200, 201, 501]) {
      const images = [...pair, ...Array.from({ length: count - 2 }, () => ({ perceptualHash: 'ffffffffffffffff' }))]
      expect(groupSimilarImages(images, 0.9).some((group) => group.items.includes(pair[0]) && group.items.includes(pair[1]))).toBe(true)
    }
  })
  it('不通过相似链把远离代表图的图片加入同组，显示最低代表相似度', () => {
    const items = ['0000000000000000', '000000000000003f', '0000000000000fff'].map((perceptualHash) => ({ perceptualHash }))
    const groups = groupSimilarImages(items, 0.9)
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toEqual(items.slice(0, 2))
    expect(groups[0].similarity).toBe(1 - 6 / 64)
  })
  it('索引检索与暴力汉明距离检索一致', () => {
    const hashes = Array.from({ length: 256 }, (_, i) => (BigInt(i) * 0x123456789abcdn).toString(16).padStart(16, '0'))
    const index = new HashIndex()
    hashes.forEach((hash, i) => index.add(hash, i))
    for (const query of hashes.filter((_, i) => i % 23 === 0)) {
      for (const radius of [0, 6, 16, 32]) expect(index.query(query, radius).sort((a, b) => a - b)).toEqual(hashes.flatMap((hash, i) => hashDistance(hash, query) <= radius ? [i] : []))
    }
  })
})
