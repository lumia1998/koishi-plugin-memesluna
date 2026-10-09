import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

// 同一存储目录的写操作串行化，包括热重载期间的新旧服务实例。
const locks = new Map<string, Promise<unknown>>()

export async function withStorageLock<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(root) || Promise.resolve()
  const next = previous.catch(() => {}).then(operation)
  locks.set(root, next)
  try {
    return await next
  } finally {
    if (locks.get(root) === next) locks.delete(root)
  }
}

/** 文件先移到不可路由的回收目录，数据库失败则恢复。 */
export async function removeWithRollback<T>(root: string, source: string, commit: () => Promise<T>): Promise<T> {
  const trashDir = path.join(root, '.trash')
  await fs.mkdir(trashDir, { recursive: true })
  const trashPath = path.join(trashDir, randomUUID())
  let moved = false
  try {
    await fs.rename(source, trashPath)
    moved = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  let result: T
  try {
    result = await commit()
  } catch (error) {
    if (moved) await fs.rename(trashPath, source)
    throw error
  }
  // 提交后清理失败不应使调用者误以为删除未提交；残留保持在隐藏目录中。
  if (moved) await fs.rm(trashPath, { recursive: true, force: true }).catch(() => {})
  return result
}

export async function unusedFilename(dir: string, filename: string, registered: (name: string) => Promise<boolean>): Promise<string> {
  const parsed = path.parse(filename)
  for (let counter = 0; ; counter++) {
    const candidate = counter ? `${parsed.name}_${counter}${parsed.ext}` : filename
    if (await registered(candidate)) continue
    try {
      await fs.lstat(path.join(dir, candidate))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return candidate
      throw error
    }
  }
}
