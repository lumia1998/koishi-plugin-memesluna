import { Schema } from 'koishi'

export interface Config {
  backendPath: string
  storagePath?: string
  selfUrl: string
  injectVariables: boolean
  variableRefreshIntervalMs: number
  injectVariablesPrompt: string
  autoCollect: boolean
  whitelistGroups: string[]
  emojiFrequencyWindowMinutes: number
  emojiFrequencyThreshold: number
  minEmojiSize: number
  maxEmojiSize: number
  groupAutoCollectLimit: number
  similarityThreshold: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
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
  }).description('基础配置'),

  Schema.object({
    autoCollect: Schema.boolean()
      .default(false)
      .description('是否自动监听群聊里的高频图片并放入暂缓区'),
    whitelistGroups: Schema.array(Schema.string())
      .role('table')
      .default([])
      .description('自动暂存群白名单。不填表示监听所有群，填写后仅这些群会参与高频图片统计'),
    emojiFrequencyWindowMinutes: Schema.number()
      .min(1)
      .max(1440)
      .default(10)
      .description('频率统计时间窗口（分钟）'),
    emojiFrequencyThreshold: Schema.number()
      .min(1)
      .max(50)
      .default(3)
      .description('在统计窗口内同一图片出现多少次后放入暂缓区'),
    minEmojiSize: Schema.number()
      .min(1)
      .max(1024)
      .default(50)
      .description('自动暂存图片最小大小（KB）'),
    maxEmojiSize: Schema.number()
      .min(1)
      .max(100)
      .default(15)
      .description('自动暂存图片最大大小（MB）'),
    groupAutoCollectLimit: Schema.number()
      .min(1)
      .max(5000)
      .default(300)
      .description('每个群每天最多自动放入暂缓区的图片数量'),
  }).description('自动暂存配置'),

  Schema.object({
    similarityThreshold: Schema.number()
      .min(0.5)
      .max(1)
      .step(0.01)
      .role('slider')
      .default(0.9)
      .description('暂缓区相似图片筛选阈值，只用于聚类展示，不会自动删除图片'),
  }).description('暂缓区复核配置'),
]) as Schema<Config>

export const name = 'memesluna'

