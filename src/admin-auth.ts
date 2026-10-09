import type { Context } from 'koishi'

export const ADMIN_AUTHORITY = 1

/** 使用 Console 登录凭据，同时读取当前用户权限和 token 的撤销/到期状态。 */
export async function isAdminToken(ctx: Context, token: unknown): Promise<boolean> {
  if (!ctx.get('auth' as any) || typeof token !== 'string' || !token) return false
  try {
    const database = ctx.database as any
    const tokens = await database.get('token', { token })
    const credential = tokens[0]
    if (!credential || Number(credential.expiredAt) <= Date.now() || !Number.isFinite(Number(credential.expiredAt))) return false
    const users = await database.get('user', { id: credential.id }, ['authority'])
    return Number(users[0]?.authority) >= ADMIN_AUTHORITY
  } catch {
    return false
  }
}

export async function requireConsoleAdmin(ctx: Context, client: any): Promise<void> {
  if (!client?.auth || Number(client.auth.expiredAt) <= Date.now() || !await isAdminToken(ctx, client.auth.token)) {
    throw new Error('Unauthorized: 请启用 Koishi auth 插件并登录有管理权限的 Console 账号')
  }
}

export function adminHttpGuard(ctx: Context) {
  const guard = async (koa: any, next: () => Promise<unknown>) => {
    const header = koa.get('authorization')
    const token = /^Bearer ([^\s]+)$/.exec(header || '')?.[1]
    if (!await isAdminToken(ctx, token)) {
      koa.status = 401
      koa.body = { error: 'Unauthorized' }
      return
    }
    await next()
  }
  // Server 默认会在路由前插入 body parser；拒绝未授权请求必须发生在解析之前。
  ;(guard as any)[Symbol.for('noParseBody')] = true
  return guard
}
