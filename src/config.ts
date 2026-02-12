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
  storagePath: string
  selfUrl: string
  injectVariables: boolean
  variableRefreshIntervalMs: number
  injectVariablesPrompt: string
}

export const Config: Schema<Config> = Schema.object({
  backendPath: Schema.string()
    .default('/memesluna')
    .description('后端服务路径前缀'),
  storagePath: Schema.string()
    .default('data/memesluna')
    .description('本地合集存储目录'),
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
    .default(`可用的图片路由列表：\n{memesluna}\n基础URL：{base_url}\n使用时将基础URL拼接到路径前面，不要添加文件名，直接使用路径即可。`)
    .description('注入到 ChatLuna {{endpoint}} 变量的提示词模板，支持 {memesluna} 和 {base_url} 占位符'),
})

export const name = 'memesluna'
