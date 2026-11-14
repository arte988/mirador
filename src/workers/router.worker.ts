/// <reference lib="webworker" />
/**
 * Route solver running off the main thread. Loads the local DTM itself, builds the cost grid once, and
 * answers plan / abort / viewshed requests. Heavy fields are cached per (params, no-go) key.
 */
import { loadDtm } from '../lib/dtm.ts'
import { viewshed } from '../lib/los.ts'
import type { PlanningParams } from '../lib/params.ts'
import {
  addOptionalStops,
  applyBlockers,
  buildCostGrid,
  cellsToPath,
  descendField,
  dijkstraField,
  lonLatToCellIdx,
  nearestFreeCell,
  planLoop,
  type CostGrid,
  type Field,
  type Polygon,
  type RouteProfileId,
} from '../lib/routing.ts'
import type { GridInfo, WorkerRequest, WorkerResponse } from '../lib/routerTypes.ts'

const ctx = self as unknown as DedicatedWorkerGlobalScope
let grid: CostGrid | null = null

interface FieldCache {
  key: string
  habBack: Field
  roverBack: Field
  habOut: Field
}
let cache: FieldCache | null = null

const gridInfo = (g: CostGrid): GridInfo => ({ width: g.width, height: g.height, west: g.west, north: g.north, dLon: g.dLon, dLat: g.dLat })
const post = (m: WorkerResponse, transfer: Transferable[] = []) => ctx.postMessage(m, transfer)

function prepare(params: PlanningParams, noGo: Polygon[]): CostGrid {
  if (!grid) throw new Error('DTM not loaded')
  applyBlockers(grid, params, noGo)
  return grid
}

function fieldsFor(g: CostGrid, params: PlanningParams, noGo: Polygon[], habIdx: number, roverIdx: number): FieldCache {
  const key = JSON.stringify([params, noGo, habIdx, roverIdx])
  if (cache && cache.key === key) return cache
  cache = {
    key,
    // Best-case (fastest) times for the walk-back envelope and abort routes.
    habOut: dijkstraField(g, habIdx, params, 'fastest', false),
    habBack: dijkstraField(g, habIdx, params, 'fastest', true),
    roverBack: dijkstraField(g, roverIdx, params, 'fastest', true),
  }
  return cache
}

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      const dtm = await loadDtm(msg.baseUrl)
      if (!dtm) {
        post({ type: 'ready', ok: false, grid: null })
        return
      }
      grid = buildCostGrid(dtm, 2)
      post({ type: 'ready', ok: true, grid: gridInfo(grid) })
      return
    }
    if (msg.type === 'plan') {
      const t0 = performance.now()
      const g = prepare(msg.params, msg.noGo)
      const blocked = g.blocked.reduce((s, v) => s + v, 0)
      const habIdx = nearestFreeCell(g, lonLatToCellIdx(g, ...msg.habitat.lonLat))
      const roverIdx = nearestFreeCell(g, lonLatToCellIdx(g, ...msg.rover.lonLat))
      const f = fieldsFor(g, msg.params, msg.noGo, habIdx, roverIdx)
      const profiles: RouteProfileId[] = ['safest', 'fastest', 'science']
      const stopsFor = (id: RouteProfileId) =>
        id === 'science'
          ? addOptionalStops(g, msg.params, msg.required, msg.optional, msg.habitat, msg.rover, msg.budgetS)
          : msg.required
      const sciStops = stopsFor('science')
      const routes = {} as Record<RouteProfileId, ReturnType<typeof planLoop>>
      for (const p of profiles) {
        routes[p] = planLoop(g, msg.params, p, msg.habitat, p === 'science' ? sciStops : msg.required, msg.rover)
      }
      const res = {
        type: 'planned' as const,
        id: msg.id,
        routes,
        scienceStopIds: sciStops.map((s) => s.id),
        blockedPct: (100 * blocked) / g.blocked.length,
        grid: gridInfo(g),
        out: f.habOut.time.slice(),
        back: f.habBack.time.slice(),
        roverBack: f.roverBack.time.slice(),
        ms: performance.now() - t0,
      }
      // Copies are posted (not transferred) so the cached fields stay available for abort requests.
      post(res)
      return
    }
    if (msg.type === 'abort') {
      const g = prepare(msg.params, msg.noGo)
      const habIdx = nearestFreeCell(g, lonLatToCellIdx(g, ...msg.habitat.lonLat))
      const roverIdx = nearestFreeCell(g, lonLatToCellIdx(g, ...msg.rover.lonLat))
      const f = fieldsFor(g, msg.params, msg.noGo, habIdx, roverIdx)
      const start = nearestFreeCell(g, lonLatToCellIdx(g, ...msg.from))
      const tHab = start >= 0 ? f.habBack.cost[start] : Infinity
      const tRover = start >= 0 ? f.roverBack.cost[start] : Infinity
      const toHab = tHab <= tRover
      const field = toHab ? f.habBack : f.roverBack
      const cells = start >= 0 ? descendField(g, field, start, msg.params, 'fastest') : null
      if (!cells) {
        post({ type: 'aborted', id: msg.id, target: null, path: [], timeS: Infinity })
        return
      }
      post({
        type: 'aborted',
        id: msg.id,
        target: toHab ? 'hab' : 'rover',
        path: cellsToPath(g, cells),
        timeS: field.time[start],
      })
      return
    }
    if (msg.type === 'viewshed') {
      const g = prepare(msg.params, msg.noGo)
      const obs = lonLatToCellIdx(g, ...msg.observer)
      const visible = obs >= 0 ? viewshed(g, obs, msg.maxRangeM) : new Uint8Array(g.width * g.height)
      post({ type: 'viewshedDone', id: msg.id, grid: gridInfo(g), visible }, [visible.buffer])
      return
    }
  } catch (err) {
    post({ type: 'error', id: (msg as { id?: number }).id ?? -1, message: err instanceof Error ? err.message : String(err) })
  }
}
