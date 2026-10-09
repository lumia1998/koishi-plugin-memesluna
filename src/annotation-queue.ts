import { abortableDelay } from './annotation-scheduler'

type Outcome = 'success' | 'fail' | 'skipped' | 'cancelled'

export class AnnotationQueue {
  private chain: Promise<unknown> = Promise.resolve()
  private cancellation = new AbortController()
  private closed = false
  readonly stats = { pending: 0, active: 0, success: 0, fail: 0, skipped: 0, cancelled: 0 }

  cancel() { this.cancellation.abort(); this.cancellation = new AbortController() }
  dispose() { this.closed = true; this.cancellation.abort() }

  enqueue<T>(rows: T[], concurrency: number, process: (row: T, signal: AbortSignal) => Promise<Outcome>, delay: number,
    progress?: (success: number, fail: number) => void | Promise<void>, onError?: (error: unknown) => void) {
    const signal = this.cancellation.signal
    this.stats.pending += rows.length
    const run = async () => {
      const result = { success: 0, fail: 0, skipped: 0, cancelled: 0 }
      let cursor = 0
      await Promise.all(Array.from({ length: Math.min(Math.max(1, Math.floor(concurrency)), rows.length) }, async () => {
        while (cursor < rows.length) {
          const row = rows[cursor++]
          this.stats.pending--
          this.stats.active++
          let outcome: Outcome
          try { outcome = this.closed || signal.aborted ? 'cancelled' : await process(row, signal) }
          catch (error) { outcome = signal.aborted ? 'cancelled' : 'fail'; onError?.(error) }
          finally { this.stats.active-- }
          result[outcome]++
          this.stats[outcome]++
          try { await progress?.(result.success, result.fail) } catch (error) { onError?.(error) }
          if (!signal.aborted && cursor < rows.length && delay > 0) await abortableDelay(delay, signal).catch(() => {})
        }
      }))
      return result
    }
    const next = this.chain.then(run, run)
    this.chain = next.catch(() => {})
    return next
  }
}
