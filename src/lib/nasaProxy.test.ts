import { describe, expect, it } from 'vitest'
import { normalizeDonki, normalizeWeather, summarizeBody, respond, type FnResponse } from '../../api/_nasa.ts'
import { summarizeDonki } from './spaceWeather.ts'
import { buildSafetyInput } from './safetyInput.ts'
import { evaluateSafety } from './safety.ts'
import type { DonkiPayload } from './spaceWeather.ts'

const NOW = Date.parse('2026-11-14T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3600000).toISOString()

describe('proxy normalization', () => {
  it('keeps only the newest sols, newest first', () => {
    const soles = Array.from({ length: 40 }, (_, i) => ({ sol: String(100 + i), terrestrial_date: '2026-01-01' }))
    const p = normalizeWeather({ soles }, NOW)
    expect(p.rows).toHaveLength(14)
    expect(p.rows[0].sol).toBe('139')
    expect(p.source).toBe('live')
  })
  it('rejects an empty weather feed instead of pretending it is fine', () => {
    expect(() => normalizeWeather({ soles: [] })).toThrow()
    expect(() => normalizeWeather(null)).toThrow()
  })
  it('drops header lines from DONKI bodies and truncates', () => {
    const body = '## Header line\n##\nA coronal mass ejection was observed.\n' + 'x'.repeat(500)
    const s = summarizeBody(body, 80)
    expect(s.startsWith('A coronal mass ejection')).toBe(true)
    expect(s.length).toBeLessThanOrEqual(80)
  })
  it('extracts only Mars impacts from WSA-ENLIL runs', () => {
    const enlil = [
      { simulationID: 'a', modelCompletionTime: 't', impactList: [{ location: 'Mars', arrivalTime: '2026-11-15T00:00Z', isGlancingBlow: true, isMinorImpact: false }, { location: 'Juno', arrivalTime: '2026-11-15T00:00Z' }] },
      { simulationID: 'b', modelCompletionTime: 't', impactList: null },
    ]
    const p = normalizeDonki([], [], enlil, NOW)
    expect(p.marsImpacts).toHaveLength(1)
    expect(p.marsImpacts[0].glancing).toBe(true)
  })
  it('includes direct, glancing and minor Mars predictions in the amber rule', () => {
    // Real DONKI WSA-ENLIL response entries: https://api.nasa.gov/DONKI/WSAEnlilSimulations?startDate=2024-07-01&endDate=2024-08-01&api_key=DEMO_KEY
    const examples = [
      { simulationID: 'WSA-ENLIL/31778/1', modelCompletionTime: '2024-07-01T13:02Z', impactList: [{ location: 'Mars', arrivalTime: '2024-07-05T06:08Z', isGlancingBlow: false, isMinorImpact: false }] },
      { simulationID: 'WSA-ENLIL/31812/1', modelCompletionTime: '2024-07-03T18:22Z', impactList: [{ location: 'Mars', arrivalTime: '2024-07-07T16:00Z', isGlancingBlow: true, isMinorImpact: false }] },
      { simulationID: 'WSA-ENLIL/32081/1', modelCompletionTime: '2024-07-21T16:56Z', impactList: [{ location: 'Mars', arrivalTime: '2024-07-25T08:00Z', isGlancingBlow: false, isMinorImpact: true }] },
    ]
    for (const sim of examples) {
      const now = Date.parse(sim.impactList[0].arrivalTime) - 3600000
      const normalized = normalizeDonki([], [], [sim], now)
      expect(normalized.marsImpacts[0]).toMatchObject({ glancing: sim.impactList[0].isGlancingBlow, minor: sim.impactList[0].isMinorImpact })
      const summary = summarizeDonki(normalized, now)
      expect(summary.marsImpactSoon).toBe(true)
      expect(evaluateSafety({ weather: { ageDays: 0, minTempC: null, maxTempC: null, uvIndex: null, opacity: null }, space: { ...summary, unknown: false }, scenario: { dustStorm: false, sepAlert: false, o2Leak: false }, stormFlag: false, daylightMin: Infinity, routeNeedMin: 0 }).reasons).toContainEqual({ id: 'mars-impact', level: 'amber', key: 'marsImpact', params: undefined })
    }
  })
  it('answers 502 with no-store when upstream fails', async () => {
    let status = 0
    const headers: Record<string, string> = {}
    const res: FnResponse = { status(c) { status = c; return res }, setHeader(k, v) { headers[k] = v }, json() {} }
    await respond(res, async () => { throw new Error('boom') })
    expect(status).toBe(502)
    expect(headers['Cache-Control']).toBe('no-store')
  })
})

const payload = (over: Partial<DonkiPayload>): DonkiPayload => ({ source: 'live', fetchedAt: NOW, sep: [], notifications: [], marsImpacts: [], ...over })

describe('summarizeDonki', () => {
  it('computes hours since SEP and other activity', () => {
    const s = summarizeDonki(payload({
      sep: [{ sepID: '1', eventTime: hoursAgo(30) }],
      notifications: [{ type: 'CME', id: 'c', url: '', issued: hoursAgo(10), summary: '' }, { type: 'Report', id: 'r', url: '', issued: hoursAgo(1), summary: '' }],
    }), NOW)
    expect(s.hoursSinceSep).toBeCloseTo(30, 3)
    expect(s.hoursSinceOther).toBeCloseTo(10, 3) // the weekly "Report" does not count as activity
  })
  it('flags a Mars impact inside the window only', () => {
    const soon = new Date(NOW + 20 * 3600000).toISOString()
    const later = new Date(NOW + 200 * 3600000).toISOString()
    const m = (arrival: string) => ({ arrival, glancing: false, minor: true, simulationID: 's', modelCompleted: '' })
    expect(summarizeDonki(payload({ marsImpacts: [m(soon)] }), NOW).marsImpactSoon).toBe(true)
    expect(summarizeDonki(payload({ marsImpacts: [m(later)] }), NOW).marsImpactSoon).toBe(false)
  })
})

describe('buildSafetyInput', () => {
  const ctx = {
    weather: { data: { rows: [{ sol: '4995', terrestrial_date: '2026-11-13', min_temp: '-70', max_temp: '-5', pressure: '777', atmo_opacity: 'Sunny', local_uv_irradiance_index: 'Moderate' }], source: 'live' as const, fetchedAt: NOW, disclaimer: '' } },
    space: { data: payload({}), stale: false },
    scenario: { dustStorm: false, sepAlert: false, o2Leak: false },
    stormFlag: false,
    startMs: NOW,
    site: { lon: 137.38, lat: -4.8 },
    routeMinutes: null,
    reserveMin: 30,
    now: NOW,
  }
  it('is green with fresh, calm live data and no route', () => {
    expect(evaluateSafety(buildSafetyInput(ctx)).level).toBe('green')
  })
  it('never says green from a snapshot or a stale cache', () => {
    expect(evaluateSafety(buildSafetyInput({ ...ctx, space: { data: payload({ source: 'snapshot' }), stale: false } })).level).toBe('amber')
    expect(evaluateSafety(buildSafetyInput({ ...ctx, space: { data: payload({}), stale: true } })).level).toBe('amber')
  })
  it('is amber when the weather feed stopped updating', () => {
    const old = { ...ctx.weather, data: { ...ctx.weather.data, rows: [{ ...ctx.weather.data.rows[0], terrestrial_date: '2026-08-25' }] } }
    const r = evaluateSafety(buildSafetyInput({ ...ctx, weather: old }))
    expect(r.level).toBe('amber')
    expect(r.reasons.some((x) => x.id === 'weather-stale')).toBe(true)
  })
  it('turns red for an injected O2 leak even with calm data', () => {
    expect(evaluateSafety(buildSafetyInput({ ...ctx, scenario: { ...ctx.scenario, o2Leak: true } })).level).toBe('red')
  })
})
