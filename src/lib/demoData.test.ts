import { describe, expect, it } from 'vitest'
import { analogWeatherFromOpenMeteo, mslSol, simulatedSpace, simulatedWeather, uvCategory } from './demoData.ts'
import { buildSafetyInput } from './safetyInput.ts'
import { evaluateSafety } from './safety.ts'
import { nextLtst } from './solar.ts'

const NOW = Date.parse('2026-11-14T12:00:00Z')
const GALE = { lon: 137.3845, lat: -4.8035 }

describe('rehearsal and analog data', () => {
  it('computes the MSL sol like the NASA feed (sol 4995 on 2026-08-25)', () => {
    const s = mslSol(Date.parse('2026-08-25T12:00:00Z'))
    expect(Math.abs(s - 4995)).toBeLessThanOrEqual(1)
  })
  it('maps WHO UV categories', () => {
    expect([1, 4, 7, 9, 12].map(uvCategory)).toEqual(['Low', 'Moderate', 'High', 'Very High', 'Extreme'])
  })
  it('converts Open-Meteo to the weather row (hPa to Pa) and labels it analog', () => {
    const f = analogWeatherFromOpenMeteo({ current: { temperature_2m: 3, surface_pressure: 860.4, cloud_cover: 80 }, daily: { temperature_2m_max: [9.4], temperature_2m_min: [-2.2], uv_index_max: [2.1] } }, NOW)
    expect(f.source).toBe('analog')
    expect(f.rows[0].pressure).toBe('86040')
    expect(f.rows[0].atmo_opacity).toBe('Cloudy')
    expect(f.rows[0].local_uv_irradiance_index).toBe('Low')
    expect(f.disclaimer).toMatch(/not Mars/i)
  })
  it('rejects an incomplete analog response', () => {
    expect(() => analogWeatherFromOpenMeteo({ current: {} })).toThrow()
  })
  it('simulated data are labeled and give a green light at a daytime start, but still react to scenarios', () => {
    const start = nextLtst(new Date(NOW), GALE.lon, 10).getTime()
    const ctx = {
      weather: { data: simulatedWeather(NOW) },
      space: { data: simulatedSpace(NOW), stale: false },
      scenario: { dustStorm: false, sepAlert: false, o2Leak: false },
      stormFlag: false,
      startMs: start,
      site: GALE,
      routeMinutes: 150,
      reserveMin: 30,
      now: NOW,
    }
    expect(simulatedWeather(NOW).source).toBe('simulated')
    expect(simulatedSpace(NOW).source).toBe('simulated')
    expect(evaluateSafety(buildSafetyInput(ctx)).level).toBe('green')
    expect(evaluateSafety(buildSafetyInput({ ...ctx, scenario: { ...ctx.scenario, sepAlert: true } })).level).toBe('red')
  })
})
