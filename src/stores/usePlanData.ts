import { create } from 'zustand'
import type { LonLat } from '../lib/crsMars.ts'
import type { GridInfo } from '../lib/routerTypes.ts'

/**
 * Large, non-serializable solver outputs (time fields, viewshed). Kept out of the persisted mission store.
 * `out`/`back` are best-case walking times in seconds from/to the habitat; `roverBack` back to the support rover.
 */
interface PlanData {
  grid: GridInfo | null
  out: Float64Array | null
  back: Float64Array | null
  roverBack: Float64Array | null
  viewshed: Uint8Array | null
  viewshedFor: LonLat | null
  /** Budget (s) used for the walk-back envelope overlay. */
  envelopeBudgetS: number
  set: (p: Partial<Omit<PlanData, 'set'>>) => void
}

export const usePlanData = create<PlanData>((set) => ({
  grid: null,
  out: null,
  back: null,
  roverBack: null,
  viewshed: null,
  viewshedFor: null,
  envelopeBudgetS: 0,
  set: (p) => set(p),
}))

/** Best-case seconds to walk back to the habitat from a position (Infinity if unreachable/unknown). */
export function backTimeAt(lonLat: LonLat, field: Float64Array | null, grid: GridInfo | null): number {
  if (!field || !grid) return Infinity
  const c = Math.floor((lonLat[0] - grid.west) / grid.dLon)
  const r = Math.floor((grid.north - lonLat[1]) / grid.dLat)
  if (c < 0 || r < 0 || c >= grid.width || r >= grid.height) return Infinity
  // Search the 3x3 neighborhood for the smallest finite value (the position may sit on a blocked cell).
  let best = Infinity
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const cc = c + dc
      const rr = r + dr
      if (cc < 0 || rr < 0 || cc >= grid.width || rr >= grid.height) continue
      const v = field[rr * grid.width + cc]
      if (v < best) best = v
    }
  }
  return best
}
