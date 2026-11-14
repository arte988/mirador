/**
 * Server-side NASA feed logic, shared by the Vercel functions in this folder, the Vite dev middleware and
 * the snapshot script. Kept dependency-free and in one file so it runs unchanged in all three places.
 *
 * - Weather: unofficial mars.nasa.gov REMS feed (Centro de Astrobiologia, outreach use only). The upstream
 *   payload is about 1.7 MB, so only the newest sols are returned.
 * - Raw images: unofficial mars.nasa.gov raw image feed (same /rss/api host as the weather feed). One sol per request;
 *   a busy sol is 350 KB, so only a capped, per-camera sample is returned.
 * - Space weather: NASA DONKI (api.nasa.gov). The API key comes from the NASA_API_KEY environment variable
 *   and never reaches the browser bundle. DEMO_KEY works but is heavily rate limited.
 */

export const WEATHER_URL = 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json'
export const DONKI_BASE = 'https://api.nasa.gov/DONKI'
export const WEATHER_SOLES = 14
export const SEP_WINDOW_DAYS = 30
export const NOTIFICATION_WINDOW_DAYS = 14
export const ENLIL_WINDOW_DAYS = 14

export type FeedSource = 'live' | 'snapshot' | 'simulated' | 'analog'

export interface WeatherPayload {
  source: FeedSource
  fetchedAt: number
  disclaimer: string
  /** Newest sol first. Values are strings as published ("--" when missing). */
  rows: Record<string, string>[]
}

export interface DonkiPayload {
  source: FeedSource
  fetchedAt: number
  sep: { sepID: string; eventTime: string }[]
  notifications: { type: string; id: string; url: string; issued: string; summary: string }[]
  /** WSA-ENLIL model impacts at Mars (model estimates, not measurements). */
  marsImpacts: { arrival: string; glancing: boolean; minor: boolean; simulationID: string; modelCompleted: string }[]
}

export type Mission = 'msl' | 'mars2020'
export const IMAGES_URL = 'https://mars.nasa.gov/rss/api/'
export const IMAGES_PER_CAMERA = 4
export const IMAGES_MAX = 32

export interface RawImage {
  id: string
  sol: number
  /** UTC time the image was taken, as published (no timezone suffix). */
  utc: string
  /** Instrument code as published, e.g. MAST_LEFT, NAV_RIGHT_B. */
  camera: string
  credit: string
  small: string
  medium: string
  large: string
  /** Page for this raw image on mars.nasa.gov. */
  link: string
}

export interface ImagesPayload {
  source: FeedSource
  fetchedAt: number
  mission: Mission
  sol: number
  /** Number of raw images the feed lists for the sol (the payload holds only a sample). */
  total: number
  images: RawImage[]
}

const DAY = 86400000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

