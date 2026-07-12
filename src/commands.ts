import { Context, h } from 'koishi'
import type { Config } from './config'
import { downloadImage } from './download'
import { getExtFromMagicBytes } from './image-format'

export function registerCommands(ctx: Context, config: Config) {
  const root = ctx.command('memesluna', 'MemesLuna 命令')

  root
    .subcommand('.list', '查看当前可用表情路由')
    .action(async ({ session }) => {
      const service = ctx.memesluna
      await service.ready

      const [collectionNames, endpoints] = await Promise.all([
        service.getCollections(),
        service.getEndpoints(),
      ])

      const collectionInfos = (
        await Promise.all(collectionNames.map((collectionName) => service.getCollectionInfo(collectionName)))
      ).filter((info): info is NonNullable<typeof info> => !!info?.hasContent)

      const lines: string[] = collectionInfos
        .map((info) => `${info.name} ${info.name}表情包`)

      for (const endpoint of endpoints) {
        const endpointLabel = endpoint.description || `${endpoint.name}端点`
        lines.push(`${endpoint.name} ${endpointLabel}`)
      }

      if (!lines.length) {
        return '暂无可用表情路由'
      }

      return lines.join('\n')
    })

  const stoleAction = async (session: any, name: string) => {
    if (!session) return
    if (!name) {
      return '使用方式：引用图片并回复 "偷了 [表情包名称]" 或 "memesluna stole [表情包名称]"'
    }

    const service = ctx.memesluna
    await service.ready

    try {
      if (!(await service.collectionExists(name))) {
        return `表情包合集 "${name}" 不存在，请先在 Koishi Console 的 MemesLuna 页面创建。`
      }
    } catch (err) {
      return `检查表情包失败: ${(err as Error).message}`
    }

    let imageUrls: string[] = []
    if (session.quote) {
      const images = h.select(session.quote.content, 'image')
      imageUrls = images.map((img) => img.attrs.url || img.attrs.src).filter(Boolean)
    } else {
      const images = h.select(session.elements || [], 'image')
      imageUrls = images.map((img) => img.attrs.url || img.attrs.src).filter(Boolean)
    }

    if (!imageUrls.length) {
      return '没有找到要偷的图片。请引用包含图片的聊天记录，或者在发送图片的同时回复 "偷了 [表情包名称]"'
    }

    let successCount = 0
    let incompatibleCount = 0
    let failedCount = 0
    const savedFilenames: string[] = []
    const rowsToAnnotate: any[] = []

    for (const url of imageUrls) {
      try {
        const buffer = await downloadImage(ctx, url, 50 * 1024 * 1024)
        const ext = getExtFromMagicBytes(buffer)
        if (!ext) {
          incompatibleCount++
          continue
        }

        const result = await service.addLocalImageBuffer(name, buffer, `stole${ext}`)
        savedFilenames.push(result.filename)
        rowsToAnnotate.push({
          id: result.id,
          collection: name,
          filename: result.filename,
        })
        successCount++
      } catch (err) {
        failedCount++
        ctx.logger('memesluna').error(`Failed to steal image from URL: ${url}`, err)
      }
    }

    if (successCount === 0) {
      if (incompatibleCount > 0 && failedCount === 0) {
        return '偷表情包失败，图片格式不兼容。仅支持 JPG/PNG/GIF/WEBP/BMP 格式图片（已拒绝 AVIF，且不会放入暂缓区）。'
      }
      return '偷表情包失败，下载图片或上传保存时发生错误。'
    }

    if (service.annotator && rowsToAnnotate.length > 0) {
      void service.queueAnnotation(rowsToAnnotate)
    }

    const skippedHints = [
      incompatibleCount ? `跳过 ${incompatibleCount} 张格式不兼容图片` : '',
      failedCount ? `${failedCount} 张下载或保存失败` : '',
    ].filter(Boolean)
    const skippedText = skippedHints.length ? `（${skippedHints.join('，')}）` : ''

    return `成功偷了 ${successCount} 张表情包存入表情包 "${name}"！${skippedText}新文件名：${savedFilenames.join(', ')}`
  }

  root
    .subcommand('.stole <name:string>', '偷取引用消息中的图片并存入指定表情包')
    .action(async ({ session }, name) => {
      return await stoleAction(session, name)
    })

  root
    .subcommand('.tagall', '批量为以往的图片自动进行 AI 语义打标', { authority: 3 })
    .option('force', '-f 强制为已打标的图片重新进行 AI 标注')
    .action(async ({ session, options }) => {
      const service = ctx.memesluna
      await service.ready
      const annotator = service.annotator
      if (!annotator) return 'AI 标注器未就绪，请先在配置中指定模型（model）。'

      const images = await ctx.database.get('memesluna_images', {})
      const force = !!options?.force
      const targets = images.filter((img) => {
        if (force) return true
        let tags: string[] = []
        try { const p = JSON.parse(img.tags || '[]'); tags = Array.isArray(p) ? p : [] } catch {}
        return tags.length === 0
      })

      if (targets.length === 0) {
        return '没有发现需要标注的图片。'
      }

      if (session) {
        await session.send(`开始批量为 ${targets.length} 张图片进行 AI 自动标注，这可能需要一些时间，请稍候...`)
      }

      let successCount = 0
      let failCount = 0
      const chunkSize = 20

      for (let i = 0; i < targets.length; i += chunkSize) {
        const chunk = targets.slice(i, i + chunkSize)
        if (session) {
          await session.send(`正在处理第 ${i + 1} ~ ${Math.min(i + chunkSize, targets.length)} 张图片（当前成功：${successCount}，失败：${failCount}）...`)
        }

        // 预筛选已按 force/空 tags 决定目标；此处 force:true 跳过队列内二次检查，
        // 与旧 tagall 行为一致（仅看 tags 是否为空时仍会标注已有 aliases 的图）
        const result = await service.queueAnnotation(chunk, { force: true })
        successCount += result.success
        failCount += result.fail
      }

      return `批量 AI 标注已完成！\n成功：${successCount} 张\n失败：${failCount} 张`
    })

  root
    .subcommand('.untagall', '一键清空表情图片的标签', { authority: 3 })
    .alias('.cleartags')
    .option('collection', '-c <collection:string> 仅清空指定合集的图片标签')
    .action(async ({ session, options }) => {
      const service = ctx.memesluna
      await service.ready

      const filter: any = {}
      if (options?.collection) {
        const hasCol = await service.collectionExists(options.collection)
        if (!hasCol) {
          return `表情包合集 "${options.collection}" 不存在。`
        }
        filter.collection = options.collection
      }

      const images = await ctx.database.get('memesluna_images', filter)
      const targets = images.filter((img) => {
        let tags: string[] = []
        try { const p = JSON.parse(img.tags || '[]'); tags = Array.isArray(p) ? p : [] } catch {}
        return tags.length > 0
      })

      if (targets.length === 0) {
        return '没有发现需要清空标签的图片。'
      }

      if (session) {
        await session.send(`开始清空 ${targets.length} 张表情图片的标签，请稍候...`)
      }

      let successCount = 0
      for (const row of targets) {
        try {
          await service.updateImageAnnotation(row.id, undefined, [])
          successCount++
        } catch (err) {
          ctx.logger('memesluna').error(`Failed clearing tag for ${row.filename}:`, err)
        }
      }

      return `已成功清空 ${successCount} 张表情图片的标签！`
    })
}
