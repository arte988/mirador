/**
 * Temperature-change bands for the climate card.
 * Planning assumptions, to verify. Not a flight rule and not a medical limit.
 * The dust-storm flag is never set from these bands.
 */
export const RISK_AMBER_K = 5
export const RISK_RED_K = 15

export type WalkRisk = 'green' | 'amber' | 'red'

/** Absolute change of the forecast median versus the last measured value, in kelvin. */
export function walkRisk(deltaK: number): WalkRisk {
  const change = Math.abs(deltaK)
  if (change >= RISK_RED_K) return 'red'
  if (change >= RISK_AMBER_K) return 'amber'
  return 'green'
}
