import { FORECAST_URL, isGaleForecast, type GaleForecast } from './climateForecast.ts'

const CACHE = 'mirador.forecast'

export interface ForecastZone {
  id: string
  url: string
}

const GALE_ZONE: ForecastZone = { id: 'gale', url: FORECAST_URL }

/** Zones listed in the static index. Falls back to Gale if the index is missing. */
export async function loadForecastZones(): Promise<ForecastZone[]> {
  try {
    const res = await fetch('/forecasts/index.json')
    if (!res.ok) return [GALE_ZONE]
    const body: unknown = await res.json()
    if (!Array.isArray(body)) return [GALE_ZONE]
    const zones = body.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const id = (item as { id?: unknown }).id
      const url = (item as { url?: unknown }).url
      if (typeof id !== 'string' || typeof url !== 'string' || !url.startsWith('/forecasts/')) return []
      return [{ id, url }]
    })
    return zones.length > 0 ? zones : [GALE_ZONE]
  } catch {
    return [GALE_ZONE]
  }
}

async function fromCache(url: string): Promise<GaleForecast | null> {
  try {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(url)
    if (!hit) return null
    const body: unknown = await hit.json()
    return isGaleForecast(body) ? body : null
  } catch {
    return null
  }
}

/** Network first, then the copy saved for the walk. Never invents a forecast. */
export async function loadForecast(url = FORECAST_URL): Promise<{ data: GaleForecast | null; cached: boolean }> {
  try {
    const res = await fetch(url)
    if (res.ok) {
      const body: unknown = await res.clone().json()
      if (isGaleForecast(body)) {
        try {
          const cache = await caches.open(CACHE)
          await cache.put(url, res)
        } catch {
          /* private mode */
        }
        return { data: body, cached: false }
      }
    }
  } catch {
    /* offline */
  }
  const cached = await fromCache(url)
  return { data: cached, cached: cached !== null }
}

export function preloadForecast(): ReturnType<typeof loadForecast> {
  return loadForecast()
}
