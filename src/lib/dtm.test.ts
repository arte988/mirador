import { describe, expect, it } from 'vitest'
import { decodeDtm, profileAlong, sampleElevation, type DtmMeta } from './dtm.ts'
import { distanceMeters } from './crsMars.ts'

/** 20x20 synthetic crop, 4 m cells, a ramp rising 1 m per 4 m eastward (about 14 degrees). */
function ramp(): ReturnType<typeof decodeDtm> {
  const size = 20
  const cellDeg = 4 / 59274.6975
  const meta: DtmMeta = {
    id: 't', source: 't', credit: 't', url: 't', width: size, height: size, cellSizeMeters: 4,
    bbox: { west: 100, east: 100 + size * cellDeg, north: 0, south: -size * cellDeg },
    radiusMeters: 3396190, elevationBaseMeters: 0, elevationStepMeters: 0.1, nodata: -32768, datum: 't',
  }
  const i16 = new Int16Array(size * size)
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) i16[r * size + c] = c * 10 // 1 m per cell
  return decodeDtm(meta, i16.buffer)
}

describe('profileAlong', () => {
  it('measures a known ramp: slope and ascent', () => {
    const d = ramp()
    const y = -10 * (4 / 59274.6975)
    const a: [number, number] = [d.west + 3 * d.dLon, y]
    const b: [number, number] = [d.west + 15 * d.dLon, y]
    const p = profileAlong(d, [a, b], 4)
    const expected = (Math.atan(1 / 4) * 180) / Math.PI
    expect(p.length).toBeCloseTo(distanceMeters(a, b), 3)
    expect(p.maxSlopeDeg).toBeCloseTo(expected, 0)
    expect(p.ascent).toBeCloseTo(12, 0)
    expect(p.descent).toBeCloseTo(0, 3)
  })

  it('reports a descent on the reverse direction with the same max slope', () => {
    const d = ramp()
    const y = -10 * (4 / 59274.6975)
    const a: [number, number] = [d.west + 3 * d.dLon, y]
    const b: [number, number] = [d.west + 15 * d.dLon, y]
    const up = profileAlong(d, [a, b], 4)
    const down = profileAlong(d, [b, a], 4)
    expect(down.maxSlopeDeg).toBeCloseTo(up.maxSlopeDeg, 3)
    expect(down.descent).toBeCloseTo(up.ascent, 3)
  })

  it('leaves NaN outside the crop instead of inventing elevation', () => {
    const d = ramp()
    const y = -10 * (4 / 59274.6975)
    const p = profileAlong(d, [[d.west - 0.01, y], [d.west + 5 * d.dLon, y]], 8)
    expect(Number.isNaN(p.elevation[0])).toBe(true)
    expect(Number.isFinite(p.elevation[p.elevation.length - 1])).toBe(true)
    expect(Number.isNaN(sampleElevation(d, 0, 0))).toBe(true)
    expect(Number.isFinite(p.maxSlopeDeg)).toBe(true)
  })
})
