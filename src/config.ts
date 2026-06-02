import { Schema } from 'koishi'

export interface QueryParamConfig {
  name: string
  required?: boolean
  defaultValue?: string
  validValues?: string[]
}

export interface ProxySettings {
  imageUrlField?: string
  imageUrlFieldFromParamDefault?: string
  fallbackAction?: 'returnJson' | 'error'
}

export type ForwardMethod = 'redirect' | 'proxy'

export type UrlConstruction =
  | 'normal'
  | 'special_forward'
  | 'special_pollinations'
  | 'special_draw_redirect'

export interface Config {
  backendPath: string
  storagePath?: string
  selfUrl: string
  injectVariables: boolean
  variableRefreshIntervalMs: number
  injectVariablesPrompt: string
}

export const Config: Schema<Config> = Schema.object({
  backendPath: Schema.string()
    .default('/memesluna')
    .description('后端服务路径前缀'),
  selfUrl: Schema.string()
    .default('')
    .description('服务公开地址，不填则优先使用 server.selfUrl'),
  injectVariables: Schema.boolean()
    .default(true)
    .description('是否向 ChatLuna 注入 {{endpoint}} 和 {{memesluna}} 变量'),
  variableRefreshIntervalMs: Schema.number()
    .min(30 * 1000)
    .max(60 * 60 * 1000)
    .default(5 * 60 * 1000)
    .description('变量刷新间隔（毫秒）'),
  injectVariablesPrompt: Schema.string()
    .role('textarea')
    .default(`你可以使用表情包来丰富你的回复。可用的表情包合集如下：

{endpoint}

使用方法：直接用 {base_url} 拼接路径即可，例如 {base_url}/memesluna/yuzu ，访问该URL会自动随机返回一张图片。绝对不要在路径后面添加任何文件名或数字（如 /1.png、/25.png），否则会404。只需要发送合集路径，服务器会自动随机选图。`)
    .description('注入到 ChatLuna {{memesluna}} 变量的提示词模板，支持 {endpoint} 和 {base_url} 占位符'),
})

export const name = 'memesluna'
