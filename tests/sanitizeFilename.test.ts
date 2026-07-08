import { describe, it, expect } from 'vitest'
import path from 'path'

// 复制 sanitizeFilename 函数以避免依赖 Koishi
function sanitizeFilename(filename: string): string {
  // 先提取扩展名
  const ext = path.extname(filename).toLowerCase()

  // 移除扩展名后的部分
  let base = ext ? filename.slice(0, filename.length - ext.length) : filename

  // 过滤危险字符（将路径分隔符也替换）
  base = base.replace(/[\s/\\?%*:|"<>,;=@]+/g, '_')

  // 移除前导/尾随点和下划线
  base = base.replace(/^[._]+|[._]+$/g, '')

  // 如果清理后为空，使用随机名
  if (!base) {
    base = `file_${Date.now()}`
  }

  // Windows 保留名检查
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i
  if (reserved.test(base)) {
    base = `_${base}`
  }

  // 限制长度（255字节 - 扩展名 - 余量）
  const maxLen = 200 - ext.length
  if (Buffer.byteLength(base, 'utf8') > maxLen) {
    while (Buffer.byteLength(base, 'utf8') > maxLen && base.length > 1) {
      base = base.slice(0, -1)
    }
  }

  return `${base}${ext}`
}

describe('sanitizeFilename', () => {
  it('应该保留正常的文件名', () => {
    expect(sanitizeFilename('test.png')).toBe('test.png')
    expect(sanitizeFilename('image_001.jpg')).toBe('image_001.jpg')
  })

  it('应该替换危险字符为下划线', () => {
    expect(sanitizeFilename('test/file.png')).toBe('test_file.png')
    expect(sanitizeFilename('image:name.jpg')).toBe('image_name.jpg')
    expect(sanitizeFilename('file|with|pipes.png')).toBe('file_with_pipes.png')
  })

  it('应该移除前导和尾随的点和下划线', () => {
    expect(sanitizeFilename('...test.png')).toBe('test.png')
    expect(sanitizeFilename('___test___.jpg')).toBe('test.jpg')
    expect(sanitizeFilename('.hidden.png')).toBe('hidden.png')
  })

  it('应该处理 Windows 保留名', () => {
    expect(sanitizeFilename('CON.txt')).toBe('_CON.txt')
    expect(sanitizeFilename('PRN.jpg')).toBe('_PRN.jpg')
    expect(sanitizeFilename('AUX.png')).toBe('_AUX.png')
    expect(sanitizeFilename('NUL.gif')).toBe('_NUL.gif')
    expect(sanitizeFilename('COM1.txt')).toBe('_COM1.txt')
    expect(sanitizeFilename('LPT1.txt')).toBe('_LPT1.txt')
  })

  it('应该为空文件名生成默认名称', () => {
    // 完全空的文件名
    const result1 = sanitizeFilename('')
    expect(result1).toMatch(/^file_\d+$/)

    // 只有危险字符的文件名
    const result2 = sanitizeFilename('///')
    expect(result2).toMatch(/^file_\d+$/)

    // 只有下划线和点的文件名（会保留扩展名）
    const result3 = sanitizeFilename('._.')
    expect(result3).toMatch(/^file_\d+\.$/)
  })

  it('应该截断过长的文件名', () => {
    const longName = 'a'.repeat(300) + '.png'
    const result = sanitizeFilename(longName)
    expect(Buffer.byteLength(result, 'utf8')).toBeLessThanOrEqual(204) // 200 + .png
  })

  it('应该处理中文文件名', () => {
    expect(sanitizeFilename('测试图片.png')).toBe('测试图片.png')
    expect(sanitizeFilename('表情包-001.jpg')).toBe('表情包-001.jpg')
  })

  it('应该处理多个连续的危险字符', () => {
    expect(sanitizeFilename('test///file.png')).toBe('test_file.png')
    expect(sanitizeFilename('image:::name.jpg')).toBe('image_name.jpg')
  })
})
