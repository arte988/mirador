/** Per-request output gate. New requests are blocked until release; cancel discards queued items. */
export interface GateClock {
  now: () => number
  setTimer: (fn: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void
}
export class DelayGate<T> {
  private deadline = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private queue: { item: T; deliver: (item: T) => void }[] = []
  private clock: GateClock
  private onRelease: () => void
  constructor(clock: GateClock, onRelease: () => void) { this.clock = clock; this.onRelease = onRelease }
  begin(delayMs: number): number {
    this.cancel()
    this.deadline = this.clock.now() + Math.max(0, delayMs)
    if (delayMs > 0) this.timer = this.clock.setTimer(() => this.release(), delayMs)
    return this.deadline
  }
  deliver(item: T, deliver: (item: T) => void) {
    if (this.timer === null || this.clock.now() >= this.deadline) {
      if (this.timer !== null) this.release()
      deliver(item)
    } else this.queue.push({ item, deliver })
  }
  private release() {
    if (this.timer === null) return
    this.clock.clearTimer(this.timer); this.timer = null
    const queue = this.queue; this.queue = []
    // Mark released after flushing, so all output retains its original order.
    for (const entry of queue) entry.deliver(entry.item)
    this.onRelease()
  }
  cancel() {
    if (this.timer !== null) this.clock.clearTimer(this.timer)
    this.timer = null; this.queue = []; this.deadline = 0
  }
}
