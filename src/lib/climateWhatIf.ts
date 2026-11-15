import type { ClimateVariable } from './climateForecast.ts'

/** Educational offsets applied at +50% on the slider. Not a CO2 climate sensitivity. */
export const CO2_MAX_PCT = 50
export const CO2_TEMP_K_AT_MAX = 2
export const CO2_PRESSURE_PA_AT_MAX = 10

/** Shift added to the published median. Proportional to the slider, zero at 0%. */
export function co2Offset(percent: number, variable: ClimateVariable): number {
  const clamped = Math.min(CO2_MAX_PCT, Math.max(0, percent))
  const scale = clamped / CO2_MAX_PCT
  return variable === 't_air' ? scale * CO2_TEMP_K_AT_MAX : scale * CO2_PRESSURE_PA_AT_MAX
}

export function applyCo2(values: number[], percent: number, variable: ClimateVariable): number[] {
  const shift = co2Offset(percent, variable)
  return values.map((v) => Math.round((v + shift) * 1000) / 1000)
}

function isFiniteList(v: unknown, length: number): v is number[] {
  return Array.isArray(v) && v.length === length && v.every((n) => typeof n === 'number' && Number.isFinite(n))
}

/**
 * Ask an optional what-if endpoint. Any failure, including a missing URL or a
 * mismatched body, returns the local educational shift. This never throws.
 */
export async function resolveWhatIf(opts: {
  base: number[]
  percent: number
  variable: ClimateVariable
  zone: string
  horizon: number
  endpoint?: string
}): Promise<{ q50: number[]; source: 'local' | 'api' }> {
  const local = applyCo2(opts.base, opts.percent, opts.variable)
  const endpoint = opts.endpoint?.trim()
  if (!endpoint || opts.percent === 0 || opts.base.length === 0) return { q50: local, source: 'local' }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        zone: opts.zone,
        variable: opts.variable,
        horizon: opts.horizon,
        co2Pct: opts.percent,
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return { q50: local, source: 'local' }
    const body: unknown = await res.json()
    const q50 = body && typeof body === 'object' ? (body as { q50?: unknown }).q50 : undefined
    if (!isFiniteList(q50, opts.base.length)) return { q50: local, source: 'local' }
    return { q50, source: 'api' }
  } catch {
    return { q50: local, source: 'local' }
  }
}
