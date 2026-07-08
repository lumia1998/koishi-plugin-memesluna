/**
 * MemesLuna 插件常量定义
 */

// ==================== 搜索相关 ====================

/**
 * 语义搜索评分阈值
 * 至少需要一次强相关命中才能进入候选
 */
export const SEARCH_SCORE_THRESHOLD = 6

/**
 * 搜索评分规则
 */
export const SEARCH_SCORING = {
  /** 完整短语命中 aliases */
  PHRASE_ALIAS: 12,
  /** 完整短语命中 tags */
  PHRASE_TAG: 8,
  /** 完整短语命中文件名 */
  PHRASE_FILENAME: 4,
  /** 分词命中 aliases */
  TERM_ALIAS: 6,
  /** 分词命中 tags */
  TERM_TAG: 6,
  /** 分词命中文件名 */
  TERM_FILENAME: 2,
  /** 命中词数不少于 2 个的额外分 */
  BONUS_TWO_TERMS: 2,
  /** 命中词数不少于 3 个的额外分 */
  BONUS_THREE_TERMS: 2,
} as const

// ==================== 缓存相关 ====================

/**
 * 全表图片缓存 TTL（毫秒）
 * 平衡性能和数据新鲜度，5 分钟内的跨合集搜索共享缓存
 */
export const ALL_IMAGES_CACHE_TTL = 5 * 60 * 1000

// ==================== 自动收集相关 ====================

/**
 * 自动收集频率跟踪器最大条目数
 * 防止内存泄漏，超过此值会清理最老的 25% 条目
 */
export const MAX_FREQUENCY_TRACKER_SIZE = 50000

/**
 * 自动收集频率跟踪器清理比例
 * 达到上限时清理的条目比例
 */
export const FREQUENCY_TRACKER_CLEANUP_RATIO = 0.25

// ==================== 标注相关 ====================

/**
 * 标注结果最大别名数量
 */
export const MAX_ALIASES_COUNT = 15

/**
 * 标注结果最大标签数量
 */
export const MAX_TAGS_COUNT = 5

/**
 * 标注结果单项最大长度
 */
export const MAX_ANNOTATION_ITEM_LENGTH = 12

/**
 * 元数据别名最大数量
 */
export const MAX_METADATA_ALIASES = 30

/**
 * 元数据标签最大数量
 */
export const MAX_METADATA_TAGS = 5

/**
 * 元数据单项最大长度
 */
export const MAX_METADATA_ITEM_LENGTH = 24

// ==================== 文件处理相关 ====================

/**
 * AI 标注图片压缩阈值（字节）
 * 超过此大小的图片会被压缩后再发送给 AI
 */
export const AI_IMAGE_COMPRESSION_THRESHOLD = 30 * 1024

/**
 * AI 标注图片目标尺寸
 */
export const AI_IMAGE_TARGET_SIZE = 512

/**
 * AI 标注 JPEG 质量
 */
export const AI_IMAGE_JPEG_QUALITY = 75

// ==================== 感知哈希相关 ====================

/**
 * 差分哈希位数
 */
export const DHASH_BITS = 64

/**
 * 差分哈希计算宽度
 */
export const DHASH_WIDTH = 9

/**
 * 差分哈希计算高度
 */
export const DHASH_HEIGHT = 8

// ==================== 暂缓区相关 ====================

/**
 * 暂缓区自动清理检查间隔（毫秒）
 * 每天检查一次过期图片
 */
export const STAGING_CLEANUP_INTERVAL = 24 * 60 * 60 * 1000

// ==================== 下载重试相关 ====================

/**
 * 图片下载最大重试次数
 */
export const IMAGE_DOWNLOAD_MAX_RETRIES = 3

/**
 * 图片下载超时时间（毫秒）
 */
export const IMAGE_DOWNLOAD_TIMEOUT = 10000

/**
 * 图片下载重试延迟（毫秒）
 */
export const IMAGE_DOWNLOAD_RETRY_DELAY = 1000
