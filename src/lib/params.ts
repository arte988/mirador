/**
 * Planning assumptions. These are NOT NASA flight rules. They are conservative prototype values
 * that the UI always shows next to any result that depends on them.
 */
export interface PlanningParams {
  /** Slope above which terrain is flagged as caution and penalized by the safest profile (degrees). */
  cautionDeg: number
  /** Slope above which a cell is a no-go for a suited walker (degrees). */
  nogoDeg: number
  /** Flat-ground suited walking speed (km/h). */
  flatSpeedKmh: number
  /** Time spent at each science stop (minutes). */
  stopDwellMin: number
  /** Total simulated suit capacity (hours of nominal work). */
  suitCapacityHours: number
  /** Reserve that must remain when back at the habitat/rover (minutes). */
  reserveMin: number
  /** Crew body mass (kg, Earth mass). */
  bodyMassKg: number
  /** Mars surface gravity (m/s^2). */
  marsGravity: number
  /** Multiplier for suit mobility penalty on walking energy. */
  suitPenalty: number
  /** Usable oxygen (kg). */
  o2UsableKg: number
  /** Battery capacity (Wh) and average electrical draw (W). */
  batteryWh: number
  batteryDrawW: number
  /** Planning dose budget for one EVA (mSv). Not a limit: just a number the crew can compare against. */
  doseBudgetMsv: number
  /** Lowest Sun elevation that still counts as a useful EVA window (degrees). */
  minSunElevationDeg: number
}

export const DEFAULT_PARAMS: PlanningParams = {
  cautionDeg: 15,
  nogoDeg: 25,
  flatSpeedKmh: 1.8,
  stopDwellMin: 15,
  suitCapacityHours: 6,
  reserveMin: 30,
  bodyMassKg: 80,
  marsGravity: 3.71,
  suitPenalty: 1.6,
  o2UsableKg: 0.6,
  batteryWh: 560,
  batteryDrawW: 80,
  doseBudgetMsv: 0.1,
  minSunElevationDeg: 10,
}

export const EARTH_GRAVITY = 9.80665
