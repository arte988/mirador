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
  zone_id: string
  generated_at_utc: string
  step: 'sol'
  horizon_steps: number
  model: string | null
  license: string
  data_kind: 'prediction' | 'unavailable'
  shared_point: string
  /** Set on ridge copies. The numbers are the Gale series, not a sensor on that ridge. */
  estimated_from?: string
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
  /** Last measured sols copied by the offline script. The HUD does not read this. */
  history?: MeasuredSol[]
}

export interface MeasuredSol {
  sol: number
  t_air_c: number
  pressure_pa: number
}

function hasForecastShape(v: unknown): v is GaleForecast {
  if (!v || typeof v !== 'object') return false
  const o = v as GaleForecast
  return o.schema === 1 && typeof o.zone_id === 'string' && o.zone_id.length > 0 && !!o.series?.t_air && !!o.last_measured
}

/** Gale file used by the HUD. Ridge copies are a different zone and fail this check. */
export function isGaleForecast(v: unknown): v is GaleForecast {
  return hasForecastShape(v) && v.zone_id === 'gale'
}

/** Climate tab: Gale or a file derived from it. Does not invent quantiles. */
export function isZoneForecast(v: unknown): v is GaleForecast {
  return hasForecastShape(v)
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

export const HORIZONS = [1, 3, 7] as const
export type Horizon = (typeof HORIZONS)[number]
export type ClimateVariable = 't_air' | 'pressure'

/** Keep only the precomputed steps. `missing` is how many requested sols the file does not have. */
export function sliceQuantiles(s: ForecastSeries, horizon: number): { q10: number[]; q50: number[]; q90: number[]; missing: number } {
  if (s.status !== 'prediction' || horizon < 1) return { q10: [], q50: [], q90: [], missing: Math.max(0, horizon) }
  const n = Math.min(horizon, s.q10.length, s.q50.length, s.q90.length)
  return {
    q10: s.q10.slice(0, n),
    q50: s.q50.slice(0, n),
    q90: s.q90.slice(0, n),
    missing: Math.max(0, horizon - n),
  }
}
