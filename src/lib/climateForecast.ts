/**
 * Gale forecast file written by scripts/climate/forecast.py.
 * TimesFM quantiles are published only when they beat persistence. This module never invents them.
 * The cold-drop threshold is a planning assumption, not a flight rule.
 */

export const FORECAST_DROP_K = 15
export const FORECAST_STALE_H = 48
export const FORECAST_URL = '/forecasts/gale.json'

export interface ForecastSeries {
  unit: string
  status: 'prediction' | 'unavailable'
  q10: number[]
  q50: number[]
  q90: number[]
  mae_timesfm: number | null
  mae_persistence: number | null
  mae_climatology: number | null
  holdout_sols?: number
  reason: string
}

export interface GaleForecast {
  schema: 1
  zone_id: 'gale'
  generated_at_utc: string
  step: 'sol'
  horizon_steps: number
  model: string | null
  license: string
  data_kind: 'prediction' | 'unavailable'
  shared_point: string
  last_measured: {
    kind: 'measured'
    sol: number
    t_air_c: number
    pressure_pa: number
    note: string
  }
  series: { t_air: ForecastSeries; pressure: ForecastSeries }
  tau_dust: { status: 'unavailable'; reason: string }
  warnings: string[]
}

export function isGaleForecast(v: unknown): v is GaleForecast {
  if (!v || typeof v !== 'object') return false
  const o = v as GaleForecast
  return o.schema === 1 && o.zone_id === 'gale' && !!o.series?.t_air && !!o.last_measured
}

/** How many kelvin colder the q50 band gets versus the last measured midpoint. Null when there is no prediction. */
export function coldDropK(f: GaleForecast | null): number | null {
  const s = f?.series.t_air
  if (!s || s.status !== 'prediction' || s.q50.length === 0 || !f) return null
  const low = Math.min(...s.q50)
  return Math.round((f.last_measured.t_air_c - low) * 10) / 10
}

export function forecastIsCold(f: GaleForecast | null, dropK = FORECAST_DROP_K): boolean {
  const drop = coldDropK(f)
  return drop !== null && drop >= dropK
}

export function forecastAgeHours(f: GaleForecast, now = Date.now()): number | null {
  const t = Date.parse(f.generated_at_utc)
  if (!Number.isFinite(t)) return null
  return (now - t) / 3_600_000
}

export function forecastIsStale(f: GaleForecast, now = Date.now()): boolean {
  const h = forecastAgeHours(f, now)
  return h !== null && h > FORECAST_STALE_H
}
