/**
 * Turn a planned route into numbers the UI and the HUD simulator can use: elevation profile, slope stats,
 * simulated consumables and a time-indexed timeline. Everything here is a planning model.
 */
import { distanceMeters, type LonLat } from './crsMars.ts'
import { profileAlong, type Dtm, type ElevationProfile } from './dtm.ts'
import {
  RESTING_WATTS,
  KJ_PER_LITER_O2,
  addDwell,
  consumablesForProfile,
  o2CapacityLiters,
  remainingFractions,
  walkSpeedMs,
  walkingWatts,
  type Consumables,
} from './metabolic.ts'
import type { PlanningParams } from './params.ts'
import type { PlannedRoute, Waypoint } from './routing.ts'

export interface TimelineSample {
  /** Seconds since the start of the EVA. */
  t: number
  /** Meters walked. */
  d: number
  lonLat: LonLat
  z: number
  energyKJ: number
  dwell: boolean
  /** Stop id when this sample is at a science stop. */
  stopId?: string
}

export interface RouteAnalysis {
  profile: ElevationProfile
  maxSlopeDeg: number
  ascent: number
  descent: number
  /** Distance (m) along the route where each visited stop sits. */
  stopDistances: { id: string; name: string; d: number }[]
  consumables: Consumables
  walkTimeS: number
  totalTimeS: number
  fractionsAtEnd: { o2: number; battery: number; time: number }
  timeline: TimelineSample[]
  /** Share (0-1) of path samples above the caution slope. */
  cautionShare: number
}

export function analyzeRoute(
  route: PlannedRoute,
  stops: Waypoint[],
  dtm: Dtm,
  p: PlanningParams,
): RouteAnalysis {
  const profile = profileAlong(dtm, route.path, 8)
  // Locate each visited science stop along the profile by nearest sample.
  const stopDistances: { id: string; name: string; d: number }[] = []
  for (const s of stops) {
    if (!route.visited.includes(s.id)) continue
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < profile.lonLat.length; i++) {
      const dd = distanceMeters(profile.lonLat[i], s.lonLat)
      if (dd < bestD) {
        bestD = dd
        best = i
      }
    }
    stopDistances.push({ id: s.id, name: s.name, d: profile.distance[best] })
  }
  stopDistances.sort((a, b) => a.d - b.d)

  // Timeline (walk segments + dwell at stops).
  const timeline: TimelineSample[] = []
  let t = 0
  let energy = 0
  let nextStop = 0
  const dwellS = p.stopDwellMin * 60
  for (let i = 0; i < profile.distance.length; i++) {
    if (i > 0) {
      const dd = profile.distance[i] - profile.distance[i - 1]
      const dz = profile.elevation[i] - profile.elevation[i - 1]
      const grade = Number.isFinite(dz) && dd > 0 ? dz / dd : 0
      const dt = dd / walkSpeedMs(grade, p)
      t += dt
      energy += (walkingWatts(grade, p) * dt) / 1000
    }
    timeline.push({ t, d: profile.distance[i], lonLat: profile.lonLat[i], z: profile.elevation[i], energyKJ: energy, dwell: false })
    while (nextStop < stopDistances.length && profile.distance[i] >= stopDistances[nextStop].d - 1e-6) {
      const stop = stopDistances[nextStop]
      t += dwellS
      energy += (RESTING_WATTS * dwellS) / 1000
      timeline.push({ t, d: profile.distance[i], lonLat: profile.lonLat[i], z: profile.elevation[i], energyKJ: energy, dwell: true, stopId: stop.id })
      nextStop++
    }
  }
  const walk = consumablesForProfile(profile.distance, profile.elevation, p)
  const consumables = addDwell(walk, stopDistances.length * p.stopDwellMin, p)
  const caution = profile.slopeDeg.filter((s) => s > p.cautionDeg).length
  return {
    profile,
    maxSlopeDeg: profile.maxSlopeDeg,
    ascent: profile.ascent,
    descent: profile.descent,
    stopDistances,
    consumables,
    walkTimeS: walk.seconds,
    totalTimeS: consumables.seconds,
    fractionsAtEnd: remainingFractions(consumables, p),
    timeline,
    cautionShare: profile.slopeDeg.length ? caution / profile.slopeDeg.length : 0,
  }
}

