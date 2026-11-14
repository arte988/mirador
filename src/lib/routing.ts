/**
 * Route planning on a DTM-derived cost grid.
 *
 * - The grid is a coarser copy of the 4 m DTM (default factor 2 -> 8 m cells). Slope uses the max of the
 *   fine cells in each block (conservative). Cells above the no-go slope, over no-data, or inside
 *   user no-go polygons are blocked.
 * - A* connects waypoints, Dijkstra produces cost-to-go / cost-from-start fields that are reused for the
 *   walk-back envelope, abort routes and alternative profiles.
 * - Speeds, penalties and limits are planning assumptions (see params.ts), not NASA flight rules.
 */
import { M_PER_DEG, distanceMeters, type LonLat } from './crsMars.ts'
import { computeRoughness, computeSlopeDeg, type Dtm } from './dtm.ts'
import { DEFAULT_PARAMS, type PlanningParams } from './params.ts'
import { speedFactor } from './metabolic.ts'

export type RouteProfileId = 'safest' | 'fastest' | 'science'

export interface ProfileWeights {
  /** Seconds-equivalent penalty per meter at the no-go slope (quadratic ramp from the comfort slope). */
  slopePenalty: number
  /** Slope (deg) where the penalty starts. */
  comfortDeg: number
  /** Seconds-equivalent penalty per meter per meter of local roughness (std. dev.). */
  roughPenalty: number
}

export function profileWeights(id: RouteProfileId, p: PlanningParams): ProfileWeights {
  switch (id) {
    case 'fastest':
      return { slopePenalty: 0, comfortDeg: p.nogoDeg, roughPenalty: 0 }
    case 'safest':
      return { slopePenalty: 40, comfortDeg: 6, roughPenalty: 3 }
    case 'science':
      return { slopePenalty: 12, comfortDeg: p.cautionDeg - 4, roughPenalty: 1 }
  }
}

export interface CostGrid {
  width: number
  height: number
  factor: number
  west: number
  north: number
  dLon: number
  dLat: number
  cellX: number
  cellY: number
  z: Float32Array
  slope: Float32Array
  rough: Float32Array
  /** 1 where the terrain itself is unusable (no data / border), independent of parameters. */
  invalid: Uint8Array
  /** 1 where blocked for the current parameters + polygons. */
  blocked: Uint8Array
}

export function buildCostGrid(dtm: Dtm, factor = 2): CostGrid {
  const slopeFine = computeSlopeDeg(dtm)
  const roughFine = computeRoughness(dtm)
  const W = Math.floor(dtm.width / factor)
  const H = Math.floor(dtm.height / factor)
  const z = new Float32Array(W * H)
  const slope = new Float32Array(W * H)
  const rough = new Float32Array(W * H)
  const invalid = new Uint8Array(W * H)
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      let zs = 0
      let n = 0
      let smax = 0
      let rmax = 0
      let bad = false
      for (let dr = 0; dr < factor; dr++) {
        for (let dc = 0; dc < factor; dc++) {
          const i = (r * factor + dr) * dtm.width + (c * factor + dc)
          const zv = dtm.z[i]
          const sv = slopeFine[i]
          const rv = roughFine[i]
          if (Number.isNaN(zv) || Number.isNaN(sv)) {
            bad = true
            continue
          }
          zs += zv
          n++
          if (sv > smax) smax = sv
          if (rv > rmax) rmax = rv
        }
      }
      const o = r * W + c
      if (bad && n === 0) invalid[o] = 1
      z[o] = n ? zs / n : NaN
      slope[o] = smax
      rough[o] = rmax
    }
  }
  const grid: CostGrid = {
    width: W,
    height: H,
    factor,
    west: dtm.west,
    north: dtm.north,
    dLon: dtm.dLon * factor,
    dLat: dtm.dLat * factor,
    cellX: dtm.cellX * factor,
    cellY: dtm.cellY * factor,
    z,
    slope,
    rough,
    invalid,
    blocked: new Uint8Array(W * H),
  }
  return grid
}

