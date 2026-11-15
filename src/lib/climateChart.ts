export interface ChartPoint {
  sol: number
  history: number | null
  forecast: number | null
  /** [q10, q90] on forecast sols. Recharts draws this as a range area. */
  band: [number, number] | null
  whatIf: number | null
}

/** History as a solid line, forecast as a dotted line that starts on the last measured sol. */
export function buildChartPoints(opts: {
  history: { sol: number; value: number }[]
  lastSol: number
  lastValue: number
  q10: number[]
  q50: number[]
  q90: number[]
  whatIf: number[] | null
}): ChartPoint[] {
  const past = opts.history.filter((p) => p.sol < opts.lastSol)
  const points: ChartPoint[] = past.map((p) => ({
    sol: p.sol,
    history: p.value,
    forecast: null,
    band: null,
    whatIf: null,
  }))
  const n = Math.min(opts.q50.length, opts.q10.length, opts.q90.length)
  const showWhatIf = opts.whatIf !== null && opts.whatIf.length >= n && n > 0
  points.push({
    sol: opts.lastSol,
    history: opts.lastValue,
    forecast: opts.lastValue,
    band: null,
    whatIf: showWhatIf ? opts.lastValue : null,
  })
  for (let i = 0; i < n; i++) {
    points.push({
      sol: opts.lastSol + i + 1,
      history: null,
      forecast: opts.q50[i] ?? null,
      band: [opts.q10[i] ?? opts.q50[i] ?? 0, opts.q90[i] ?? opts.q50[i] ?? 0],
      whatIf: showWhatIf ? (opts.whatIf?.[i] ?? null) : null,
    })
  }
  return points
}

/**
 * Axis domain for the values on screen. Pads 5% of the span on each side.
 * Does not pull the axis down to zero.
 */
export function chartYDomain(values: number[]): [number, number] {
  const nums = values.filter((n) => Number.isFinite(n))
  if (nums.length === 0) return [0, 1]
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min
  const pad = span === 0 ? Math.max(Math.abs(min) * 0.05, 0.5) : span * 0.05
  return [min - pad, max + pad]
}

export function chartValues(points: ChartPoint[]): number[] {
  const values: number[] = []
  for (const p of points) {
    if (p.history !== null) values.push(p.history)
    if (p.forecast !== null) values.push(p.forecast)
    if (p.whatIf !== null) values.push(p.whatIf)
    if (p.band) values.push(p.band[0], p.band[1])
  }
  return values
}
