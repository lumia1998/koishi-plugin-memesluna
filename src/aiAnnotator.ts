import { Context } from 'koishi'
import { Config } from './config'
import { ChatLunaChatModel } from 'koishi-plugin-chatluna/llm-core/platform/model'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { getMessageContent } from 'koishi-plugin-chatluna/utils/string'
import { ComputedRef } from 'koishi-plugin-chatluna'
import { parseRawModelName } from 'koishi-plugin-chatluna/llm-core/utils/count_tokens'

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
        if (!this.config.autoAnnotate) return

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

    private buildImages(
        buffer: Buffer
    ): { data: string; mimeType: string }[] {
        const mimeType = getImageMimeFromBytes(buffer)
        return [{ data: buffer.toString('base64'), mimeType }]
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
                return parsed
            }
        }
        this.ctx.logger.error(`AI标注结果解析失败: ${text}`)
        return null
    }

    async annotate(buffer: Buffer, context?: AnnotateContext): Promise<AnnotateResult | null> {
        if (!this._model?.value || !this.config.autoAnnotate) return null
        if (buffer.length === 0) return null

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

        for (let attempt = 0; attempt < this.config.aiMaxAttempts; attempt++) {
            if (attempt > 0) {
                const delay =
                    this.config.aiBackoffBase * Math.pow(2, attempt)
                await new Promise((resolve) => setTimeout(resolve, delay))
            }

            try {
                const images = this.buildImages(buffer)
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