/** Interpolated sample at an elapsed time. */
export function stateAt(timeline: TimelineSample[], tSec: number): TimelineSample & { index: number } {
  if (timeline.length === 0) throw new Error('empty timeline')
  if (tSec <= 0) return { ...timeline[0], index: 0 }
  const last = timeline[timeline.length - 1]
  if (tSec >= last.t) return { ...last, index: timeline.length - 1 }
  let lo = 0
  let hi = timeline.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (timeline[mid].t <= tSec) lo = mid
    else hi = mid
  }
  const a = timeline[lo]
  const b = timeline[hi]
  const f = b.t === a.t ? 0 : (tSec - a.t) / (b.t - a.t)
  return {
    t: tSec,
    d: a.d + (b.d - a.d) * f,
    lonLat: [a.lonLat[0] + (b.lonLat[0] - a.lonLat[0]) * f, a.lonLat[1] + (b.lonLat[1] - a.lonLat[1]) * f],
    z: a.z + (b.z - a.z) * f,
    energyKJ: a.energyKJ + (b.energyKJ - a.energyKJ) * f,
    dwell: b.dwell && f > 0 ? true : a.dwell,
    stopId: b.dwell ? b.stopId : a.stopId,
    index: lo,
  }
}

/** O2 and battery fractions remaining for a timeline state. */
export function consumablesAt(s: { t: number; energyKJ: number }, p: PlanningParams) {
  const o2Used = s.energyKJ / KJ_PER_LITER_O2
  const battUsed = (s.t / 3600) * p.batteryDrawW
  const o2 = Math.max(0, 1 - o2Used / o2CapacityLiters(p))
  const battery = Math.max(0, 1 - battUsed / p.batteryWh)
  const time = Math.max(0, 1 - s.t / (p.suitCapacityHours * 3600))
  // Seconds of work left at the current pace (the most limiting of the three), planning model.
  const avgW = s.t > 0 ? Math.max(80, (s.energyKJ * 1000) / s.t) : 200
  const byO2 = (o2 * o2CapacityLiters(p) * KJ_PER_LITER_O2 * 1000) / avgW
  const byBattery = battery * (p.batteryWh / p.batteryDrawW) * 3600
  const byTime = time * p.suitCapacityHours * 3600
  return { o2, battery, time, secondsLeft: Math.max(0, Math.min(byO2, byBattery, byTime)) }
}

/** Heading (deg clockwise from north) along the route around a distance, looking ahead. */
export function headingAt(path: LonLat[], from: LonLat, lookAheadM = 25): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < path.length; i++) {
    const d = distanceMeters(path[i], from)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  let target = path[Math.min(path.length - 1, best + 1)]
  for (let i = best + 1; i < path.length; i++) {
    target = path[i]
    if (distanceMeters(from, path[i]) >= lookAheadM) break
  }
  const dx = (target[0] - from[0]) * Math.cos((from[1] * Math.PI) / 180)
  const dy = target[1] - from[1]
  return (((Math.atan2(dx, dy) * 180) / Math.PI) % 360 + 360) % 360
}

export interface WalkBackSummary {
  /** Smallest slack (s) between the remaining time budget and the best-case direct walk back to the habitat. */
  minMarginS: number
  /** Where along the route that minimum happens. */
  minAt: { d: number; lonLat: LonLat } | null
  /** First sample where a direct walk back no longer fits the budget (null = the route always stays inside the limit). */
  pointOfNoReturn: { d: number; t: number; lonLat: LonLat; backS: number } | null
}

/**
 * Walk-back check along a planned route. At every timeline sample the remaining budget is
 * `budgetS - t` and the best-case direct return is `backTime(position)`. This is about elapsed time only,
 * not oxygen, which is reported separately.
 */
export function walkBackSummary(timeline: TimelineSample[], budgetS: number, backTime: (p: LonLat) => number): WalkBackSummary {
  let minMarginS = Infinity
  let minAt: WalkBackSummary['minAt'] = null
  let pnr: WalkBackSummary['pointOfNoReturn'] = null
  for (const s of timeline) {
    const back = backTime(s.lonLat)
    if (!Number.isFinite(back)) continue
    const margin = budgetS - s.t - back
    if (margin < minMarginS) {
      minMarginS = margin
      minAt = { d: s.d, lonLat: s.lonLat }
    }
    if (margin < 0 && !pnr) pnr = { d: s.d, t: s.t, lonLat: s.lonLat, backS: back }
  }
  return { minMarginS, minAt, pointOfNoReturn: pnr }
}
