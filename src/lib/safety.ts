/**
 * Safety semaphore rules. Documented, deterministic, shown in the UI next to the light.
 * This is NOT a medical or flight certification: DONKI describes heliophysics events, not a measured
 * dose on the surface of Gale, and the weather feed is an unofficial NASA web feed.
 */

export type Level = 'green' | 'amber' | 'red'

export interface WeatherSummary {
  /** Age of the latest weather sol in days (from terrestrial_date). */
  ageDays: number | null
  minTempC: number | null
  maxTempC: number | null
  uvIndex: string | null
  opacity: string | null
}

export interface SpaceWeatherSummary {
  /** Hours since the most recent SEP event, null when none in the window. */
  hoursSinceSep: number | null
  /** Hours since the most recent CME/FLR/GST/IPS/RBE notification, null when none in the window. */
  hoursSinceOther: number | null
  /** Modeled Mars impact in our planning window, including glancing and minor entries.
   * DONKI schema: https://ccmc.gsfc.nasa.gov/DONKI/api/openapi/ */
  marsImpactSoon: boolean
  /** True when DONKI could not be loaded at all (no key, network). */
  unknown: boolean
}

export interface ScenarioFlags {
  dustStorm: boolean
  sepAlert: boolean
  o2Leak: boolean
}

export interface SafetyInput {
  weather: WeatherSummary | null
  space: SpaceWeatherSummary | null
  scenario: ScenarioFlags
  stormFlag: boolean
  /** Minutes of daylight left at the site. Infinity if unknown. */
  daylightMin: number
  /** Planned walk time + dwell + reserve in minutes (0 if no route). */
  routeNeedMin: number
  /** TimesFM q50 drop versus the last measured midpoint, when a prediction was published. */
  forecastCold?: { dropK: number } | null
}

export interface Reason {
  id: string
  level: Level
  /** i18n key suffix under safety.reasons.* */
  key: string
  params?: Record<string, string | number>
}

export interface SafetyResult {
  level: Level
  reasons: Reason[]
}

export const SEP_RED_HOURS = 24
export const SEP_AMBER_HOURS = 72
export const OTHER_AMBER_HOURS = 48
export const WEATHER_STALE_DAYS = 7

const order: Record<Level, number> = { green: 0, amber: 1, red: 2 }
export const worst = (a: Level, b: Level): Level => (order[a] >= order[b] ? a : b)

export function evaluateSafety(i: SafetyInput): SafetyResult {
  const reasons: Reason[] = []
  const add = (id: string, level: Level, key: string, params?: Record<string, string | number>) =>
    reasons.push({ id, level, key, params })

  if (i.scenario.o2Leak) add('o2-leak', 'red', 'o2Leak')
  if (i.scenario.sepAlert) add('sep-scenario', 'red', 'sepScenario')

  const s = i.space
  if (s) {
    if (s.hoursSinceSep !== null && s.hoursSinceSep <= SEP_RED_HOURS) add('sep-24', 'red', 'sepRecent', { hours: Math.round(s.hoursSinceSep) })
    else if (s.hoursSinceSep !== null && s.hoursSinceSep <= SEP_AMBER_HOURS) add('sep-72', 'amber', 'sepRecent', { hours: Math.round(s.hoursSinceSep) })
    if (s.hoursSinceOther !== null && s.hoursSinceOther <= OTHER_AMBER_HOURS) add('notif-48', 'amber', 'notification', { hours: Math.round(s.hoursSinceOther) })
    if (s.marsImpactSoon) add('mars-impact', 'amber', 'marsImpact')
    if (s.unknown) add('donki-unknown', 'amber', 'donkiUnknown')
  } else {
    add('donki-unknown', 'amber', 'donkiUnknown')
  }

  if (i.stormFlag || i.scenario.dustStorm) add('storm', 'amber', 'dustStorm')
  if (i.forecastCold) add('forecast-cold', 'amber', 'forecastCold', { k: i.forecastCold.dropK })

  const w = i.weather
  if (!w) add('weather-unknown', 'amber', 'weatherUnknown')
  else {
    if (w.ageDays !== null && w.ageDays > WEATHER_STALE_DAYS) add('weather-stale', 'amber', 'weatherStale', { days: Math.round(w.ageDays) })
    if (w.uvIndex && /very/i.test(w.uvIndex)) add('uv', 'amber', 'uvHigh', { uv: w.uvIndex })
    if (w.opacity && /(dust|storm|haz)/i.test(w.opacity)) add('opacity', 'amber', 'dustOpacity', { opacity: w.opacity })
  }

  if (i.routeNeedMin > 0 && Number.isFinite(i.daylightMin)) {
    if (i.daylightMin < i.routeNeedMin) add('daylight-red', 'red', 'daylightShort', { have: Math.round(i.daylightMin), need: Math.round(i.routeNeedMin) })
    else if (i.daylightMin < i.routeNeedMin + 60) add('daylight-amber', 'amber', 'daylightTight', { have: Math.round(i.daylightMin), need: Math.round(i.routeNeedMin) })
  }

  let level: Level = 'green'
  for (const r of reasons) level = worst(level, r.level)
  if (reasons.length === 0) add('clear', 'green', 'clear')
  return { level, reasons }
}

/** Latest sample helpers: parse the NASA weather feed row to a summary. */
export function summarizeWeather(row: Record<string, string> | null | undefined, now = Date.now()): WeatherSummary | null {
  if (!row) return null
  const num = (v: string | undefined) => {
    if (v === undefined || v === '--' || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  const date = row.terrestrial_date ? Date.parse(`${row.terrestrial_date}T12:00:00Z`) : NaN
  return {
    ageDays: Number.isFinite(date) ? (now - date) / 86400000 : null,
    minTempC: num(row.min_temp),
    maxTempC: num(row.max_temp),
    uvIndex: row.local_uv_irradiance_index && row.local_uv_irradiance_index !== '--' ? row.local_uv_irradiance_index : null,
    opacity: row.atmo_opacity && row.atmo_opacity !== '--' ? row.atmo_opacity : null,
  }
}
