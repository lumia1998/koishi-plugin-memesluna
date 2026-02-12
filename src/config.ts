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
    .description('是否向 ChatLuna 注入 {memesluna}'),
  variableRefreshIntervalMs: Schema.number()
    .min(30 * 1000)
    .max(60 * 60 * 1000)
    .default(5 * 60 * 1000)
    .description('变量刷新间隔（毫秒）'),
  injectVariablesPrompt: Schema.string()
    .role('textarea')
    .default(`picture_url: |
  {
  你可以使用 {memesluna} 提供的路由库存来完成图片 URL 生成。
  规则：
  1) 根据用户意图选择最合适的路径
  2) 对有必填 query 的路由补齐参数
  3) 最终仅输出完整 URL
  基础URL：{base_url}
  路由库存：
  {memesluna}
  }`)
    .description('注入到 ChatLuna 的提示词模板'),
})

export const name = 'memesluna'
