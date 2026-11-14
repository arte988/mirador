/**
 * Walk simulation read model. The EVA is simulated (no GPS, no suit telemetry): position and consumables
 * are computed from the planned timeline and the simulation clock.
 */
import { distanceMeters, type LonLat } from './crsMars.ts'
import type { PlanningParams } from './params.ts'
import { consumablesAt, headingAt, stateAt, type TimelineSample } from './walkPlan.ts'
import type { AbortRoute, BuddyRole, RouteResult } from '../stores/useMissionStore.ts'
import type { RouteProfileId } from './routing.ts'

export interface SimView {
  position: LonLat
  heading: number
  /** Distance walked on the active path (m). */
  distanceM: number
  totalM: number
  progress: number
  /** 'stop' uses nextName (proper noun); hab/rover are translated by the UI. */
  nextKind: 'stop' | 'hab' | 'rover'
  nextName: string | null
  nextDistanceM: number | null
  /** True while the walker is standing at a science stop. */
  atStop: boolean
  stopId?: string
  elevation: number
  o2: number
  battery: number
  secondsLeft: number
  energyKJ: number
  finished: boolean
  buddy: LonLat | null
  activePath: LonLat[]
}

export interface SimInput {
  routes: Partial<Record<RouteProfileId, RouteResult>>
  selectedProfile: RouteProfileId
  elapsedS: number
  abortRoute: AbortRoute | null
  aborting: boolean
  buddyRole: BuddyRole
  params: PlanningParams
  rover: LonLat
}

const BUDDY_LAG_S = 90

export function simulate(input: SimInput): SimView | null {
  const main = input.routes[input.selectedProfile]
  if (!main) return null
  const { params } = input
  let state: TimelineSample & { index: number }
  let energy: number
  let path: LonLat[]
  let finished = false
  let nextName: string | null = null
  let nextKind: 'stop' | 'hab' | 'rover' = 'rover'
  let nextDistanceM: number | null = null
  let totalM: number

  if (input.aborting && input.abortRoute) {
    const a = input.abortRoute
    const t = Math.max(0, input.elapsedS - a.startElapsedS)
    state = stateAt(a.analysis.timeline, t)
    energy = a.startEnergyKJ + state.energyKJ
    path = a.path
    totalM = a.analysis.profile.length
    finished = t >= a.analysis.timeline[a.analysis.timeline.length - 1].t
    nextKind = a.target
    nextDistanceM = Math.max(0, totalM - state.d)
  } else {
    const tl = main.analysis.timeline
    state = stateAt(tl, input.elapsedS)
    energy = state.energyKJ
    path = main.route.path
    totalM = main.analysis.profile.length
    finished = input.elapsedS >= tl[tl.length - 1].t
    const upcoming = main.analysis.stopDistances.find((s) => s.d > state.d + 1)
    if (upcoming) {
      nextName = upcoming.name
      nextKind = 'stop'
      nextDistanceM = upcoming.d - state.d
    } else {
      nextKind = 'rover'
      nextDistanceM = Math.max(0, totalM - state.d)
    }
  }
  const c = consumablesAt({ t: input.elapsedS, energyKJ: energy }, params)

  let buddy: LonLat | null = null
  if (input.buddyRole === 'rover') buddy = input.rover
  else if (input.buddyRole === 'follow') buddy = stateAt(main.analysis.timeline, Math.max(0, input.elapsedS - BUDDY_LAG_S)).lonLat
  else {
    const safest = input.routes.safest
    buddy = safest ? stateAt(safest.analysis.timeline, input.elapsedS).lonLat : null
  }

  return {
    position: state.lonLat,
    heading: headingAt(path, state.lonLat),
    distanceM: state.d,
    totalM,
    progress: totalM > 0 ? Math.min(1, state.d / totalM) : 0,
    nextKind,
    nextName,
    nextDistanceM,
    atStop: state.dwell && !!state.stopId,
    stopId: state.stopId,
    elevation: state.z,
    o2: c.o2,
    battery: c.battery,
    secondsLeft: c.secondsLeft,
    energyKJ: energy,
    finished,
    buddy,
    activePath: path,
  }
}

/** Straight-line distance helper for HUD labels. */
export const metersBetween = (a: LonLat, b: LonLat) => distanceMeters(a, b)
