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
