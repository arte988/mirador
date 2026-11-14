/** Pure assembly of the safety semaphore input from the feeds, the plan and the scenario flags. */
import { daylightRemainingMin } from './solar.ts'
import { summarizeDonki, type DonkiPayload } from './spaceWeather.ts'
import { summarizeWeather, type SafetyInput, type ScenarioFlags } from './safety.ts'
import type { WeatherFeed } from '../stores/useMissionStore.ts'

export interface SafetyContext {
  weather: { data: WeatherFeed | null } | null
  space: { data: DonkiPayload | null; stale: boolean } | null
  scenario: ScenarioFlags
  stormFlag: boolean
  /** Planned EVA start (ms). */
  startMs: number
  site: { lon: number; lat: number }
  /** Selected route total time (walk + dwell) in minutes, or null when there is no plan. */
  routeMinutes: number | null
  reserveMin: number
  now: number
}

export function buildSafetyInput(c: SafetyContext): SafetyInput {
  const row = c.weather?.data?.rows?.[0]
  const weather = row ? summarizeWeather(row as unknown as Record<string, string>, c.now) : null

  let space: SafetyInput['space'] = null
  if (c.space?.data) {
    const s = summarizeDonki(c.space.data, c.now)
    // A snapshot or a stale cached copy cannot rule out newer events, so it is reported as unknown.
    space = {
      hoursSinceSep: s.hoursSinceSep,
      hoursSinceOther: s.hoursSinceOther,
      marsImpactSoon: s.marsImpactSoon,
      unknown: s.source === 'snapshot' || c.space.stale,
    }
  }

  return {
    weather,
    space,
    scenario: c.scenario,
    stormFlag: c.stormFlag,
    daylightMin: daylightRemainingMin(new Date(c.startMs), c.site.lon, c.site.lat),
    routeNeedMin: c.routeMinutes === null ? 0 : c.routeMinutes + c.reserveMin,
  }
}
