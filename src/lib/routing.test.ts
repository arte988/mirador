import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params.ts'
import { decodeDtm, profileAlong, type DtmMeta } from './dtm.ts'
import {
  addOptionalStops,
  applyBlockers,
  astar,
  buildCostGrid,
  cellsToPath,
  descendField,
  dijkstraField,
  envelopeMask,
  lonLatToCellIdx,
  nearestFreeCell,
  planLoop,
  pointInPolygon,
  type CostGrid,
  type Polygon,
} from './routing.ts'
import { DEFAULT_REQUIRED_IDS, HABITAT, SCIENCE_STOPS, SUPPORT_ROVER } from '../data/sites.ts'

function flatGrid(w: number, h: number, slopeDeg = 0): CostGrid {
  const n = w * h
  return {
    width: w,
    height: h,
    factor: 1,
    west: 137.0,
    north: -4.0,
    dLon: 8 / 59274.6975,
    dLat: 8 / 59274.6975,
    cellX: 8,
    cellY: 8,
    z: new Float32Array(n),
    slope: new Float32Array(n).fill(slopeDeg),
    rough: new Float32Array(n),
    invalid: new Uint8Array(n),
    blocked: new Uint8Array(n),
  }
}

describe('routing on a synthetic grid', () => {
  it('connects two cells on flat ground', () => {
    const g = flatGrid(60, 40)
    applyBlockers(g, DEFAULT_PARAMS)
    const res = astar(g, 2 * 60 + 2, 30 * 60 + 55, DEFAULT_PARAMS, 'fastest')
    expect(res).not.toBeNull()
    expect(res!.time).toBeGreaterThan(0)
  })

  it('detours around a drawn no-go polygon', () => {
    const g = flatGrid(80, 60)
    // Polygon spans a wall across the middle with a gap near the top.
    const x = (c: number) => g.west + c * g.dLon
    const y = (r: number) => g.north - r * g.dLat
    const wall: Polygon = [
      [x(38), y(15)],
      [x(42), y(15)],
      [x(42), y(59)],
      [x(38), y(59)],
    ]
    applyBlockers(g, DEFAULT_PARAMS, [wall])
    const start = 30 * 80 + 5
    const goal = 30 * 80 + 74
    const res = astar(g, start, goal, DEFAULT_PARAMS, 'fastest')
    expect(res).not.toBeNull()
    const path = cellsToPath(g, res!.cells)
    for (const [lon, lat] of path) expect(pointInPolygon([lon, lat], wall)).toBe(false)
    // The detour must go through the gap (rows < 15) so it is longer than the straight line.
    const minRow = Math.min(...res!.cells.map((i) => Math.floor(i / 80)))
    expect(minRow).toBeLessThan(15)
    // No simplified segment may cross blocked cells.
    for (let i = 1; i < path.length; i++) {
      for (let k = 0; k <= 20; k++) {
        const t = k / 20
        const idx = lonLatToCellIdx(g, path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t)
        expect(g.blocked[idx]).toBe(0)
      }
    }
  })

  it('returns null when the goal is walled off', () => {
    const g = flatGrid(30, 30)
    for (let r = 0; r < 30; r++) g.blocked[r * 30 + 15] = 1
    expect(astar(g, 15 * 30 + 2, 15 * 30 + 27, DEFAULT_PARAMS, 'fastest')).toBeNull()
  })

  it('blocks cells above the no-go slope', () => {
    const g = flatGrid(10, 10, 30)
    expect(applyBlockers(g, DEFAULT_PARAMS)).toBe(100)
  })

  it('reverse field gives the best way home and descent follows it', () => {
    const g = flatGrid(50, 50)
    applyBlockers(g, DEFAULT_PARAMS)
    const home = 25 * 50 + 25
    const back = dijkstraField(g, home, DEFAULT_PARAMS, 'fastest', true)
    const start = 3 * 50 + 4
    const cells = descendField(g, back, start, DEFAULT_PARAMS, 'fastest')
    expect(cells).not.toBeNull()
    expect(cells![cells!.length - 1]).toBe(home)
    // Cost-to-go equals A* cost from start to home on a symmetric flat grid.
    const a = astar(g, start, home, DEFAULT_PARAMS, 'fastest')!
    expect(back.cost[start]).toBeCloseTo(a.cost, 0)
  })

  it('round trip envelope grows with the budget', () => {
    const g = flatGrid(40, 40)
    applyBlockers(g, DEFAULT_PARAMS)
    const home = 20 * 40 + 20
    const out = dijkstraField(g, home, DEFAULT_PARAMS, 'fastest')
    const back = dijkstraField(g, home, DEFAULT_PARAMS, 'fastest', true)
    const small = envelopeMask({ out: out.time, back: back.time }, 600).reduce((s, v) => s + v, 0)
    const big = envelopeMask({ out: out.time, back: back.time }, 1800).reduce((s, v) => s + v, 0)
    expect(big).toBeGreaterThan(small)
    expect(small).toBeGreaterThan(0)
  })
})

describe('routing on the committed Gale DTM crop', () => {
  const meta = JSON.parse(readFileSync('public/dtm/gale_aoi_4m.json', 'utf8')) as DtmMeta
  const bin = readFileSync('public/dtm/gale_aoi_4m.bin')
  const dtm = decodeDtm(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)
  const g = buildCostGrid(dtm, 2)
  applyBlockers(g, DEFAULT_PARAMS)
  const required = SCIENCE_STOPS.filter((s) => DEFAULT_REQUIRED_IDS.includes(s.id))

  it('keeps a stop inside walkable terrain', () => {
    for (const wp of [HABITAT, SUPPORT_ROVER, ...SCIENCE_STOPS]) {
      const idx = nearestFreeCell(g, lonLatToCellIdx(g, ...wp.lonLat))
      expect(idx).toBeGreaterThanOrEqual(0)
    }
  })

  it('plans all three profiles to every required stop', () => {
    const results = (['fastest', 'safest', 'science'] as const).map((p) => planLoop(g, DEFAULT_PARAMS, p, HABITAT, required, SUPPORT_ROVER))
    for (const r of results) {
      expect(r.failed).toEqual([])
      expect(r.path.length).toBeGreaterThan(3)
      expect(r.walkTimeS).toBeGreaterThan(300)
    }
    const [fast, safe] = results
    // The fastest profile is never slower than the safest one.
    expect(fast.walkTimeS).toBeLessThanOrEqual(safe.walkTimeS + 1)
    // Safest keeps a lower peak slope along the route than fastest (or equal).
    const maxSlope = (path: [number, number][]) => profileAlong(dtm, path, 8).maxSlopeDeg
    expect(maxSlope(safe.path)).toBeLessThanOrEqual(maxSlope(fast.path) + 0.5)
  })

  it('adds optional stops within a time budget', () => {
    const stops = addOptionalStops(g, DEFAULT_PARAMS, required, SCIENCE_STOPS.filter((s) => s.optional), HABITAT, SUPPORT_ROVER, 3.5 * 3600)
    expect(stops.length).toBeGreaterThanOrEqual(required.length)
  })
})
