/** Clicks closer than this to the previous vertex are the same spot. */
export const DRAW_CLICK_MIN_PX = 3
/** Clicks closer than this in time are one gesture, not a new vertex. */
export const DRAW_CLICK_GAP_MS = 300

export function drawClickDecision(opts: {
  detail: number
  now: number
  lastClickAt: number
  pixel: [number, number] | null
  previousPixel: [number, number] | null
}): 'add' | 'ignore' {
  if (opts.detail > 1) return 'ignore'
  if (opts.lastClickAt > 0 && opts.now - opts.lastClickAt < DRAW_CLICK_GAP_MS) return 'ignore'
  if (opts.pixel && opts.previousPixel) {
    const d = Math.hypot(opts.pixel[0] - opts.previousPixel[0], opts.pixel[1] - opts.previousPixel[1])
    if (d < DRAW_CLICK_MIN_PX) return 'ignore'
  }
  return 'add'
}
