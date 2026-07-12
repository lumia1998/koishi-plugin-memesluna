import path from 'path'

export function sanitizeFilename(filename: string): string {
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
    // 截断到安全长度
    while (Buffer.byteLength(base, 'utf8') > maxLen && base.length > 1) {
      base = base.slice(0, -1)
    }
  }

  return `${base}${ext}`
}
