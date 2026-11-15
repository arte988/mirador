import { describe, expect, it } from 'vitest'
import { coldDropK, forecastIsCold, forecastIsStale, isGaleForecast, type GaleForecast } from './climateForecast.ts'

const base = (): GaleForecast => ({
  schema: 1,
  zone_id: 'gale',
  generated_at_utc: '2026-11-14T12:00:00Z',
  step: 'sol',
  horizon_steps: 3,
  model: 'google/timesfm-2.5-200m-pytorch',
  license: 'Apache-2.0',
  data_kind: 'prediction',
  shared_point: 'one rover',
  last_measured: { kind: 'measured', sol: 4995, t_air_c: -40, pressure_pa: 750, note: 'midpoint' },
  series: {
    t_air: {
      unit: 'C',
      status: 'prediction',
      q10: [-70, -72, -74],
      q50: [-50, -58, -60],
      q90: [-30, -32, -34],
      mae_timesfm: 2,
      mae_persistence: 4,
      mae_climatology: 5,
      reason: 'beats persistence',
    },
    pressure: {
      unit: 'Pa',
      status: 'unavailable',
      q10: [],
      q50: [],
      q90: [],
      mae_timesfm: 20,
      mae_persistence: 10,
      mae_climatology: 12,
      reason: 'does not beat persistence; quantiles withheld',
    },
  },
  tau_dust: { status: 'unavailable', reason: 'no numeric tau' },
  warnings: [],
})

describe('gale forecast', () => {
  it('rejects a file that is not the Gale schema', () => {
    expect(isGaleForecast(null)).toBe(false)
    expect(isGaleForecast({ schema: 1 })).toBe(false)
    expect(isGaleForecast(base())).toBe(true)
  })
  it('measures the cold drop from the last measured midpoint to the lowest q50', () => {
    expect(coldDropK(base())).toBe(20)
    expect(forecastIsCold(base())).toBe(true)
  })
  it('does not alert when the series was withheld or the drop is under the assumption', () => {
    const f = base()
    f.series.t_air.status = 'unavailable'
    f.series.t_air.q50 = []
    expect(coldDropK(f)).toBeNull()
    expect(forecastIsCold(f)).toBe(false)
    const warm = base()
    warm.series.t_air.q50 = [-42, -41, -40]
    expect(forecastIsCold(warm)).toBe(false)
  })
  it('marks a file older than 48 h as stale', () => {
    const f = base()
    expect(forecastIsStale(f, Date.parse('2026-11-15T12:00:00Z'))).toBe(false)
    expect(forecastIsStale(f, Date.parse('2026-11-17T12:00:00Z'))).toBe(true)
  })
})
