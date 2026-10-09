interface Task<T = unknown> {
  operation: (signal: AbortSignal) => Promise<T>
  signal: AbortSignal
  timeout: number
  resolve: (value: T) => void
  reject: (error: Error) => void
  removeQueuedListener?: () => void
  deadline: number
  queuedTimer?: ReturnType<typeof setTimeout>
}

/** 取消后仍等待底层请求结束才释放槽位，所有标注入口共享并发上限。 */
export class AnnotationScheduler {
  private queue: Task<any>[] = []
  private active = 0
  constructor(private concurrency: () => number) {}
  get stats() { return { active: this.active, pending: this.queue.length } }

  run<T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, timeout: number): Promise<T> {
    if (signal.aborted) return Promise.reject(new Error('Annotation cancelled'))
    return new Promise((resolve, reject) => {
      const task: Task<T> = { operation, signal, timeout, resolve, reject, deadline: Date.now() + timeout }
      const removeQueued = (error: Error) => {
        const index = this.queue.indexOf(task)
        if (index < 0) return
        this.queue.splice(index, 1)
        clearTimeout(task.queuedTimer)
        task.removeQueuedListener?.()
        reject(error)
      }
      const cancelQueued = () => removeQueued(new Error('Annotation cancelled'))
      signal.addEventListener('abort', cancelQueued, { once: true })
      task.removeQueuedListener = () => signal.removeEventListener('abort', cancelQueued)
      this.queue.push(task)
      task.queuedTimer = setTimeout(() => removeQueued(new Error('AI request timed out waiting for a slot')), timeout)
      this.drain()
    })
  }

  private drain() {
    while (this.queue.length && this.active < Math.max(1, Math.floor(this.concurrency()))) {
      const task = this.queue.shift()!
      task.removeQueuedListener?.()
      clearTimeout(task.queuedTimer)
      if (task.signal.aborted) { task.reject(new Error('Annotation cancelled')); continue }
      this.active++
      const controller = new AbortController()
      const cancel = () => { controller.abort(); task.reject(new Error('Annotation cancelled')) }
      task.signal.addEventListener('abort', cancel, { once: true })
      const timer = setTimeout(() => { controller.abort(); task.reject(new Error('AI request timed out')) }, Math.max(0, task.deadline - Date.now()))
      Promise.resolve().then(() => task.operation(controller.signal)).then(task.resolve, task.reject).finally(() => {
        clearTimeout(timer)
        task.signal.removeEventListener('abort', cancel)
        this.active--
        this.drain()
      })
    }
  }
}

export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Annotation cancelled'))
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new Error('Annotation cancelled')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve() }, ms)
    signal.addEventListener('abort', cancel, { once: true })
  })
}
