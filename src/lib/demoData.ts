/**
 * Data for the two rehearsal modes of the safety panel. Both are always labeled in the UI:
 *  - "rehearsal": a simulated calm day (no measurement at all).
 *  - "analog": real current weather at an Earth analog site (never presented as Mars).
 */
import type { WeatherFeed } from '../stores/useMissionStore.ts'
import { marsTime } from './solar.ts'
import type { DonkiPayload } from './spaceWeather.ts'

/** Mars Desert Research Station (Utah), a well known human-mission analog site. */
export const ANALOG_SITE = { name: 'MDRS, Utah (Earth)', lat: 38.4065, lon: -110.7919 }

export const ANALOG_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${ANALOG_SITE.lat}&longitude=${ANALOG_SITE.lon}` +
  '&current=temperature_2m,surface_pressure,cloud_cover&daily=temperature_2m_max,temperature_2m_min,uv_index_max&timezone=UTC&forecast_days=1'

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** WHO UV categories. */
export function uvCategory(index: number): string {
  if (index < 3) return 'Low'
  if (index < 6) return 'Moderate'
  if (index < 8) return 'High'
  if (index < 11) return 'Very High'
  return 'Extreme'
}

/** Mars Sol Date at the start of MSL sol 0 (landing, Aug 2012). Checked against the NASA feed in the tests. */
const MSL_SOL0_MSD = 49269.24
export const mslSol = (ms: number) => Math.floor(marsTime(new Date(ms)).msd - MSL_SOL0_MSD)

/** A calm, plausible Gale day. Not a measurement. */
export function simulatedWeather(now = Date.now()): WeatherFeed {
  const mt = marsTime(new Date(now))
  return {
    source: 'simulated',
    fetchedAt: now,
    disclaimer: 'Simulated calm day for rehearsal. Not a measurement.',
    rows: [
      {
        sol: String(mslSol(now)),
        terrestrial_date: isoDay(now),
        min_temp: '-72',
        max_temp: '-8',
        pressure: '760',
        atmo_opacity: 'Sunny',
        local_uv_irradiance_index: 'Moderate',
        ls: String(Math.round(mt.ls)),
      },
    ],
  }
}

/** No solar activity at all. Not a measurement. */
export function simulatedSpace(now = Date.now()): DonkiPayload {
  return { source: 'simulated', fetchedAt: now, sep: [], notifications: [], marsImpacts: [] }
}

interface OpenMeteo {
  current?: { temperature_2m?: number; surface_pressure?: number; cloud_cover?: number }
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; uv_index_max?: number[] }
}

/** Map an Open-Meteo response to the weather row shape the panel reads. Throws on unusable data. */
export function analogWeatherFromOpenMeteo(raw: unknown, now = Date.now()): WeatherFeed {
  const j = raw as OpenMeteo
  const c = j?.current
  const d = j?.daily
  if (!c || c.temperature_2m === undefined || c.surface_pressure === undefined || !d) throw new Error('incomplete analog weather')
  const tmax = d.temperature_2m_max?.[0]
  const tmin = d.temperature_2m_min?.[0]
  const uv = d.uv_index_max?.[0]
  return {
    source: 'analog',
    fetchedAt: now,
    disclaimer: `Real current weather at ${ANALOG_SITE.name} from Open-Meteo. This is Earth, not Mars.`,
    rows: [
      {
        sol: '--',
        terrestrial_date: isoDay(now),
        min_temp: String(Math.round(tmin ?? c.temperature_2m)),
        max_temp: String(Math.round(tmax ?? c.temperature_2m)),
        pressure: String(Math.round(c.surface_pressure * 100)), // hPa -> Pa
        atmo_opacity: (c.cloud_cover ?? 0) > 60 ? 'Cloudy' : 'Sunny',
        local_uv_irradiance_index: uv === undefined ? '--' : uvCategory(uv),
        ls: '--',
      },
    ],
  }
}
