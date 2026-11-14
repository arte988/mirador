/**
 * Line of sight over the cost grid heights. Used for comms dropout zones between the habitat/rover
 * and the walkers, and for the sky horizon of a stop. Antenna/eye heights are planning assumptions.
 */
import { type CostGrid, cellCenter } from './routing.ts'

export const EYE_HEIGHT_M = 1.7
export const HAB_ANTENNA_HEIGHT_M = 3

/** True if the straight line between two cells clears the terrain (heights above the surface). */
export function lineOfSight(g: CostGrid, a: number, b: number, hA = HAB_ANTENNA_HEIGHT_M, hB = EYE_HEIGHT_M): boolean {
  const ca = a % g.width
  const ra = (a - ca) / g.width
  const cb = b % g.width
  const rb = (b - cb) / g.width
  const dx = (cb - ca) * g.cellX
  const dy = (rb - ra) * g.cellY
  const dist = Math.hypot(dx, dy)
  if (dist === 0) return true
  const steps = Math.max(1, Math.ceil(dist / (Math.min(g.cellX, g.cellY) * 0.75)))
  const zA = g.z[a] + hA
  const zB = g.z[b] + hB
  for (let k = 1; k < steps; k++) {
    const t = k / steps
    const c = Math.round(ca + (cb - ca) * t)
    const r = Math.round(ra + (rb - ra) * t)
    const z = g.z[r * g.width + c]
    if (Number.isNaN(z)) continue
    if (z > zA + (zB - zA) * t) return false
  }
  return true
}

/** Cells visible from an observer cell within a range (1 = visible). */
export function viewshed(g: CostGrid, obs: number, maxRangeM = 2500, hObs = HAB_ANTENNA_HEIGHT_M, hTarget = EYE_HEIGHT_M): Uint8Array {
  const out = new Uint8Array(g.width * g.height)
  const c0 = obs % g.width
  const r0 = (obs - c0) / g.width
  const rc = Math.ceil(maxRangeM / g.cellX)
  const rr = Math.ceil(maxRangeM / g.cellY)
  for (let r = Math.max(0, r0 - rr); r <= Math.min(g.height - 1, r0 + rr); r++) {
    for (let c = Math.max(0, c0 - rc); c <= Math.min(g.width - 1, c0 + rc); c++) {
      const d = Math.hypot((c - c0) * g.cellX, (r - r0) * g.cellY)
      if (d > maxRangeM) continue
      const i = r * g.width + c
      if (Number.isNaN(g.z[i])) continue
      if (lineOfSight(g, obs, i, hObs, hTarget)) out[i] = 1
    }
  }
  return out
}

export { cellCenter }
