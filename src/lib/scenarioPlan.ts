/**
 * What an injected scenario does to the plan. These are rehearsal assumptions, always labeled as simulated.
 * - Dust storm: reduced visibility, so a slower suited walking speed.
 * - Oxygen leak: only part of the oxygen and suit time is left.
 * - SEP alert: the route is unchanged, the advice is to return to the nearest refuge.
 */
import { useMemo } from 'react'
import type { LonLat } from './crsMars.ts'
import type { PlanningParams } from './params.ts'
import type { ScenarioFlags } from './safety.ts'
import type { TimelineSample } from './walkPlan.ts'
import { useMissionStore } from '../stores/useMissionStore.ts'

export const STORM_SPEED_FACTOR = 0.7
export const LEAK_SUPPLY_FACTOR = 0.5

export function effectiveParams(p: PlanningParams, s: ScenarioFlags): PlanningParams {
  if (!s.dustStorm && !s.o2Leak) return p
  return {
    ...p,
    flatSpeedKmh: s.dustStorm ? p.flatSpeedKmh * STORM_SPEED_FACTOR : p.flatSpeedKmh,
    suitCapacityHours: s.o2Leak ? p.suitCapacityHours * LEAK_SUPPLY_FACTOR : p.suitCapacityHours,
    o2UsableKg: s.o2Leak ? p.o2UsableKg * LEAK_SUPPLY_FACTOR : p.o2UsableKg,
  }
}

/** Planning parameters with the injected scenarios applied. Stable while nothing changes. */
export function useEffectiveParams(): PlanningParams {
  const params = useMissionStore((s) => s.params)
  const scenario = useMissionStore((s) => s.scenario)
  return useMemo(() => effectiveParams(params, scenario), [params, scenario])
}

export interface AbortAdvice {
  /** Where the crew is assumed to be: the point of the route farthest from any refuge (worst case). */
  at: { d: number; lonLat: LonLat; t: number }
  habitatS: number
  roverS: number
  nearest: 'habitat' | 'rover'
  nearestS: number
  /** Budget left on arrival at the nearest refuge (negative = it no longer fits). */
  marginS: number
}

/**
 * Worst-case abort: at the sample that is farthest, in walking time, from both refuges, how long does it
 * take to reach the nearest one and does it fit in the remaining budget? Best-case direct walks, planning model.
 */
export function abortAdvice(
  timeline: TimelineSample[],
  budgetS: number,
  backHabitat: (p: LonLat) => number,
  backRover: (p: LonLat) => number,
): AbortAdvice | null {
  let best: AbortAdvice | null = null
  for (const s of timeline) {
    const habitatS = backHabitat(s.lonLat)
    const roverS = backRover(s.lonLat)
    const nearestS = Math.min(habitatS, roverS)
    if (!Number.isFinite(nearestS)) continue
    if (best && nearestS <= best.nearestS) continue
    best = {
      at: { d: s.d, lonLat: s.lonLat, t: s.t },
      habitatS,
      roverS,
      nearest: roverS < habitatS ? 'rover' : 'habitat',
      nearestS,
      marginS: budgetS - s.t - nearestS,
    }
  }
  return best
}
