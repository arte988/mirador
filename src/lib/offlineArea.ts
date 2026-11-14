/**
 * Download a pyramid of Mars Trek tiles for the Gale AOI into Cache Storage so the map still draws in airplane
 * mode. Size is estimated from the published tile count, not measured, and the UI shows that estimate first.
 */
import { LAYER_DEFS } from '../data/layers.ts'
import { GALE_BBOX, HABITAT } from '../data/sites.ts'
import { loadWmtsConfig, tileUrl, tilesForBbox, type WmtsLayerConfig } from './wmts.ts'

/** Same name as the Workbox runtime cache so airplane mode can serve these tiles. */
export const AREA_CACHE = 'mirador.trek'
export const BYTES_PER_TILE = 18_000

/** Layers and zoom ranges that cover a walk around the habitat without filling the disk. */
export const PACK: { id: string; zooms: number[] }[] = [
  { id: 'mola', zooms: [0, 1, 2, 3, 4, 5, 6, 7] },
  { id: 'themis', zooms: [4, 5, 6, 7, 8] },
  { id: 'ctx', zooms: [6, 7, 8, 9, 10] },
  { id: 'hirise', zooms: [11, 12, 13, 14] },
]

/** ~3 km box around the habitat, clipped to HiRISE coverage. The full mosaic at z14 is thousands of tiles. */
const PAD_DEG = 0.025
export const AOI = {
  west: Math.max(GALE_BBOX.hirise.west, HABITAT.lonLat[0] - PAD_DEG),
  east: Math.min(GALE_BBOX.hirise.east, HABITAT.lonLat[0] + PAD_DEG),
  south: Math.max(GALE_BBOX.hirise.south, HABITAT.lonLat[1] - PAD_DEG),
  north: Math.min(GALE_BBOX.hirise.north, HABITAT.lonLat[1] + PAD_DEG),
}

export interface PackPlan {
  layer: string
  cfg: WmtsLayerConfig
  tiles: [number, number, number][]
}

export async function planPack(): Promise<PackPlan[]> {
  const out: PackPlan[] = []
  for (const p of PACK) {
    const def = LAYER_DEFS.find((d) => d.id === p.id)
    if (!def?.trek) continue
    const cfg = await loadWmtsConfig(def.trek)
    out.push({ layer: p.id, cfg, tiles: tilesForBbox(cfg, AOI, p.zooms) })
  }
  return out
}

export function estimateBytes(plans: PackPlan[]): { tiles: number; bytes: number } {
  const tiles = plans.reduce((n, p) => n + p.tiles.length, 0)
  return { tiles, bytes: tiles * BYTES_PER_TILE }
}

export async function downloadPack(
  plans: PackPlan[],
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<{ ok: number; fail: number }> {
  const cache = await caches.open(AREA_CACHE)
  const total = plans.reduce((n, p) => n + p.tiles.length, 0)
  let done = 0
  let ok = 0
  let fail = 0
  for (const p of plans) {
    for (const [z, x, y] of p.tiles) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
      const url = tileUrl(p.cfg, z, x, y)
      try {
        const res = await fetch(url, { mode: 'cors', signal })
        if (res.ok) {
          await cache.put(url, res.clone())
          ok++
        } else fail++
      } catch {
        fail++
      }
      done++
      if (done % 8 === 0 || done === total) onProgress(done, total)
    }
  }
  return { ok, fail }
}

export async function areaCacheCount(): Promise<number> {
  try {
    const cache = await caches.open(AREA_CACHE)
    return (await cache.keys()).length
  } catch {
    return 0
  }
}

export function fmtMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}
