import type { LonLat } from '../lib/crsMars.ts'
import type { Waypoint } from '../lib/routing.ts'

export type SiteId = 'gale' | 'jezero'

export interface Site {
  id: SiteId
  nameKey: string
  /** NASA feed category: msl = Curiosity, mars2020 = Perseverance. */
  rover: 'msl' | 'mars2020'
  center: LonLat
  zoom: number
}

export const SITES: Record<SiteId, Site> = {
  gale: { id: 'gale', nameKey: 'sites.gale', rover: 'msl', center: [137.3845, -4.8035], zoom: 13 },
  // Jezero is a data toggle (Perseverance photos + MEDA weather), not a second planning site.
  jezero: { id: 'jezero', nameKey: 'sites.jezero', rover: 'mars2020', center: [77.45, 18.44], zoom: 10 },
}

/** Verified Mars Trek bounding boxes (GetCapabilities, 14 Nov 2026), lon/lat degrees. */
export const GALE_BBOX = {
  hirise: { west: 137.1224669, east: 137.7298129, south: -4.9254743, north: -4.2489588 },
  ctx: { west: 136.2768326, east: 139.3864225, south: -7.2137273, north: -3.5804738 },
}

/**
 * Prototype staging point and science stops.
 *
 * IMPORTANT: these are crest candidates picked from the local 4 m DTM (see scripts/ridges.ts) so the demo
 * has walkable terrain. They are NOT official NASA waypoints and NOT confirmed boxwork locations. A 2025
 * coordinate (~4.825S, 137.389E) seen on third-party aggregators is only the center of the DTM crop
 * (to verify against an official mission map before using it).
 */
export const HABITAT: Waypoint = { id: 'hab', name: 'Habitat airlock', lonLat: [137.38444, -4.7974], kind: 'habitat' }
export const SUPPORT_ROVER: Waypoint = { id: 'rover', name: 'Support rover', lonLat: [137.38255, -4.80159], kind: 'rover' }

export const SCIENCE_STOPS: Waypoint[] = [
  { id: 'ridge-a', name: 'Ridge A', lonLat: [137.37688, -4.80091], kind: 'science' },
  { id: 'ridge-b', name: 'Ridge B', lonLat: [137.38741, -4.80199], kind: 'science' },
  { id: 'ridge-c', name: 'Ridge C', lonLat: [137.38363, -4.8082], kind: 'science' },
  { id: 'ridge-d', name: 'Ridge D', lonLat: [137.3785, -4.79254], kind: 'science', optional: true },
  { id: 'ridge-e', name: 'Ridge E', lonLat: [137.3893, -4.79443], kind: 'science', optional: true },
]

export const DEFAULT_REQUIRED_IDS = ['ridge-a', 'ridge-b', 'ridge-c']

/** Boxwork campaign sol range used as the default for the photo viewer (see NASA Science notes, 2025). */
export const BOXWORK_SOL_RANGE = { min: 4451, max: 4550 }
