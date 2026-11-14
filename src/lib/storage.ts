/** Small, safe localStorage helpers plus a "stale-aware" cache for network payloads. */

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota or private mode: ignore */
  }
}

export interface Cached<T> {
  data: T
  savedAt: number
}

export function cacheGet<T>(key: string): Cached<T> | null {
  return readJSON<Cached<T> | null>(`mirador.cache.${key}`, null)
}

export function cacheSet<T>(key: string, data: T) {
  writeJSON(`mirador.cache.${key}`, { data, savedAt: Date.now() } satisfies Cached<T>)
}

/**
 * Fetch JSON with a timeout. On success the payload is cached; on failure the last cached
 * payload (if any) is returned flagged as stale so the UI can label it.
 */
export interface FetchResult<T> {
  data: T | null
  stale: boolean
  savedAt: number | null
  error: string | null
}

export async function fetchJSONCached<T>(
  cacheKey: string,
  urls: string[],
  opts: { timeoutMs?: number; transform?: (raw: unknown) => T } = {},
): Promise<FetchResult<T>> {
  const timeoutMs = opts.timeoutMs ?? 12000
  let lastError = 'unknown'
  for (const url of urls) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      const res = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.json()
      const data = opts.transform ? opts.transform(raw) : (raw as T)
      cacheSet(cacheKey, data)
      return { data, stale: false, savedAt: Date.now(), error: null }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  const cached = cacheGet<T>(cacheKey)
  if (cached) return { data: cached.data, stale: true, savedAt: cached.savedAt, error: lastError }
  return { data: null, stale: false, savedAt: null, error: lastError }
}
