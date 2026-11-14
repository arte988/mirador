/**
 * Simulated suit consumables driven by terrain.
 *
 * Walking cost uses the Minetti et al. (2002) metabolic cost-of-walking polynomial (J / (kg m)) as a
 * function of grade, scaled for Mars gravity and a suit mobility penalty. This is a simplified
 * planning model, not suit telemetry. All outputs must be labeled "Simulated" in the UI.
 */
import { DEFAULT_PARAMS, EARTH_GRAVITY, type PlanningParams } from './params.ts'

/** Energy equivalent of one liter of O2 consumed (kJ per liter, ~ 20.9). */
export const KJ_PER_LITER_O2 = 20.9
/** O2 density at standard conditions (g per liter). */
export const O2_G_PER_L = 1.429

/** Tobler-shaped speed factor relative to flat ground (1 on flat). grade = rise/run, uphill positive. */
export function speedFactor(grade: number): number {
  const g = Math.max(-0.6, Math.min(0.9, grade))
  return Math.exp(-3.5 * (Math.abs(g + 0.05) - 0.05))
}

/** Suited walking speed in m/s for a grade. */
export function walkSpeedMs(grade: number, p: PlanningParams = DEFAULT_PARAMS): number {
  return Math.max(0.05, (p.flatSpeedKmh / 3.6) * speedFactor(grade))
}

/** Minetti 2002 walking cost (J/kg/m) at a grade (clamped to the validity range -0.45..0.45). */
export function minettiWalkCost(grade: number): number {
  const i = Math.max(-0.45, Math.min(0.45, grade))
  return 280.5 * i ** 5 - 58.7 * i ** 4 - 76.8 * i ** 3 + 51.9 * i ** 2 + 19.6 * i + 2.5
}

/** Metabolic power in watts for walking at a grade (Mars gravity, suit penalty). */
export function walkingWatts(grade: number, p: PlanningParams = DEFAULT_PARAMS): number {
  const v = walkSpeedMs(grade, p)
  const gravityScale = p.marsGravity / EARTH_GRAVITY
  // Resting metabolism (~100 W) plus gravity-scaled, suit-penalized walking power.
  return 100 + Math.max(0, minettiWalkCost(grade)) * p.bodyMassKg * gravityScale * v * p.suitPenalty * 2.2
}

export const RESTING_WATTS = 130

export interface Consumables {
  seconds: number
  energyKJ: number
  o2Liters: number
  o2Kg: number
  batteryWh: number
}

export const zeroConsumables = (): Consumables => ({ seconds: 0, energyKJ: 0, o2Liters: 0, o2Kg: 0, batteryWh: 0 })

function finalize(c: Consumables, p: PlanningParams): Consumables {
  c.o2Liters = c.energyKJ / KJ_PER_LITER_O2
  c.o2Kg = (c.o2Liters * O2_G_PER_L) / 1000
  c.batteryWh = (c.seconds / 3600) * p.batteryDrawW
  return c
}

/** Consumables for walking a distance/elevation profile (arrays of equal length). */
export function consumablesForProfile(
  distance: number[],
  elevation: number[],
  p: PlanningParams = DEFAULT_PARAMS,
): Consumables {
  const c = zeroConsumables()
  for (let i = 1; i < distance.length; i++) {
    const dd = distance[i] - distance[i - 1]
    if (dd <= 0) continue
    const dz = elevation[i] - elevation[i - 1]
    const grade = Number.isFinite(dz) ? dz / dd : 0
    const t = dd / walkSpeedMs(grade, p)
    c.seconds += t
    c.energyKJ += (walkingWatts(grade, p) * t) / 1000
  }
  return finalize(c, p)
}

/** Add dwell time at science stops (resting metabolism). */
export function addDwell(c: Consumables, minutes: number, p: PlanningParams = DEFAULT_PARAMS): Consumables {
  const t = minutes * 60
  const out = { ...c }
  out.seconds += t
  out.energyKJ += (RESTING_WATTS * t) / 1000
  return finalize(out, p)
}

/** Usable O2 capacity in liters for the configured mass. */
export function o2CapacityLiters(p: PlanningParams = DEFAULT_PARAMS): number {
  return (p.o2UsableKg * 1000) / O2_G_PER_L
}

/** Fraction (0-1) of O2 and battery remaining after a consumption total. */
export function remainingFractions(c: Consumables, p: PlanningParams = DEFAULT_PARAMS) {
  return {
    o2: Math.max(0, 1 - c.o2Liters / o2CapacityLiters(p)),
    battery: Math.max(0, 1 - c.batteryWh / p.batteryWh),
    time: Math.max(0, 1 - c.seconds / (p.suitCapacityHours * 3600)),
  }
}

/** Seconds of work left at the current usage (min of O2, battery and nominal suit time). */
export function secondsRemaining(c: Consumables, p: PlanningParams = DEFAULT_PARAMS): number {
  const f = remainingFractions(c, p)
  const byTime = f.time * p.suitCapacityHours * 3600
  // Project O2 and battery using the average rates so far (fall back to nominal).
  const avgW = c.seconds > 0 ? (c.energyKJ * 1000) / c.seconds : 200
  const o2Left = o2CapacityLiters(p) * f.o2
  const byO2 = ((o2Left * KJ_PER_LITER_O2 * 1000) / Math.max(avgW, 50))
  const byBattery = f.battery * (p.batteryWh / p.batteryDrawW) * 3600
  return Math.max(0, Math.min(byTime, byO2, byBattery))
}
