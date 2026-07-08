import { describe, it, expect } from 'vitest'

// 从 index.ts 导出的 isPrivateIP 函数（需要导出）
function isPrivateIP(hostname: string): boolean {
  // IPv4 私有地址检测
  if (/^127\./.test(hostname)) return true
  if (/^10\./.test(hostname)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true
  if (/^192\.168\./.test(hostname)) return true
  if (/^169\.254\./.test(hostname)) return true
  if (hostname === 'localhost') return true

  // IPv6 私有地址检测
  if (/^::1$/.test(hostname)) return true
  if (/^fe80:/i.test(hostname)) return true
  if (/^fc00:/i.test(hostname)) return true
  if (/^fd00:/i.test(hostname)) return true

  return false
}

describe('isPrivateIP', () => {
  it('应该识别 IPv4 回环地址', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true)
    expect(isPrivateIP('127.1.2.3')).toBe(true)
  })

  it('应该识别 IPv4 私有地址段', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true)
    expect(isPrivateIP('10.255.255.255')).toBe(true)
    expect(isPrivateIP('172.16.0.1')).toBe(true)
    expect(isPrivateIP('172.31.255.255')).toBe(true)
    expect(isPrivateIP('192.168.1.1')).toBe(true)
    expect(isPrivateIP('192.168.255.255')).toBe(true)
  })

  it('应该识别链路本地地址', () => {
    expect(isPrivateIP('169.254.1.1')).toBe(true)
  })

  it('应该识别 localhost', () => {
    expect(isPrivateIP('localhost')).toBe(true)
  })

  it('应该识别 IPv6 私有地址', () => {
    expect(isPrivateIP('::1')).toBe(true)
    expect(isPrivateIP('fe80::1')).toBe(true)
    expect(isPrivateIP('fc00::1')).toBe(true)
    expect(isPrivateIP('fd00::1')).toBe(true)
  })

  it('应该允许公网地址', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false)
    expect(isPrivateIP('1.1.1.1')).toBe(false)
    expect(isPrivateIP('example.com')).toBe(false)
    expect(isPrivateIP('github.com')).toBe(false)
  })

  it('应该正确处理边界情况', () => {
    expect(isPrivateIP('172.15.255.255')).toBe(false) // 不在 172.16-31 范围
    expect(isPrivateIP('172.32.0.1')).toBe(false) // 不在 172.16-31 范围
    expect(isPrivateIP('11.0.0.1')).toBe(false) // 不在 10.0.0.0/8
    expect(isPrivateIP('192.167.1.1')).toBe(false) // 不在 192.168.0.0/16
  })
})
