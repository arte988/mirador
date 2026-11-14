import { describe, expect, it } from 'vitest'
import { earthMarsAU, lightDelay } from './ephemeris.ts'
import { usefulWindow } from './solar.ts'
import { budgetShare, evaDoseMsv } from './dose.ts'

describe('approximate Earth-Mars distance', () => {
  // Reference values from JPL Horizons (Mars as seen from the Earth's center, delta in AU), fetched 14 Nov 2026.
  const horizons: [string, number][] = [
    ['2025-01-12T00:00:00Z', 0.64231],
    ['2026-01-09T00:00:00Z', 2.40387],
    ['2026-11-14T00:00:00Z', 1.32436],
    ['2027-12-01T00:00:00Z', 2.24292],
  ]
  it.each(horizons)('is within 0.01 AU of JPL Horizons at %s', (iso, ref) => {
    expect(Math.abs(earthMarsAU(new Date(iso)) - ref)).toBeLessThan(0.01)
  })
  it('gives about 20 light-minutes one way near the January 2026 solar conjunction', () => {
    const l = lightDelay(new Date('2026-01-09T00:00:00Z'))
    expect(l.oneWayMin).toBeGreaterThan(19.5)
    expect(l.oneWayMin).toBeLessThan(20.5)
  })
  it('stays inside the real range over several synodic cycles', () => {
    let min = Infinity
    let max = 0
    for (let ms = Date.UTC(2020, 0, 1); ms < Date.UTC(2036, 0, 1); ms += 5 * 86400000) {
      const d = earthMarsAU(new Date(ms))
      min = Math.min(min, d)
      max = Math.max(max, d)
    }
    expect(min).toBeGreaterThan(0.37)
    expect(min).toBeLessThan(0.7)
    expect(max).toBeGreaterThan(2.4)
    expect(max).toBeLessThan(2.75)
  })
  it('round trip is twice the one way time', () => {
    const l = lightDelay(new Date('2026-11-14T00:00:00Z'))
    expect(l.roundTripMin).toBeCloseTo(2 * l.oneWayMin, 9)
    expect(l.km).toBeCloseTo(l.au * 149597870.7, 0)
  })
})

describe('useful sun window', () => {
  it('is centered on local noon and shrinks as the limit rises', () => {
    const date = new Date('2026-11-14T12:00:00Z')
    const low = usefulWindow(date, -4.8, 5)
    const high = usefulWindow(date, -4.8, 30)
    expect(low.start! + low.end!).toBeCloseTo(24, 6)
    expect(high.end! - high.start!).toBeLessThan(low.end! - low.start!)
    expect(low.start!).toBeGreaterThan(5)
  })
  it('is empty when the Sun never gets that high', () => {
    expect(usefulWindow(new Date('2026-11-14T12:00:00Z'), -4.8, 89.9).start).toBeNull()
  })
})

describe('dose reference', () => {
  it('scales the published rate by time and compares with the budget', () => {
    expect(evaDoseMsv(86400)).toBeCloseTo(0.64, 9)
    expect(evaDoseMsv(3600 * 6)).toBeCloseTo(0.16, 9)
    expect(evaDoseMsv(-5)).toBe(0)
    expect(budgetShare(0.05, 0.1)).toBeCloseTo(0.5, 9)
    expect(budgetShare(0.05, 0)).toBe(Infinity)
  })
})
