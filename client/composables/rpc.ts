import { send } from '@koishijs/client'
import type { MemesLunaConsoleEvents } from '../../src/console-rpc'

type RpcResult<K extends keyof MemesLunaConsoleEvents> = Awaited<ReturnType<MemesLunaConsoleEvents[K]>>

export function sendMemesLuna<K extends keyof MemesLunaConsoleEvents>(
  type: K,
  ...args: Parameters<MemesLunaConsoleEvents[K]>
): Promise<RpcResult<K>> {
  return send(type, ...args)
}
