import type { LonLat } from './crsMars.ts'
import type { PlanningParams } from './params.ts'
import type { PlannedRoute, Polygon, RouteProfileId, Waypoint } from './routing.ts'

export interface PlanRequest {
  type: 'plan'
  id: number
  params: PlanningParams
  noGo: Polygon[]
  habitat: Waypoint
  rover: Waypoint
  required: Waypoint[]
  optional: Waypoint[]
  /** Time budget (s) for adding optional stops in the science profile. */
  budgetS: number
}

export interface PlanResponse {
  type: 'planned'
  id: number
  routes: Record<RouteProfileId, PlannedRoute>
  /** Stops used by the science profile (required + any optional that fit). */
  scienceStopIds: string[]
  blockedPct: number
  grid: GridInfo
  /** Best-case time (s) from the habitat out to each cell and back, row-major, grid dims. */
  out: Float64Array
  back: Float64Array
  roverBack: Float64Array
  ms: number
}

export interface GridInfo {
  width: number
  height: number
  west: number
  north: number
  dLon: number
  dLat: number
}

export interface AbortRequest {
  type: 'abort'
  id: number
  from: LonLat
  params: PlanningParams
  noGo: Polygon[]
  habitat: Waypoint
  rover: Waypoint
}

export interface AbortResponse {
  type: 'aborted'
  id: number
  target: 'hab' | 'rover' | null
  path: LonLat[]
  timeS: number
}

export interface ViewshedRequest {
  type: 'viewshed'
  id: number
  observer: LonLat
  maxRangeM: number
  params: PlanningParams
  noGo: Polygon[]
}

export interface ViewshedResponse {
  type: 'viewshedDone'
  id: number
  grid: GridInfo
  visible: Uint8Array
}

export interface InitRequest {
  type: 'init'
  baseUrl: string
}

export interface ReadyResponse {
  type: 'ready'
  ok: boolean
  grid: GridInfo | null
}

export interface ErrorResponse {
  type: 'error'
  id: number
  message: string
}

export type WorkerRequest = InitRequest | PlanRequest | AbortRequest | ViewshedRequest
export type WorkerResponse = ReadyResponse | PlanResponse | AbortResponse | ViewshedResponse | ErrorResponse
