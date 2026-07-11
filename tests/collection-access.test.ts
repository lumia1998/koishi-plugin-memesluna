import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

vi.mock('koishi', () => ({
  Service: class {},
  Eval: {},
}))

import {
  MemesLunaService,
  filterCollectionsByAccess,
  getSessionAccessCandidates,
  isCollectionAccessAllowed,
  normalizeCollectionAccess,
  toCollectionAccessSession,
} from '../src/service'

const roots: string[] = []

async function serviceWithCollection(name = 'legacy') {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memesluna-access-'))
  roots.push(baseDir)
  await fs.mkdir(path.join(baseDir, 'data/memesluna', name), { recursive: true })
  const service = Object.create(MemesLunaService.prototype) as MemesLunaService
  ;(service as any).ctx = { baseDir }
  return { service, dir: path.join(baseDir, 'data/memesluna', name) }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('合集访问策略', () => {
  it('规范化模式及群组列表', () => {
    expect(normalizeCollectionAccess({ mode: 'whitelist', groups: [' a ', '', 'a', 'b'] }))
      .toEqual({ mode: 'whitelist', groups: ['a', 'b'] })
    expect(normalizeCollectionAccess({ mode: 'unknown', groups: ['a'] })).toEqual({ mode: 'disabled', groups: [] })
  })

  it('生成兼容平台前缀的会话候选', () => {
    expect(getSessionAccessCandidates({ platform: 'discord', guildId: 'g1', channelId: 'c1' }))
      .toEqual(['g1', 'c1', 'discord:g1', 'discord:c1'])
  })

  it('私聊默认允许，并正确应用白名单与黑名单', () => {
    expect(isCollectionAccessAllowed({ mode: 'whitelist', groups: ['g1'] }, {})).toBe(true)
    expect(isCollectionAccessAllowed({ mode: 'whitelist', groups: ['g1'] }, { guildId: 'g1' })).toBe(true)
    expect(isCollectionAccessAllowed({ mode: 'whitelist', groups: ['g1'] }, { guildId: 'g2' })).toBe(false)
    expect(isCollectionAccessAllowed({ mode: 'blacklist', groups: ['qq:g1'] }, { platform: 'qq', guildId: 'g1' })).toBe(false)
    expect(isCollectionAccessAllowed({ mode: 'blacklist', groups: ['g1'] }, { guildId: 'g2' })).toBe(true)
  })

  it('isDirect 为 true 时即便有 channelId 也始终允许', () => {
    // 部分群适配器只有 channelId，不能靠缺少 guildId 判断私聊
    expect(isCollectionAccessAllowed(
      { mode: 'whitelist', groups: ['g1'] },
      { channelId: 'dm-channel-1', isDirect: true },
    )).toBe(true)
    expect(isCollectionAccessAllowed(
      { mode: 'blacklist', groups: ['dm-channel-1'] },
      { platform: 'qq', channelId: 'dm-channel-1', isDirect: true },
    )).toBe(true)
    // 非私聊仍按候选匹配
    expect(isCollectionAccessAllowed(
      { mode: 'whitelist', groups: ['g1'] },
      { channelId: 'c1', isDirect: false },
    )).toBe(false)
  })

  it('无文件或非法 JSON 安全回退 disabled', async () => {
    const { service, dir } = await serviceWithCollection()
    await expect(service.getCollectionAccess('legacy')).resolves.toEqual({ mode: 'disabled', groups: [] })
    await fs.writeFile(path.join(dir, '.access.json'), '{broken')
    await expect(service.getCollectionAccess('legacy')).resolves.toEqual({ mode: 'disabled', groups: [] })
  })

  it('在合集目录持久化规范化后的 .access.json', async () => {
    const { service, dir } = await serviceWithCollection('cats')
    await expect(service.setCollectionAccess('cats', { mode: 'blacklist', groups: [' g1 ', 'g1', '', 'g2'] }))
      .resolves.toBe(true)
    expect(JSON.parse(await fs.readFile(path.join(dir, '.access.json'), 'utf8')))
      .toEqual({ mode: 'blacklist', groups: ['g1', 'g2'] })
    await expect(service.getCollectionAccess('cats')).resolves.toEqual({ mode: 'blacklist', groups: ['g1', 'g2'] })
  })

  it('非法 mode 拒绝写入，不静默降级为 disabled', async () => {
    const { service, dir } = await serviceWithCollection('reject-mode')
    await expect(service.setCollectionAccess('reject-mode', { mode: 'unknown' as any, groups: ['g1'] }))
      .rejects.toThrow(/Invalid collection access mode/)
    await expect(fs.access(path.join(dir, '.access.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('原子写入后可正确读取，且失败时不破坏已有 .access.json', async () => {
    const { service, dir } = await serviceWithCollection('atoms')
    const accessPath = path.join(dir, '.access.json')
    await expect(service.setCollectionAccess('atoms', { mode: 'whitelist', groups: ['g1'] })).resolves.toBe(true)
    await expect(service.getCollectionAccess('atoms')).resolves.toEqual({ mode: 'whitelist', groups: ['g1'] })
    expect(JSON.parse(await fs.readFile(accessPath, 'utf8'))).toEqual({ mode: 'whitelist', groups: ['g1'] })

    // 二次原子替换后仍可正确读取
    await expect(service.setCollectionAccess('atoms', { mode: 'blacklist', groups: ['g2'] })).resolves.toBe(true)
    await expect(service.getCollectionAccess('atoms')).resolves.toEqual({ mode: 'blacklist', groups: ['g2'] })

    // 写入失败时不得破坏已有文件：对目标路径注入只读文件，临时文件应被清理
    await fs.chmod(accessPath, 0o444)
    const writeSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('rename failed'))
    await expect(service.setCollectionAccess('atoms', { mode: 'whitelist', groups: ['g3'] })).rejects.toThrow()
    writeSpy.mockRestore()
    await fs.chmod(accessPath, 0o644)
    await expect(service.getCollectionAccess('atoms')).resolves.toEqual({ mode: 'blacklist', groups: ['g2'] })
    const leftovers = (await fs.readdir(dir)).filter((name) => name.includes('.access.json') && name !== '.access.json')
    expect(leftovers).toEqual([])
  })

  it('toCollectionAccessSession 正确识别 isDirect / subtype / 群会话', () => {
    expect(toCollectionAccessSession({ platform: 'qq', guildId: 'g1', channelId: 'c1' }))
      .toEqual({ platform: 'qq', guildId: 'g1', channelId: 'c1', isDirect: undefined })
    expect(toCollectionAccessSession({ platform: 'qq', channelId: 'dm1', isDirect: true }))
      .toEqual({ platform: 'qq', channelId: 'dm1', isDirect: true })
    expect(toCollectionAccessSession({ platform: 'discord', subtype: 'private', channelId: 'dm2' }))
      .toEqual({ platform: 'discord', channelId: 'dm2', isDirect: true })
    expect(toCollectionAccessSession(null)).toEqual({})
  })

  it('filterCollectionsByAccess 按会话过滤合集（list 场景）', () => {
    const items = [
      { name: 'open', access: { mode: 'disabled' as const, groups: [] } },
      { name: 'wl', access: { mode: 'whitelist' as const, groups: ['g1'] } },
      { name: 'bl', access: { mode: 'blacklist' as const, groups: ['g1'] } },
    ]
    expect(filterCollectionsByAccess(items, { guildId: 'g1' }).map((i) => i.name)).toEqual(['open', 'wl'])
    expect(filterCollectionsByAccess(items, { guildId: 'g2' }).map((i) => i.name)).toEqual(['open', 'bl'])
    expect(filterCollectionsByAccess(items, { isDirect: true }).map((i) => i.name)).toEqual(['open', 'wl', 'bl'])
  })

  it('stole 场景：未授权时 isCollectionAccessAllowed 为 false（下载前拒绝）', () => {
    const denied = !isCollectionAccessAllowed(
      { mode: 'whitelist', groups: ['allowed'] },
      toCollectionAccessSession({ platform: 'qq', guildId: 'other' }),
    )
    expect(denied).toBe(true)
    const allowedDm = isCollectionAccessAllowed(
      { mode: 'whitelist', groups: ['allowed'] },
      toCollectionAccessSession({ platform: 'qq', channelId: 'dm', isDirect: true }),
    )
    expect(allowedDm).toBe(true)
  })
})
