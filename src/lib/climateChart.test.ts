import { describe, expect, it } from 'vitest'
import { buildChartPoints } from './climateChart.ts'
import { sliceQuantiles, type ForecastSeries } from './climateForecast.ts'
import { walkRisk } from '../data/climateRisk.ts'
import { applyCo2, co2Offset } from './climateWhatIf.ts'

const series = (q50: number[]): ForecastSeries => ({
  unit: 'C',
  status: 'prediction',
  q10: q50.map((v) => v - 1),
  q50,
  q90: q50.map((v) => v + 1),
  mae_timesfm: 1,
  mae_persistence: 2,
  mae_climatology: 3,
  reason: 'beats persistence',
})

describe('horizon slice', () => {
  it('keeps the requested sols and reports a short file', () => {
    const full = sliceQuantiles(series([-1, -2, -3]), 3)
    expect(full.q50).toEqual([-1, -2, -3])
    expect(full.missing).toBe(0)
    const short = sliceQuantiles(series([-1, -2, -3]), 7)
    expect(short.q50).toEqual([-1, -2, -3])
    expect(short.missing).toBe(4)
  })
  it('returns nothing when the series was withheld', () => {
    const s = series([-1])
    s.status = 'unavailable'
    s.q10 = []
    s.q50 = []
    s.q90 = []
    expect(sliceQuantiles(s, 3)).toEqual({ q10: [], q50: [], q90: [], missing: 3 })
  })
})

describe('walk risk', () => {
  it('uses the planning bands and ignores the sign', () => {
    expect(walkRisk(4.9)).toBe('green')
    expect(walkRisk(-5)).toBe('amber')
    expect(walkRisk(14.9)).toBe('amber')
    expect(walkRisk(-15)).toBe('red')
  })
})

describe('educational CO2 shift', () => {
  it('is zero at 0% and the documented offset at +50%', () => {
    expect(co2Offset(0, 't_air')).toBe(0)
    expect(co2Offset(50, 't_air')).toBe(2)
    expect(co2Offset(25, 'pressure')).toBe(5)
    expect(applyCo2([-38, -37], 50, 't_air')).toEqual([-36, -35])
    expect(applyCo2([777], 50, 'pressure')).toEqual([787])
  })
  it('does not amplify past the slider cap', () => {
    expect(co2Offset(80, 't_air')).toBe(2)
    expect(co2Offset(-10, 'pressure')).toBe(0)
  })
})

describe('chart points', () => {
  it('draws history up to the last sol and starts the forecast there', () => {
    const points = buildChartPoints({
      history: [
        { sol: 4994, value: -39 },
        { sol: 4995, value: -38 },
      ],
      lastSol: 4995,
      lastValue: -38,
      q10: [-40],
      q50: [-37],
      q90: [-36],
      whatIf: [-35],
    })
    expect(points.map((p) => p.sol)).toEqual([4994, 4995, 4996])
    expect(points[0]).toMatchObject({ history: -39, forecast: null, whatIf: null })
    expect(points[1]).toMatchObject({ history: -38, forecast: -38, whatIf: -38 })
    expect(points[2]).toMatchObject({ history: null, forecast: -37, band: [-40, -36], whatIf: -35 })
  })
})
