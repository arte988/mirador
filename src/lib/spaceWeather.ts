/**
 * Turn the trimmed DONKI payload (from /api/donki or the committed snapshot) into the numbers the safety
 * semaphore uses. DONKI describes heliophysics events and model runs. It is not a dose measurement at Gale.
 */
import type { DonkiPayload, FeedSource } from '../../api/_nasa.ts'

export type { DonkiPayload, FeedSource }

export interface SpaceWeatherData {
  fetchedAt: number
  source: FeedSource
  hoursSinceSep: number | null
  hoursSinceOther: number | null
  marsImpactSoon: boolean
  /** Earliest Mars impact (ms) inside the "soon" window, for display. */
  marsImpactAt: number | null
  notifications: { id: string; type: string; time: string; body: string; url?: string }[]
  note?: string
}

/** Notification types that count as "other" solar activity. "Report" is only a summary document. */
export const ACTIVITY_TYPES = ['CME', 'FLR', 'GST', 'IPS', 'RBE', 'MPC']
/** A modeled Mars impact counts when it arrives from this long ago up to this far ahead (hours). */
export const MARS_IMPACT_PAST_H = 6
export const MARS_IMPACT_AHEAD_H = 72

export function summarizeDonki(raw: DonkiPayload, now = Date.now()): SpaceWeatherData {
  const hours = (iso: string) => (now - Date.parse(iso)) / 3600000
  const past = (iso: string) => Number.isFinite(Date.parse(iso)) && Date.parse(iso) <= now

  let hoursSinceSep: number | null = null
  const consider = (iso: string) => {
    if (!past(iso)) return
    const h = hours(iso)
    if (hoursSinceSep === null || h < hoursSinceSep) hoursSinceSep = h
  }
  for (const e of raw.sep) consider(e.eventTime)
  for (const n of raw.notifications) if (n.type === 'SEP') consider(n.issued)

  let hoursSinceOther: number | null = null
  for (const n of raw.notifications) {
    if (!ACTIVITY_TYPES.includes(n.type) || !past(n.issued)) continue
    const h = hours(n.issued)
    if (hoursSinceOther === null || h < hoursSinceOther) hoursSinceOther = h
  }

  let marsImpactAt: number | null = null
  for (const i of raw.marsImpacts) {
    const t = Date.parse(i.arrival)
    if (!Number.isFinite(t)) continue
    if (t >= now - MARS_IMPACT_PAST_H * 3600000 && t <= now + MARS_IMPACT_AHEAD_H * 3600000) {
      if (marsImpactAt === null || t < marsImpactAt) marsImpactAt = t
    }
  }

  return {
    fetchedAt: raw.fetchedAt,
    source: raw.source,
    hoursSinceSep,
    hoursSinceOther,
    marsImpactSoon: marsImpactAt !== null,
    marsImpactAt,
    notifications: raw.notifications
      .filter((n) => n.type !== 'Report')
      .slice(0, 6)
      .map((n) => ({ id: n.id, type: n.type, time: n.issued, body: n.summary, url: n.url || undefined })),
  }
}
