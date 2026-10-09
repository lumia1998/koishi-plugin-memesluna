import { send } from '@koishijs/client'
import type { MemesLunaConsoleEvents } from '../../src/console-rpc'

type RpcResult<K extends keyof MemesLunaConsoleEvents> = Awaited<ReturnType<MemesLunaConsoleEvents[K]>>

export function sendMemesLuna<K extends keyof MemesLunaConsoleEvents>(
  type: K,
  ...args: Parameters<MemesLunaConsoleEvents[K]>
): Promise<RpcResult<K>> {
  const response = send(type, ...args)
  if (!response) return Promise.reject(new Error('Koishi Console 尚未连接'))
  return response as Promise<RpcResult<K>>
}
