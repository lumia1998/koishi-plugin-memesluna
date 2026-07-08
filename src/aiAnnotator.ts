import { Context } from 'koishi'
import { Config } from './config'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getMessageContent } from 'koishi-plugin-chatluna/utils/string'
import { ComputedRef } from 'koishi-plugin-chatluna'
import { parseRawModelName } from 'koishi-plugin-chatluna/llm-core/utils/count_tokens'
import { loadOptionalSharp, loadPhoton } from './service'
import { AIUsageTracker } from './aiUsageTracker'
import {
  MAX_ALIASES_COUNT,
  MAX_TAGS_COUNT,
  MAX_ANNOTATION_ITEM_LENGTH,
  AI_IMAGE_COMPRESSION_THRESHOLD,
  AI_IMAGE_TARGET_SIZE,
  AI_IMAGE_JPEG_QUALITY,
} from './constants'

const tryParse = <T>(text: string): T | null => {
    try {
        return JSON.parse(text.trim())
    } catch {
        return null
    }
}

const extractors = [
    (text: string) => text.trim(),
    (text: string) =>
        text.replace(/```(?:json|JSON)?\s*/g, '').replace(/```\s*$/g, ''),
    (text: string) => {
        const start = text.indexOf('{'),
            end = text.lastIndexOf('}')
        return start !== -1 && end !== -1 && start < end
            ? text.substring(start, end + 1)
            : text
    },
    (text: string) => {
        const start = text.indexOf('{')
        if (start === -1) return text
        let count = 0,
            end = -1
        for (let i = start; i < text.length; i++) {
            if (text[i] === '{') count++
            else if (text[i] === '}' && --count === 0) {
                end = i
                break
            }
        }
        return end !== -1 ? text.substring(start, end + 1) : text
    }
]

export interface AnnotateResult {
    aliases: string[]
    tags: string[]
}

export interface AnnotateContext {
    filename?: string
    collectionName?: string
    imageUrl?: string
}

function normalizeAnnotationList(value: unknown, maxItems: number, maxLength: number): string[] {
    if (!Array.isArray(value)) return []

    const result: string[] = []
    const seen = new Set<string>()

    for (const item of value) {
        if (typeof item !== 'string') continue
        const normalized = item.trim().replace(/\s+/g, ' ')
        if (!normalized || normalized.length > maxLength) continue

        const key = normalized.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        result.push(normalized)

        if (result.length >= maxItems) break
    }

    return result
}

function getImageMimeFromBytes(buffer: Buffer): string {
    if (buffer.length >= 4) {
        // GIF: 47 49 46 38 (GIF8)
        if (
            buffer[0] === 0x47 &&
            buffer[1] === 0x49 &&
            buffer[2] === 0x46 &&
            buffer[3] === 0x38
        ) {
            return 'image/gif'
        }
        // PNG: 89 50 4E 47
        if (
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47
        ) {
            return 'image/png'
        }
        // WEBP: RIFF....WEBP
        if (
            buffer[0] === 0x52 &&
            buffer[1] === 0x49 &&
            buffer[2] === 0x46 &&
            buffer[3] === 0x46 &&
            buffer.length >= 12 &&
            buffer[8] === 0x57 &&
            buffer[9] === 0x45 &&
            buffer[10] === 0x42 &&
            buffer[11] === 0x50
        ) {
            return 'image/webp'
        }
    }
    if (buffer.length >= 3) {
        // JPG: FF D8 FF
        if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
            return 'image/jpeg'
        }
    }
    return 'image/png'
}

async function compressImageForAI(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: string }> {
    const originalMime = getImageMimeFromBytes(buffer)
    // If it's already small and not a GIF, do not compress
    if (buffer.length < AI_IMAGE_COMPRESSION_THRESHOLD && originalMime !== 'image/gif') {
        return { buffer, mimeType: originalMime }
    }

    const sharp = loadOptionalSharp()
    if (sharp) {
        try {
            const compressed = await sharp(buffer)
                .resize(AI_IMAGE_TARGET_SIZE, AI_IMAGE_TARGET_SIZE, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: AI_IMAGE_JPEG_QUALITY })
                .toBuffer()
            return { buffer: compressed, mimeType: 'image/jpeg' }
        } catch (err) {
            // fallback
        }
    }

    const photon = loadPhoton()
    if (photon) {
        let img: any = null
        try {
            img = photon.PhotonImage.new_from_byteslice(new Uint8Array(buffer))
            const w = img.get_width()
            const h = img.get_height()
            if (w > AI_IMAGE_TARGET_SIZE || h > AI_IMAGE_TARGET_SIZE) {
                const ratio = Math.min(AI_IMAGE_TARGET_SIZE / w, AI_IMAGE_TARGET_SIZE / h)
                const newW = Math.round(w * ratio)
                const newH = Math.round(h * ratio)
                const resized = photon.resize(img, newW, newH, photon.SamplingFilter.Nearest)
                img.free()
                img = resized
            }
            const jpegBytes = img.get_bytes_jpeg(AI_IMAGE_JPEG_QUALITY)
            img.free()
            return { buffer: Buffer.from(jpegBytes), mimeType: 'image/jpeg' }
        } catch (err) {
            if (img) {
                try { img.free() } catch {}
            }
        }
    }

    return { buffer, mimeType: originalMime }
}

