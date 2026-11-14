import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params.ts'
import { abortAdvice, effectiveParams } from './scenarioPlan.ts'
import type { TimelineSample } from './walkPlan.ts'

const none = { dustStorm: false, sepAlert: false, o2Leak: false }

describe('effectiveParams', () => {
  it('returns the same object when no scenario changes the plan', () => {
    expect(effectiveParams(DEFAULT_PARAMS, none)).toBe(DEFAULT_PARAMS)
    expect(effectiveParams(DEFAULT_PARAMS, { ...none, sepAlert: true })).toBe(DEFAULT_PARAMS)
  })
  it('slows the walk in a dust storm and halves supplies on an O2 leak', () => {
    const d = effectiveParams(DEFAULT_PARAMS, { ...none, dustStorm: true })
    expect(d.flatSpeedKmh).toBeLessThan(DEFAULT_PARAMS.flatSpeedKmh)
    expect(d.suitCapacityHours).toBe(DEFAULT_PARAMS.suitCapacityHours)
    const l = effectiveParams(DEFAULT_PARAMS, { ...none, o2Leak: true })
    expect(l.suitCapacityHours).toBe(DEFAULT_PARAMS.suitCapacityHours / 2)
    expect(l.o2UsableKg).toBe(DEFAULT_PARAMS.o2UsableKg / 2)
  })
})

describe('abortAdvice', () => {
  const tl: TimelineSample[] = [0, 1, 2, 3].map((i) => ({ t: i * 1000, d: i * 100, lonLat: [i, 0], z: 0, energyKJ: 0, dwell: false }))
  // Time to the habitat grows with x, the rover is closer from x = 3.
  const hab = (p: [number, number]) => p[0] * 600
  const rover = (p: [number, number]) => (p[0] === 3 ? 100 : p[0] * 900)
  it('picks the sample farthest from any refuge and the nearest refuge there', () => {
    const a = abortAdvice(tl, 5000, hab, rover)!
    expect(a.at.d).toBe(200)
    expect(a.nearest).toBe('habitat')
    expect(a.nearestS).toBe(1200)
    expect(a.marginS).toBe(5000 - 2000 - 1200)
  })
  it('reports a negative margin when the refuge no longer fits', () => {
    expect(abortAdvice(tl, 2500, hab, rover)!.marginS).toBeLessThan(0)
  })
  it('returns null when no sample is reachable', () => {
    expect(abortAdvice(tl, 5000, () => Infinity, () => Infinity)).toBeNull()
  })
})
