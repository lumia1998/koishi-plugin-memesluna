import { Context } from 'koishi'

/**
 * AI 使用统计跟踪器
 */
export class AIUsageTracker {
  private dailyCount: number = 0
  private currentDay: string = ''
  private warned: boolean = false

  constructor(
    private ctx: Context,
    private dailyLimit: number,
    private warnThreshold: number
  ) {
    this.resetIfNewDay()
  }

  /**
   * 检查是否可以使用 AI
   */
  canUseAI(): { allowed: boolean; reason?: string; remaining?: number } {
    this.resetIfNewDay()

    if (this.dailyLimit === 0) {
      return { allowed: true }
    }

    if (this.dailyCount >= this.dailyLimit) {
      return {
        allowed: false,
        reason: `已达到每日 AI 标注次数上限（${this.dailyLimit}次），请明天再试`,
        remaining: 0,
      }
    }

    return {
      allowed: true,
      remaining: this.dailyLimit - this.dailyCount,
    }
  }

  /**
   * 记录一次 AI 使用
   */
  recordUsage(): void {
    this.resetIfNewDay()
    this.dailyCount++

    // 检查是否需要发出警告
    if (this.dailyLimit > 0 && !this.warned) {
      const usage = this.dailyCount / this.dailyLimit
      if (usage >= this.warnThreshold) {
        this.ctx
          .logger('memesluna')
          .warn(
            `AI 标注用量已达 ${(usage * 100).toFixed(1)}%（${this.dailyCount}/${this.dailyLimit}），接近每日上限`
          )
        this.warned = true
      }
    }
  }

  /**
   * 获取当前统计信息
   */
  getStats(): {
    dailyCount: number
    dailyLimit: number
    remaining: number
    usagePercent: number
  } {
    this.resetIfNewDay()
    const remaining = this.dailyLimit > 0 ? this.dailyLimit - this.dailyCount : Infinity
    const usagePercent =
      this.dailyLimit > 0 ? (this.dailyCount / this.dailyLimit) * 100 : 0

    return {
      dailyCount: this.dailyCount,
      dailyLimit: this.dailyLimit,
      remaining: remaining === Infinity ? -1 : remaining,
      usagePercent,
    }
  }

  /**
   * 重置每日计数（新的一天）
   */
  private resetIfNewDay(): void {
    const today = new Date().toISOString().slice(0, 10)
    if (this.currentDay !== today) {
      this.dailyCount = 0
      this.currentDay = today
      this.warned = false
    }
  }

  /**
   * 更新配置
   */
  updateConfig(dailyLimit: number, warnThreshold: number): void {
    this.dailyLimit = dailyLimit
    this.warnThreshold = warnThreshold
  }
}