export type Polygon = LonLat[]

export function pointInPolygon(p: LonLat, poly: Polygon): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function cellCenter(g: CostGrid, col: number, row: number): LonLat {
  return [g.west + (col + 0.5) * g.dLon, g.north - (row + 0.5) * g.dLat]
}

export function lonLatToCellIdx(g: CostGrid, lon: number, lat: number): number {
  const c = Math.floor((lon - g.west) / g.dLon)
  const r = Math.floor((g.north - lat) / g.dLat)
  if (c < 0 || r < 0 || c >= g.width || r >= g.height) return -1
  return r * g.width + c
}

/** Recompute the blocked mask for the given parameters and no-go polygons. */
export function applyBlockers(g: CostGrid, p: PlanningParams, noGo: Polygon[] = []): number {
  let count = 0
  const boxes = noGo.map((poly) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of poly) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    return { poly, minX, maxX, minY, maxY }
  })
  for (let r = 0; r < g.height; r++) {
    for (let c = 0; c < g.width; c++) {
      const i = r * g.width + c
      let blocked = g.invalid[i] === 1 || g.slope[i] > p.nogoDeg
      if (!blocked && boxes.length) {
        const pt = cellCenter(g, c, r)
        for (const b of boxes) {
          if (pt[0] < b.minX || pt[0] > b.maxX || pt[1] < b.minY || pt[1] > b.maxY) continue
          if (pointInPolygon(pt, b.poly)) {
            blocked = true
            break
          }
        }
      }
      g.blocked[i] = blocked ? 1 : 0
      if (blocked) count++
    }
  }
  return count
}

/** Move to the nearest unblocked cell (breadth-first up to a radius) so stops on steep spots still route. */
export function nearestFreeCell(g: CostGrid, idx: number, maxRadius = 12): number {
  if (idx < 0) return -1
  if (!g.blocked[idx]) return idx
  const c0 = idx % g.width
  const r0 = Math.floor(idx / g.width)
  for (let rad = 1; rad <= maxRadius; rad++) {
    let best = -1
    let bestD = Infinity
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue
        const r = r0 + dr
        const c = c0 + dc
        if (r < 0 || c < 0 || r >= g.height || c >= g.width) continue
        const i = r * g.width + c
        if (g.blocked[i]) continue
        const d = dr * dr + dc * dc
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
    }
    if (best >= 0) return best
  }
  return -1
}

// ---- Binary heap --------------------------------------------------------------------------------------------
class MinHeap {
  keys: Float64Array
  items: Int32Array
  size = 0
  constructor(cap = 1 << 16) {
    this.keys = new Float64Array(cap)
    this.items = new Int32Array(cap)
  }
  push(key: number, item: number) {
    if (this.size === this.keys.length) {
      const nk = new Float64Array(this.size * 2)
      nk.set(this.keys)
      this.keys = nk
      const ni = new Int32Array(this.size * 2)
      ni.set(this.items)
      this.items = ni
    }
    let i = this.size++
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.keys[parent] <= key) break
      this.keys[i] = this.keys[parent]
      this.items[i] = this.items[parent]
      i = parent
    }
    this.keys[i] = key
    this.items[i] = item
  }
  popKey = 0
  pop(): number {
    const top = this.items[0]
    this.popKey = this.keys[0]
    const key = this.keys[--this.size]
    const item = this.items[this.size]
    let i = 0
    const n = this.size
    while (true) {
      let child = 2 * i + 1
      if (child >= n) break
      if (child + 1 < n && this.keys[child + 1] < this.keys[child]) child++
      if (this.keys[child] >= key) break
      this.keys[i] = this.keys[child]
      this.items[i] = this.items[child]
      i = child
    }
    this.keys[i] = key
    this.items[i] = item
    return top
  }
}

const NEIGH: [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [1, -1], [-1, 1], [1, 1],
]

interface EdgeCost {
  /** Weighted cost used for ordering. */
  cost: number
  /** Walking time in seconds. */
  time: number
  dist: number
}

