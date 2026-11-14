import { describe, expect, it } from 'vitest'
import { walkBackSummary, type TimelineSample } from './walkPlan.ts'

const sample = (t: number, x: number): TimelineSample => ({ t, d: x, lonLat: [x, 0], z: 0, energyKJ: 0, dwell: false })

describe('walkBackSummary', () => {
  // The walker moves away along x, and the direct way back takes x * 60 seconds.
  const back = (p: [number, number]) => p[0] * 60

  it('reports no point of no return while the budget always covers the way back', () => {
    const tl = [sample(0, 0), sample(600, 10), sample(1200, 20)]
    const r = walkBackSummary(tl, 6000, back)
    expect(r.pointOfNoReturn).toBeNull()
    expect(r.minMarginS).toBeCloseTo(6000 - 1200 - 1200, 6)
    expect(r.minAt?.d).toBe(20)
  })

  it('flags the first sample where the direct walk back no longer fits', () => {
    const tl = [sample(0, 0), sample(600, 10), sample(1500, 20), sample(2400, 30)]
    const r = walkBackSummary(tl, 3000, back)
    // margins: 3000, 1800, 300, -1200
    expect(r.pointOfNoReturn?.d).toBe(30)
    expect(r.pointOfNoReturn?.backS).toBe(1800)
    expect(r.minMarginS).toBeCloseTo(-1200, 6)
  })

  it('ignores samples with an unknown way back (Infinity) instead of reporting nonsense', () => {
    const r = walkBackSummary([sample(0, 0), sample(100, 5)], 1000, (p) => (p[0] === 0 ? 0 : Infinity))
    expect(r.minMarginS).toBe(1000)
    expect(r.pointOfNoReturn).toBeNull()
  })
})
