import { describe, expect, it } from 'vitest'
import { evaluateSafety, summarizeWeather, type SafetyInput } from './safety.ts'
import { consumablesForProfile, addDwell, minettiWalkCost, remainingFractions, secondsRemaining, walkSpeedMs, walkingWatts } from './metabolic.ts'
import { lineOfSight } from './los.ts'
import type { CostGrid } from './routing.ts'

const base: SafetyInput = {
  weather: { ageDays: 1, minTempC: -70, maxTempC: -5, uvIndex: 'Moderate', opacity: 'Sunny' },
  space: { hoursSinceSep: null, hoursSinceOther: null, marsImpactSoon: false, unknown: false },
  scenario: { dustStorm: false, sepAlert: false, o2Leak: false },
  stormFlag: false,
  daylightMin: 400,
  routeNeedMin: 180,
}

describe('safety semaphore', () => {
  it('is green with a clear sky', () => {
    expect(evaluateSafety(base).level).toBe('green')
  })
  it('is red for a SEP within 24 h and amber within 72 h', () => {
    expect(evaluateSafety({ ...base, space: { ...base.space!, hoursSinceSep: 5 } }).level).toBe('red')
    expect(evaluateSafety({ ...base, space: { ...base.space!, hoursSinceSep: 50 } }).level).toBe('amber')
    expect(evaluateSafety({ ...base, space: { ...base.space!, hoursSinceSep: 200 } }).level).toBe('green')
  })
  it('is amber for notifications, storms, stale weather and unknown space weather', () => {
    expect(evaluateSafety({ ...base, space: { ...base.space!, hoursSinceOther: 10 } }).level).toBe('amber')
    expect(evaluateSafety({ ...base, stormFlag: true }).level).toBe('amber')
    expect(evaluateSafety({ ...base, weather: { ...base.weather!, ageDays: 30 } }).level).toBe('amber')
    expect(evaluateSafety({ ...base, space: null }).level).toBe('amber')
  })
  it('turns red when scenarios inject an O2 leak or SEP alert', () => {
    expect(evaluateSafety({ ...base, scenario: { ...base.scenario, o2Leak: true } }).level).toBe('red')
    expect(evaluateSafety({ ...base, scenario: { ...base.scenario, sepAlert: true } }).level).toBe('red')
  })
  it('accounts for daylight versus the route need', () => {
    expect(evaluateSafety({ ...base, daylightMin: 100 }).level).toBe('red')
    expect(evaluateSafety({ ...base, daylightMin: 210 }).level).toBe('amber')
  })
  it('always explains itself', () => {
    expect(evaluateSafety(base).reasons.length).toBeGreaterThan(0)
  })
  it('summarizes the NASA weather row', () => {
    const s = summarizeWeather({ terrestrial_date: '2026-08-25', min_temp: '-71', max_temp: '-5', local_uv_irradiance_index: 'Moderate', atmo_opacity: 'Sunny' }, Date.parse('2026-08-27T12:00:00Z'))
    expect(s?.minTempC).toBe(-71)
    expect(s?.ageDays).toBeCloseTo(2, 1)
    expect(summarizeWeather({ min_temp: '--', terrestrial_date: '2026-08-25' })?.minTempC).toBeNull()
  })
})

describe('metabolic model', () => {
  it('matches Minetti at flat grade and is more costly uphill', () => {
    expect(minettiWalkCost(0)).toBeCloseTo(2.5, 5)
    expect(minettiWalkCost(0.2)).toBeGreaterThan(minettiWalkCost(0))
  })
  it('slows down on steep grades', () => {
    expect(walkSpeedMs(0.4)).toBeLessThan(walkSpeedMs(0))
    expect(walkSpeedMs(-0.05)).toBeGreaterThan(walkSpeedMs(0))
    expect(walkingWatts(0.25)).toBeGreaterThan(walkingWatts(0))
  })
  it('burns more O2 on a climb than on flat ground of the same length', () => {
    const d = [0, 100, 200, 300, 400, 500]
    const flat = consumablesForProfile(d, [0, 0, 0, 0, 0, 0])
    const climb = consumablesForProfile(d, [0, 20, 40, 60, 80, 100])
    expect(climb.o2Liters).toBeGreaterThan(flat.o2Liters)
    expect(climb.seconds).toBeGreaterThan(flat.seconds)
  })
  it('tracks remaining fractions and seconds left', () => {
    const c = addDwell(consumablesForProfile([0, 1000], [0, 0]), 15)
    const f = remainingFractions(c)
    expect(f.o2).toBeGreaterThan(0.8)
    expect(secondsRemaining(c)).toBeGreaterThan(3 * 3600)
  })
})

describe('line of sight', () => {
  const g = (): CostGrid => ({
    width: 21, height: 3, factor: 1, west: 0, north: 0, dLon: 1e-4, dLat: 1e-4, cellX: 8, cellY: 8,
    z: new Float32Array(63), slope: new Float32Array(63), rough: new Float32Array(63),
    invalid: new Uint8Array(63), blocked: new Uint8Array(63),
  })
  it('sees across flat ground', () => {
    const grid = g()
    expect(lineOfSight(grid, 1 * 21 + 0, 1 * 21 + 20)).toBe(true)
  })
  it('is blocked by a hill in between', () => {
    const grid = g()
    grid.z[1 * 21 + 10] = 30
    expect(lineOfSight(grid, 1 * 21 + 0, 1 * 21 + 20)).toBe(false)
  })
})
