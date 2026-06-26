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

使用方法：
- 合集名路由：{base_url}/memesluna/合集名 自动随机返回该合集的图片
- 标签名路由：{base_url}/memesluna/标签名 按标签跨合集随机返回图片（可用标签如：{tags}）
- 合集搜索：{base_url}/memesluna/合集名?q=关键词 在合集中按语义搜索
- 特定图片路由：{base_url}/memesluna/合集名/图片名.后缀（例如：如果合集 kipfel 里有图片 1.jpg，可以输出 {base_url}/memesluna/kipfel/1.jpg）

重要输出要求：
1. 请直接输出图片地址（URL 链接），绝对不要使用 Markdown 图片语法，也不要任何前缀或描述包装。
2. 例如：如果你想发送“开心”标签下的表情包，请在回复中直接包含 {base_url}/memesluna/开心 这样的纯文本链接，而不要写成 ![开心]({base_url}/memesluna/开心)。
3. 合集名和标签名不要重名，合集优先匹配。只使用上面列出的合集名和标签名，不要自己编造路径。`)
      .description('注入到 ChatLuna {{memesluna}} 变量的提示词模板，支持 {endpoint}、{base_url} 和 {tags} 占位符'),
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
    stagingRetentionDays: Schema.number()
      .min(0)
      .max(365)
      .default(0)
      .description('暂缓区图片自动清理天数，0 表示永不自动清理'),
  }).description('暂缓区复核配置'),

  Schema.object({
    model: Schema.dynamic('model')
      .description('用于 AI 标注的模型'),
    autoAnnotate: Schema.boolean()
      .default(false)
      .description('上传图片时是否自动进行 AI 语义标注'),
    annotatePrompt: Schema.string()
      .role('textarea')
      .default(DEFAULT_ANNOTATE_PROMPT)
      .description('AI 标注提示词模板，要求输出 aliases 和 tags 两个字段的 JSON'),
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
      .description('搜索同义词组，每行填写一组同义词，词与词之间用逗号（, 或 ，）隔开'),
    aiConcurrency: Schema.number()
      .min(1).max(10).default(2)
      .description('AI 标注并发数'),
    aiBatchDelay: Schema.number()
      .min(0).max(5000).default(500)
      .description('AI 批次间延迟（毫秒）'),
    aiMaxAttempts: Schema.number()
      .min(1).max(10).default(3)
      .description('AI 标注最大重试次数'),
    aiBackoffBase: Schema.number()
      .min(100).max(10000).default(1000)
      .description('AI 重试退避基数（毫秒）'),
  }).description('AI 标注配置'),
]) as Schema<Config>

export const name = 'memesluna'