export class AIAnnotator {
    private _model: ComputedRef<ChatLunaChatModel> | null = null
    private usageTracker: AIUsageTracker

    constructor(
        private ctx: Context,
        private config: Config
    ) {
        this.usageTracker = new AIUsageTracker(
            ctx,
            config.aiDailyLimit,
            config.aiWarnThreshold
        )
    }

    get model() {
        return this._model
    }

    /**
     * 获取 AI 使用统计
     */
    getUsageStats() {
        return this.usageTracker.getStats()
    }

    /**
     * 更新配置
     */
    updateConfig(config: Config): void {
        this.config = config
        this.usageTracker.updateConfig(config.aiDailyLimit, config.aiWarnThreshold)
    }

    async initialize(): Promise<void> {
        if (!this.config.model) return

        try {
            const [platform] = parseRawModelName(this.config.model)
            await this.ctx.chatluna.awaitLoadPlatform(platform)
            this._model = await this.ctx.chatluna.createChatModel(
                this.config.model
            )
            this.ctx.logger.success('AI标注模型加载成功')
        } catch (error) {
            this.ctx.logger.error('AI标注模型加载失败:', error)
        }
    }

    private parseResult(text: string): AnnotateResult | null {
        for (const extractor of extractors) {
            const extracted = extractor(text)
            const parsed = tryParse<AnnotateResult>(extracted)
            if (
                parsed &&
                Array.isArray(parsed.aliases) &&
                Array.isArray(parsed.tags)
            ) {
                const aliases = normalizeAnnotationList(parsed.aliases, MAX_ALIASES_COUNT, MAX_ANNOTATION_ITEM_LENGTH)
                const tags = normalizeAnnotationList(parsed.tags, MAX_TAGS_COUNT, MAX_ANNOTATION_ITEM_LENGTH)
                return { aliases, tags }
            }
        }
        this.ctx.logger.error(`AI标注结果解析失败: ${text}`)
        return null
    }

    async annotate(buffer: Buffer, context?: AnnotateContext): Promise<AnnotateResult | null> {
        if (!this._model?.value) return null
        if (buffer.length === 0) return null

        // 检查 AI 使用配额
        const usageCheck = this.usageTracker.canUseAI()
        if (!usageCheck.allowed) {
            this.ctx.logger.warn(`AI 标注被拒绝: ${usageCheck.reason}`)
            return null
        }

        // 替换 prompt 模板中的上下文变量
        let prompt = this.config.annotatePrompt

        if (context) {
            prompt = prompt
                .replaceAll('{{filename}}', context.filename || '')
                .replaceAll('{{collection_name}}', context.collectionName || '')
                .replaceAll('{{image_url}}', context.imageUrl || '')
        }

        const humanText = context
            ? `请分析这张表情图片（文件名: ${context.filename || '未知'}, 合集: ${context.collectionName || '未知'})`
            : '请分析这张表情图片'

        // 预压缩图片以减小 API 负载并解决大图报错问题
        const compressed = await compressImageForAI(buffer)

        for (let attempt = 0; attempt < this.config.aiMaxAttempts; attempt++) {
            if (attempt > 0) {
                const delay =
                    this.config.aiBackoffBase * Math.pow(2, attempt)
                await new Promise((resolve) => setTimeout(resolve, delay))
            }

            try {
                const images = [{ data: compressed.buffer.toString('base64'), mimeType: compressed.mimeType }]
                const result = await this._model.value.invoke([
                    new SystemMessage(prompt),
                    new HumanMessage({
                        content: [
                            { type: 'text', text: humanText },
                            ...images.map((image) => ({
                                type: 'image_url' as const,
                                image_url: {
                                    url: `data:${image.mimeType};base64,${image.data}`,
                                    detail: 'low' as const
                                }
                            }))
                        ]
                    })
                ])

                const parsed = this.parseResult(
                    getMessageContent(result.content)
                )
                if (parsed) {
                    // 成功标注，记录使用次数
                    this.usageTracker.recordUsage()
                    return parsed
                }
            } catch (error) {
                this.ctx.logger.warn(
                    `AI标注失败 (attempt ${attempt + 1}/${this.config.aiMaxAttempts}):`,
                    error
                )
            }
        }

        return null
    }
}
