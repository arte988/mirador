import { FORECAST_URL, isGaleForecast, type GaleForecast } from './climateForecast.ts'

const CACHE = 'mirador.forecast'

async function fromCache(): Promise<GaleForecast | null> {
  try {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(FORECAST_URL)
    if (!hit) return null
    const body: unknown = await hit.json()
    return isGaleForecast(body) ? body : null
  } catch {
    return null
  }
}

/** Network first, then the copy saved for the walk. Never invents a forecast. */
export async function loadForecast(): Promise<{ data: GaleForecast | null; cached: boolean }> {
  try {
    const res = await fetch(FORECAST_URL)
    if (res.ok) {
      const body: unknown = await res.clone().json()
      if (isGaleForecast(body)) {
        try {
          const cache = await caches.open(CACHE)
          await cache.put(FORECAST_URL, res)
        } catch {
          /* private mode */
        }
        return { data: body, cached: false }
      }
    }
  } catch {
    /* offline */
  }
  const cached = await fromCache()
  return { data: cached, cached: cached !== null }
}

export function preloadForecast(): ReturnType<typeof loadForecast> {
  return loadForecast()
}
