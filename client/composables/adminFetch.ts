import { store } from '@koishijs/client'

export function adminFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = (store as any).user?.token
  if (!token) return Promise.reject(new Error('请先登录 Koishi Console'))
  // 凭据仅发送到承载 Console 的同源服务。
  if (new URL(url, window.location.href).origin !== window.location.origin) {
    return Promise.reject(new Error('管理请求必须与 Console 同源'))
  }
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...options, headers })
}
