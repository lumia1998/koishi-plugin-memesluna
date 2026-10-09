import { describe, expect, it } from 'vitest'
import { CollectionPageLoader } from '../client/composables/collectionResources'
import { settledBatch } from '../client/composables/batch'

describe('前端请求及批量操作', () => {
  it('快速切换合集后只接受新请求结果，退出时丢弃结果', async () => {
    let finishOld: (value: any) => void
    const loader = new CollectionPageLoader(async (name) => name === 'old' ? new Promise((resolve) => { finishOld = resolve }) : { items: [], total: 2, offset: 0, limit: 24 })
    const old = loader.load('old', {})
    expect(await loader.load('new', {})).toMatchObject({ total: 2 })
    finishOld!({ items: [], total: 1, offset: 0, limit: 24 })
    expect(await old).toBeNull()
    const exited = loader.load('old', {})
    loader.invalidate()
    finishOld!({ items: [], total: 1, offset: 0, limit: 24 })
    expect(await exited).toBeNull()
  })
  it('批量操作限制并发、保留成功和失败项且等待全部任务结束', async () => {
    let active = 0
    let peak = 0
    const results = await settledBatch([0, 1, 2, 3, 4, 5], async (item) => {
      peak = Math.max(peak, ++active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
      if (item % 2) throw new Error('operation failed')
      return item
    }, 2)
    expect(peak).toBe(2)
    expect(active).toBe(0)
    expect(results.map((item) => item.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'rejected', 'fulfilled', 'rejected'])
  })
})
