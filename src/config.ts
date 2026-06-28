import { Schema } from 'koishi'

export const DEFAULT_ANNOTATE_PROMPT = `你是"二次元表情检索标注助手"。请为表情图/反应图生成高命中检索标注。
只输出 JSON 对象，不要输出任何解释，不要代码块。

上下文：
- 文件名: {{filename}}
- 所在合集: {{collection_name}}
- 图片直链: {{image_url}}

字段要求：

tags: 字符串数组（★ 只能包含 EXACTLY 1 个元素，且必须从候选列表中选择一个，绝对不能使用候选列表外的任何词）
- 候选列表：{{allowed_tags}}

aliases: 字符串数组（辅助检索）
- 至少 6 项检索短语，每项 2~10 字
- 用于合集中的 ?q=关键词 语义搜索
- 包含口语说法、情绪短语、动作短语

约束：
- 以图像事实为准，不要把"幸福"标给明显"无奈/委屈"的图
- 标签(tags)必须在候选列表中选择一个最符合图片情绪或内容的标签，且数组长度必须为 1
- 只返回合法 JSON，格式：{"aliases": [...], "tags": [...]}`

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
  stagingRetentionDays: number
  model: string
  autoAnnotate: boolean
  annotatePrompt: string
  synonymGroups: string[]
  aiConcurrency: number
  aiBatchDelay: number
  aiMaxAttempts: number
  aiBackoffBase: number
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    backendPath: Schema.string()
      .default('/memesluna')
      .description('插件 HTTP 路由的前缀路径，默认 /memesluna，修改后需重启'),
    selfUrl: Schema.string()
      .default('')
      .description('插件对外暴露的完整地址（含协议和端口），留空则自动使用 Koishi server.selfUrl'),
    injectVariables: Schema.boolean()
      .default(true)
      .description('开启后向 ChatLuna 注入 {{endpoint}} 路由列表和 {{memesluna}} 使用说明，让 AI 能发图'),
    variableRefreshIntervalMs: Schema.number()
      .min(30 * 1000)
      .max(60 * 60 * 1000)
      .default(5 * 60 * 1000)
      .description('ChatLuna 变量自动刷新间隔（毫秒），新增合集或路由后最多等待这么久才生效'),
    injectVariablesPrompt: Schema.string()
      .role('textarea')
      .default(`你可以根据自己当前的心情或者动作从标签中选择合适的表情发送，也可以根据需要选择合适的表情包合集或端点。

可用的路由如下：

{endpoint}

使用规则：
- 直接将路径拼接到 {base_url} 后即可，例如 {base_url}/memesluna/开心
- 合集名和标签名不要重名，合集优先匹配
- 只使用上面列出的名称，不要自己编造路径
- 标签路由按情绪跨合集随机返图，合集路由在指定合集内随机，端点路由转发到外部图源
- 合集搜索：{base_url}/memesluna/合集名?q=关键词 可按语义搜索指定合集`)
      .description('注入 ChatLuna 的提示词模板，支持占位符：{endpoint}（路由列表）、{base_url}（服务地址）、{tags}（所有可用标签）'),
  }).description('基础配置'),

  Schema.object({
    autoCollect: Schema.boolean()
      .default(false)
      .description('开启后自动监听群聊消息，高频出现的图片会自动进入暂缓区等待审核'),
    whitelistGroups: Schema.array(Schema.string())
      .role('table')
      .default([])
      .description('自动暂存白名单群号，留空表示监听所有群；填写后只有这些群的图片会被统计'),
    emojiFrequencyWindowMinutes: Schema.number()
      .min(1)
      .max(1440)
      .default(10)
      .description('高频统计的时间窗口（分钟），窗口内同一张图出现次数超过阈值才触发暂存'),
    emojiFrequencyThreshold: Schema.number()
      .min(1)
      .max(50)
      .default(3)
      .description('同一张图在统计窗口内出现几次后放入暂缓区'),
    minEmojiSize: Schema.number()
      .min(1)
      .max(1024)
      .default(50)
      .description('自动暂存的图片最小体积（KB），低于此大小的图片会被忽略'),
    maxEmojiSize: Schema.number()
      .min(1)
      .max(100)
      .default(15)
      .description('自动暂存的图片最大体积（MB），超过此大小的图片会被忽略'),
    groupAutoCollectLimit: Schema.number()
      .min(1)
      .max(5000)
      .default(300)
      .description('每个群每天最多触发自动暂存的图片数量上限，防止刷屏导致暂缓区过大'),
  }).description('自动暂存配置'),

  Schema.object({
    similarityThreshold: Schema.number()
      .min(0.5)
      .max(1)
      .step(0.01)
      .role('slider')
      .default(0.9)
      .description('暂缓区相似图片聚合阈值（0~1），越高越严格，仅用于管理界面分组展示，不会自动删除'),
    stagingRetentionDays: Schema.number()
      .min(0)
      .max(365)
      .default(0)
      .description('暂缓区图片自动过期天数，0 表示永久保留不自动清理'),
  }).description('暂缓区配置'),

  Schema.object({
    model: Schema.dynamic('model')
      .description('AI 标注使用的模型，需已在 ChatLuna 中配置'),
    autoAnnotate: Schema.boolean()
      .default(false)
      .description('上传图片时自动触发 AI 语义标注（生成 tags 和 aliases），需先配置模型'),
    annotatePrompt: Schema.string()
      .role('textarea')
      .default(DEFAULT_ANNOTATE_PROMPT)
      .description('AI 标注的 System 提示词，要求模型输出 { aliases: string[], tags: string[] } 格式 JSON'),
    synonymGroups: Schema.array(Schema.string())
      .role('table')
      .default([
        '幸福,开心,高兴,快乐,治愈,满足',
        '委屈,难过,伤心,沮丧,流泪,大哭',
        '生气,愤怒,炸毛,不爽,恼火,气愤',
        '可爱,萌,卖萌,软萌',
        '害羞,脸红,羞涩,不好意思',
        '无语,尴尬,流汗,擦汗,汗,额',
        '震惊,惊讶,吃惊,吓到,呆住,懵逼,傻眼',
        '疑惑,问号,疑问,不解,纳闷,什么',
        '得意,哈哈,嘲笑,狂妄,神气,叉腰,嚣张',
        '赞,好,棒,点赞,强,厉害,牛逼,给力',
        '贴贴,喜欢,爱你,心动,比心,示爱,抱抱',
        '吃货,吃,美味,饿,零食,喂食,干饭',
        '摆烂,咸鱼,躺平,不想动,无所谓,累了,疲惫',
        '害怕,发抖,瑟瑟发抖,惊恐,怂,慌张',
        '求求,拜托,求你,拜托了',
      ])
      .description('同义词分组，每行一组，组内用逗号（, 或 ，）分隔；同组词会被合并为同一标签，也用于标签路由的跨词匹配'),
    aiConcurrency: Schema.number()
      .min(1).max(10).default(2)
      .description('AI 标注的并发请求数，越大速度越快但对模型负载更高'),
    aiBatchDelay: Schema.number()
      .min(0).max(5000).default(500)
      .description('批量标注时每张图之间的等待时间（毫秒），用于避免触发模型限流'),
    aiMaxAttempts: Schema.number()
      .min(1).max(10).default(3)
      .description('AI 标注失败后的最大重试次数'),
    aiBackoffBase: Schema.number()
      .min(100).max(10000).default(1000)
      .description('重试退避基数（毫秒），每次重试等待时间 = 基数 × 重试次数'),
  }).description('AI 标注配置'),
]) as Schema<Config>

export const name = 'memesluna'