async function getJSON(url: string, timeoutMs = 20000): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`upstream HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** First meaningful sentence of a DONKI message body (header lines starting with "##" are dropped). */
export function summarizeBody(body: unknown, max = 280): string {
  if (typeof body !== 'string') return ''
  const text = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('##'))
    .join(' ')
    .replace(/\s+/g, ' ')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function normalizeWeather(raw: unknown, now = Date.now()): WeatherPayload {
  const soles = (raw as { soles?: Record<string, string>[] } | null)?.soles
  if (!Array.isArray(soles) || soles.length === 0) throw new Error('weather feed has no soles')
  // The feed lists the newest sol first; sort defensively by sol number anyway.
  const rows = [...soles].sort((a, b) => Number(b.sol) - Number(a.sol)).slice(0, WEATHER_SOLES)
  return {
    source: 'live',
    fetchedAt: now,
    disclaimer: 'Unofficial NASA web feed (REMS, Centro de Astrobiologia), for outreach purposes only.',
    rows,
  }
}

export function normalizeDonki(
  sep: unknown,
  notifications: unknown,
  enlil: unknown,
  now = Date.now(),
): DonkiPayload {
  const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
  const marsImpacts: DonkiPayload['marsImpacts'] = []
  for (const sim of arr(enlil)) {
    for (const imp of arr(sim.impactList)) {
      if (imp.location !== 'Mars' || typeof imp.arrivalTime !== 'string') continue
      marsImpacts.push({
        arrival: imp.arrivalTime,
        glancing: imp.isGlancingBlow === true,
        minor: imp.isMinorImpact === true,
        simulationID: String(sim.simulationID ?? ''),
        modelCompleted: String(sim.modelCompletionTime ?? ''),
      })
    }
  }
  return {
    source: 'live',
    fetchedAt: now,
    sep: arr(sep)
      .filter((e) => typeof e.eventTime === 'string')
      .map((e) => ({ sepID: String(e.sepID ?? ''), eventTime: e.eventTime as string })),
    notifications: arr(notifications)
      .filter((n) => typeof n.messageIssueTime === 'string')
      .map((n) => ({
        type: String(n.messageType ?? ''),
        id: String(n.messageID ?? ''),
        url: String(n.messageURL ?? ''),
        issued: n.messageIssueTime as string,
        summary: summarizeBody(n.messageBody),
      }))
      .sort((a, b) => Date.parse(b.issued) - Date.parse(a.issued))
      .slice(0, 12),
    marsImpacts: marsImpacts.sort((a, b) => Date.parse(b.arrival) - Date.parse(a.arrival)).slice(0, 12),
  }
}

/** Keeps a few images per camera so one busy camera does not hide the others, oldest first. */
export function normalizeImages(raw: unknown, mission: Mission, sol: number, now = Date.now()): ImagesPayload {
  const r = raw as { images?: Record<string, unknown>[]; num_images?: number; sol?: number } | null
  if (!r || !Array.isArray(r.images)) throw new Error('image feed has no images array')
  // For a sol with no downlinked images the feed answers with a generic "latest images" list instead of an empty
  // one. Keep only images that really belong to the requested sol so we never show another sol's pictures.
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const all = r.images
    .filter((i) => Number(i.sol) === sol)
    .map((i) => {
      const files = (i.image_files ?? {}) as Record<string, unknown>
      const cam = (i.camera ?? {}) as Record<string, unknown>
      return {
        id: str(i.imageid),
        sol: Number(i.sol),
        utc: str(i.date_taken_utc),
        camera: str(cam.instrument) || 'UNK',
        credit: str(i.credit) || 'NASA/JPL-Caltech',
        small: str(files.small),
        medium: str(files.medium),
        large: str(files.large) || str(files.medium),
        link: str(i.link),
      } satisfies RawImage
    })
    .filter((i) => i.id && i.small && i.medium && i.small.startsWith('https://'))
    .sort((a, b) => a.utc.localeCompare(b.utc))
  const perCam = new Map<string, number>()
  const images: RawImage[] = []
  for (const img of all) {
    const n = perCam.get(img.camera) ?? 0
    if (n >= IMAGES_PER_CAMERA) continue
    perCam.set(img.camera, n + 1)
    images.push(img)
    if (images.length >= IMAGES_MAX) break
  }
  return { source: 'live', fetchedAt: now, mission, sol, total: Number(r.sol) === sol ? Number(r.num_images ?? all.length) : all.length, images }
}

export const isMission = (m: unknown): m is Mission => m === 'msl' || m === 'mars2020'
export const isSol = (n: number) => Number.isInteger(n) && n >= 0 && n <= 20000

export function getImages(mission: Mission, sol: number): Promise<ImagesPayload> {
  if (!isMission(mission) || !isSol(sol)) return Promise.reject(new Error('bad mission or sol'))
  return memoized(`images:${mission}:${sol}`, async () => {
    const url = `${IMAGES_URL}?feed=raw_images&category=${mission}&feedtype=json&sol=${sol}&num=100&page=0&order=sol+desc`
    return normalizeImages(await getJSON(url, 30000), mission, sol)
  })
}

type Memo<T> = { at: number; value: T }
const memo = new Map<string, Memo<unknown>>()
const TTL_MS = 15 * 60 * 1000

async function memoized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as Memo<T> | undefined
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const value = await fn()
  memo.set(key, { at: Date.now(), value })
  return value
}

export function getWeather(): Promise<WeatherPayload> {
  return memoized('weather', async () => normalizeWeather(await getJSON(WEATHER_URL)))
}

export function getDonki(apiKey = process.env.NASA_API_KEY || 'DEMO_KEY'): Promise<DonkiPayload> {
  return memoized('donki', async () => {
    const now = Date.now()
    const q = (path: string, days: number, extra = '') =>
      `${DONKI_BASE}/${path}?startDate=${isoDay(now - days * DAY)}&endDate=${isoDay(now + DAY)}${extra}&api_key=${encodeURIComponent(apiKey)}`
    const [sep, notifications, enlil] = await Promise.all([
      getJSON(q('SEP', SEP_WINDOW_DAYS)),
      getJSON(q('notifications', NOTIFICATION_WINDOW_DAYS, '&type=all')),
      getJSON(q('WSAEnlilSimulations', ENLIL_WINDOW_DAYS)),
    ])
    return normalizeDonki(sep, notifications, enlil, now)
  })
}

/** Minimal request/response shapes so no framework types are needed. */
export interface FnRequest {
  query?: Record<string, string | string[] | undefined>
}

export interface FnResponse {
  status(code: number): FnResponse
  setHeader(name: string, value: string): unknown
  json(body: unknown): unknown
}

export async function respond<T>(res: FnResponse, load: () => Promise<T>): Promise<void> {
  try {
    const data = await load()
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600')
    res.status(200).json(data)
  } catch (err) {
    // The client falls back to its cached copy and then to the committed snapshot.
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).json({ error: err instanceof Error ? err.message : 'upstream failure' })
  }
}
