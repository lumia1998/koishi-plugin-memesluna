import { Context } from 'koishi'
import { Config } from './config'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getMessageContent } from 'koishi-plugin-chatluna/utils/string'
import { ComputedRef } from 'koishi-plugin-chatluna'
import { parseRawModelName } from 'koishi-plugin-chatluna/llm-core/utils/count_tokens'
import { loadOptionalSharp, loadPhoton } from './service'

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
    if (buffer.length < 30 * 1024 && originalMime !== 'image/gif') {
        return { buffer, mimeType: originalMime }
    }

    const sharp = loadOptionalSharp()
    if (sharp) {
        try {
            const compressed = await sharp(buffer)
                .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 75 })
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
            if (w > 512 || h > 512) {
                const ratio = Math.min(512 / w, 512 / h)
                const newW = Math.round(w * ratio)
                const newH = Math.round(h * ratio)
                const resized = photon.resize(img, newW, newH, photon.SamplingFilter.Nearest)
                img.free()
                img = resized
            }
            const jpegBytes = img.get_bytes_jpeg(75)
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

    constructor(
        private ctx: Context,
        private config: Config
    ) {}

    get model() {
        return this._model
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
                const allCandidates = new Set(
                    (this.config.synonymGroups || [])
                        .flatMap(group => group.split(/[,，]/).map(item => item.trim()).filter(Boolean))
                )
                const validTags = parsed.tags
                    .map(t => t.trim())
                    .filter(t => allCandidates.has(t))
                
                if (validTags.length > 0) {
                    parsed.tags = [validTags[0]]
                } else {
                    let found = false
                    for (const alias of parsed.aliases) {
                        for (const cand of allCandidates) {
                            if (alias.includes(cand)) {
                                parsed.tags = [cand]
                                found = true
                                break
                            }
                        }
                        if (found) break
                    }
                    if (!found) {
                        parsed.tags = []
                    }
                }
                return parsed
            }
        }
        this.ctx.logger.error(`AI标注结果解析失败: ${text}`)
        return null
    }

    async annotate(buffer: Buffer, context?: AnnotateContext): Promise<AnnotateResult | null> {
        if (!this._model?.value) return null
        if (buffer.length === 0) return null

        // 替换 prompt 模板中的上下文变量
        let prompt = this.config.annotatePrompt
        const allCandidates = (this.config.synonymGroups || [])
            .flatMap(group => group.split(/[,，]/).map(item => item.trim()).filter(Boolean))
        prompt = prompt.replaceAll('{{allowed_tags}}', allCandidates.join('、'))

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
                if (parsed) return parsed
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