function edge(g: CostGrid, from: number, to: number, dc: number, dr: number, p: PlanningParams, w: ProfileWeights): EdgeCost {
  const dx = dc * g.cellX
  const dy = dr * g.cellY
  const dist = Math.hypot(dx, dy)
  const dz = g.z[to] - g.z[from]
  const grade = dz / dist
  const v = (p.flatSpeedKmh / 3.6) * speedFactor(grade)
  const time = dist / Math.max(0.05, v)
  const s = Math.max(g.slope[from], g.slope[to])
  let pen = 0
  if (w.slopePenalty > 0 && s > w.comfortDeg) {
    const t = Math.min(1.2, (s - w.comfortDeg) / Math.max(1, p.nogoDeg - w.comfortDeg))
    pen += w.slopePenalty * t * t
  }
  if (w.roughPenalty > 0) pen += w.roughPenalty * Math.max(g.rough[from], g.rough[to])
  return { cost: time + pen * dist, time, dist }
}

function diagonalOk(g: CostGrid, c: number, r: number, dc: number, dr: number): boolean {
  if (dc === 0 || dr === 0) return true
  return !g.blocked[r * g.width + (c + dc)] && !g.blocked[(r + dr) * g.width + c]
}

export interface Field {
  /** Weighted cost from/to the source (Infinity if unreachable). Float64: float32 rounding breaks Dijkstra. */
  cost: Float64Array
  /** Walking time in seconds along the min-cost path. */
  time: Float64Array
}

/**
 * Dijkstra over the grid from `source`.
 * reverse = false: field[x] = cost to walk source -> x.
 * reverse = true:  field[x] = cost to walk x -> source (uses the opposite grade on every edge).
 */
export function dijkstraField(
  g: CostGrid,
  source: number,
  p: PlanningParams,
  profile: RouteProfileId,
  reverse = false,
): Field {
  const N = g.width * g.height
  const cost = new Float64Array(N).fill(Infinity)
  const time = new Float64Array(N).fill(Infinity)
  const w = profileWeights(profile, p)
  const heap = new MinHeap()
  cost[source] = 0
  time[source] = 0
  heap.push(0, source)
  while (heap.size > 0) {
    const u = heap.pop()
    const key = heap.popKey
    if (key > cost[u]) continue
    const c = u % g.width
    const r = (u - c) / g.width
    for (const [dc, dr] of NEIGH) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= g.width || nr >= g.height) continue
      const v = nr * g.width + nc
      if (g.blocked[v]) continue
      if (!diagonalOk(g, c, r, dc, dr)) continue
      // Forward walk goes u->v. Reverse field needs cost of walking v->u.
      const e = reverse ? edge(g, v, u, -dc, -dr, p, w) : edge(g, u, v, dc, dr, p, w)
      const nk = key + e.cost
      if (nk < cost[v]) {
        cost[v] = nk
        time[v] = time[u] + e.time
        heap.push(nk, v)
      }
    }
  }
  return { cost, time }
}

