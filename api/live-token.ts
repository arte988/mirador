import { mintLiveToken } from './_copilot.js'
import type { FnResponse } from './_nasa.js'

export interface LiveTokenRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string; encrypted?: boolean }
}

// Best effort only: isolated serverless instances do not share these counters.
const limits = new Map<string, { start: number; count: number }>()
const WINDOW_MS = 60 * 60_000
const MAX_REQUESTS = 12
const header = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export function sameOrigin(req: LiveTokenRequest): boolean {
  const origin = header(req.headers.origin)
  if (!origin) return true
  const host = header(req.headers.host)
  if (!host) return false
  try {
    const url = new URL(origin)
    const forwarded = header(req.headers['x-forwarded-proto'])?.split(',')[0]?.trim().toLowerCase()
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
    const protocol = forwarded ? `${forwarded}:` : req.socket ? (req.socket.encrypted ? 'https:' : 'http:') : local ? 'http:' : 'https:'
    return url.protocol === protocol && url.host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

export function createLiveTokenHandler(env: { GEMINI_API_KEY?: string }) {
  return async function handler(req: LiveTokenRequest, res: FnResponse): Promise<void> {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      res.status(405).json({ error: 'method' })
      return
    }
    if (!sameOrigin(req)) {
      res.status(403).json({ error: 'origin' })
      return
    }
    const now = Date.now()
    for (const [ip, entry] of limits) if (now - entry.start >= WINDOW_MS) limits.delete(ip)
    const ip = header(req.headers['x-forwarded-for'])?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'
    const entry = limits.get(ip) ?? { start: now, count: 0 }
    if (entry.count >= MAX_REQUESTS) {
      res.status(429).json({ error: 'rate_limit' })
      return
    }
    entry.count++
    limits.set(ip, entry)
    const result = await mintLiveToken(env, now)
    res.status(result.status).json(result.body)
  }
}

export default async function handler(req: LiveTokenRequest, res: FnResponse): Promise<void> {
  return createLiveTokenHandler(process.env)(req, res)
}