/** A* between two cells. Returns the cell index path or null. */
export function astar(
  g: CostGrid,
  start: number,
  goal: number,
  p: PlanningParams,
  profile: RouteProfileId,
): { cells: number[]; cost: number; time: number } | null {
  if (start < 0 || goal < 0 || g.blocked[start] || g.blocked[goal]) return null
  const N = g.width * g.height
  const gScore = new Float64Array(N).fill(Infinity)
  const tScore = new Float64Array(N)
  const parent = new Int32Array(N).fill(-1)
  const closed = new Uint8Array(N)
  const w = profileWeights(profile, p)
  const gc = goal % g.width
  const gr = (goal - gc) / g.width
  // Admissible lower bound: straight line at the best possible speed, no penalties.
  const vMax = (p.flatSpeedKmh / 3.6) * speedFactor(-0.05)
  const h = (i: number) => {
    const c = i % g.width
    const r = (i - c) / g.width
    return Math.hypot((c - gc) * g.cellX, (r - gr) * g.cellY) / vMax
  }
  const heap = new MinHeap()
  gScore[start] = 0
  heap.push(h(start), start)
  while (heap.size > 0) {
    const u = heap.pop()
    if (closed[u]) continue
    closed[u] = 1
    if (u === goal) break
    const c = u % g.width
    const r = (u - c) / g.width
    for (const [dc, dr] of NEIGH) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= g.width || nr >= g.height) continue
      const v = nr * g.width + nc
      if (g.blocked[v] || closed[v]) continue
      if (!diagonalOk(g, c, r, dc, dr)) continue
      const e = edge(g, u, v, dc, dr, p, w)
      const ng = gScore[u] + e.cost
      if (ng < gScore[v]) {
        gScore[v] = ng
        tScore[v] = tScore[u] + e.time
        parent[v] = u
        heap.push(ng + h(v), v)
      }
    }
  }
  if (!Number.isFinite(gScore[goal])) return null
  const cells: number[] = []
  for (let i = goal; i !== -1; i = parent[i]) cells.push(i)
  cells.reverse()
  return { cells, cost: gScore[goal], time: tScore[goal] }
}

/**
 * Follow a cost-to-go field downhill from `start` to its source. Used for abort routes:
 * the reverse field of the habitat (or support rover) gives the best way home from anywhere.
 */
export function descendField(
  g: CostGrid,
  field: Field,
  start: number,
  p: PlanningParams,
  profile: RouteProfileId,
): number[] | null {
  if (start < 0 || !Number.isFinite(field.cost[start])) return null
  const w = profileWeights(profile, p)
  const cells = [start]
  let cur = start
  for (let guard = 0; guard < g.width * g.height; guard++) {
    if (field.cost[cur] === 0) return cells
    const c = cur % g.width
    const r = (cur - c) / g.width
    let best = -1
    let bestVal = Infinity
    for (const [dc, dr] of NEIGH) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= g.width || nr >= g.height) continue
      const v = nr * g.width + nc
      if (g.blocked[v] || !Number.isFinite(field.cost[v])) continue
      if (!diagonalOk(g, c, r, dc, dr)) continue
      const e = edge(g, cur, v, dc, dr, p, w)
      const val = e.cost + field.cost[v]
      if (val < bestVal) {
        bestVal = val
        best = v
      }
    }
    if (best < 0 || best === cur) return null
    cur = best
    cells.push(cur)
  }
  return null
}

/** Convert cell indices to a lon/lat polyline, simplified without crossing blocked cells. */
export function cellsToPath(g: CostGrid, cells: number[], toleranceM = 2.5): LonLat[] {
  const pts = cells.map((i) => cellCenter(g, i % g.width, Math.floor(i / g.width)))
  if (pts.length < 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const crossesBlocked = (a: LonLat, b: LonLat) => {
    const d = distanceMeters(a, b)
    const n = Math.max(1, Math.ceil(d / (Math.min(g.cellX, g.cellY) * 0.5)))
    for (let k = 1; k < n; k++) {
      const t = k / n
      const i = lonLatToCellIdx(g, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
      if (i >= 0 && g.blocked[i]) return true
    }
    return false
  }
  const cosLat = Math.cos((pts[0][1] * Math.PI) / 180)
  const perp = (p: LonLat, a: LonLat, b: LonLat) => {
    const ax = a[0] * M_PER_DEG * cosLat, ay = a[1] * M_PER_DEG
    const bx = b[0] * M_PER_DEG * cosLat, by = b[1] * M_PER_DEG
    const px = p[0] * M_PER_DEG * cosLat, py = p[1] * M_PER_DEG
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    if (len2 === 0) return Math.hypot(px - ax, py - ay)
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
  }
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    if (e <= s + 1) continue
    let maxD = -1
    let idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = perp(pts[i], pts[s], pts[e])
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > toleranceM || crossesBlocked(pts[s], pts[e])) {
      keep[idx] = 1
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i] === 1)
}

export interface Waypoint {
  id: string
  name: string
  lonLat: LonLat
  kind: 'habitat' | 'rover' | 'science'
  optional?: boolean
}

export interface Leg {
  fromId: string
  toId: string
  path: LonLat[]
  distanceM: number
  timeS: number
}

export interface PlannedRoute {
  profile: RouteProfileId
  path: LonLat[]
  legs: Leg[]
  distanceM: number
  walkTimeS: number
  /** Ids of stops visited in order. */
  visited: string[]
  failed: string[]
}

/** Plan a loop start -> stops... -> end, one A* per leg. */
export function planLoop(
  g: CostGrid,
  p: PlanningParams,
  profile: RouteProfileId,
  start: Waypoint,
  stops: Waypoint[],
  end: Waypoint,
): PlannedRoute {
  const seq = [start, ...stops, end]
  const legs: Leg[] = []
  const failed: string[] = []
  const visited: string[] = [start.id]
  let full: LonLat[] = []
  let cur = start
  let curIdx = nearestFreeCell(g, lonLatToCellIdx(g, ...start.lonLat))
  for (let i = 1; i < seq.length; i++) {
    const next = seq[i]
    const goalIdx = nearestFreeCell(g, lonLatToCellIdx(g, ...next.lonLat))
    const res = curIdx >= 0 && goalIdx >= 0 ? astar(g, curIdx, goalIdx, p, profile) : null
    if (!res) {
      failed.push(next.id)
      continue
    }
    const path = cellsToPath(g, res.cells)
    let d = 0
    for (let k = 1; k < path.length; k++) d += distanceMeters(path[k - 1], path[k])
    legs.push({ fromId: cur.id, toId: next.id, path, distanceM: d, timeS: res.time })
    full = full.length ? full.concat(path.slice(1)) : path
    visited.push(next.id)
    cur = next
    curIdx = goalIdx
  }
  return {
    profile,
    path: full,
    legs,
    distanceM: legs.reduce((s, l) => s + l.distanceM, 0),
    walkTimeS: legs.reduce((s, l) => s + l.timeS, 0),
    visited,
    failed,
  }
}

/** Order optional stops greedily (nearest first by walking time from the previous point) until a time budget. */
export function addOptionalStops(
  g: CostGrid,
  p: PlanningParams,
  required: Waypoint[],
  optional: Waypoint[],
  start: Waypoint,
  end: Waypoint,
  budgetS: number,
): Waypoint[] {
  let stops = [...required]
  const remaining = [...optional]
  const evaluate = (candidate: Waypoint[]) => {
    const r = planLoop(g, p, 'science', start, candidate, end)
    return r.failed.length ? Infinity : r.walkTimeS + candidate.length * p.stopDwellMin * 60
  }
  let best = evaluate(stops)
  while (remaining.length) {
    let bestAdd: { wp: Waypoint; at: number; t: number } | null = null
    for (const wp of remaining) {
      for (let at = 0; at <= stops.length; at++) {
        const cand = [...stops.slice(0, at), wp, ...stops.slice(at)]
        const t = evaluate(cand)
        if (t <= budgetS && (!bestAdd || t - best < bestAdd.t - best)) bestAdd = { wp, at, t }
      }
    }
    if (!bestAdd) break
    stops = [...stops.slice(0, bestAdd.at), bestAdd.wp, ...stops.slice(bestAdd.at)]
    best = bestAdd.t
    remaining.splice(remaining.indexOf(bestAdd.wp), 1)
  }
  return stops
}

export interface Envelope {
  /** Best-case time from habitat to each cell (s). */
  out: Float64Array
  /** Best-case time from each cell back to the habitat (s). */
  back: Float64Array
}

/** Cells where the round trip out-and-back (without task time) fits in the budget. */
export function envelopeMask(env: Envelope, budgetS: number): Uint8Array {
  const m = new Uint8Array(env.out.length)
  for (let i = 0; i < m.length; i++) m[i] = env.out[i] + env.back[i] <= budgetS ? 1 : 0
  return m
}

export { DEFAULT_PARAMS }
