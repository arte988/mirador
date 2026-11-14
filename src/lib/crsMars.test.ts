import { describe, expect, it } from 'vitest'
import {
  M_PER_DEG,
  MARS_RADIUS_M,
  bearingDeg,
  distanceMeters,
  formatLonLat,
  localMetersToLonLat,
  lonLatToLocalMeters,
  metersPerPixel,
  niceScaleLength,
  normalizeLon,
  pathLengthMeters,
} from './crsMars'

const GALE: [number, number] = [137.389, -4.825]

describe('Mars CRS', () => {
  it('uses the Mars 2000 sphere, not Earth radius', () => {
    expect(MARS_RADIUS_M).toBe(3_396_190)
    expect(M_PER_DEG).toBeCloseTo(59274.6975, 3)
    // Earth would give ~111195 m/deg
    expect(M_PER_DEG).toBeLessThan(60000)
  })

  it('one degree of latitude at Gale is ~59.27 km', () => {
    expect(distanceMeters(GALE, [GALE[0], GALE[1] + 1])).toBeCloseTo(M_PER_DEG, 0)
  })

  it('shrinks east-west distance with cos(lat)', () => {
    const d = distanceMeters([137, -60], [138, -60])
    expect(d).toBeCloseTo(M_PER_DEG * 0.5, -1)
  })

  it('round trips lon/lat <-> local meters in Gale', () => {
    const p: [number, number] = [137.4, -4.81]
    const m = lonLatToLocalMeters(p, GALE)
    const back = localMetersToLonLat(m, GALE)
    expect(back[0]).toBeCloseTo(p[0], 7)
    expect(back[1]).toBeCloseTo(p[1], 7)
  })

  it('local meters agree with haversine within 0.1% over 2 km', () => {
    const p: [number, number] = [GALE[0] + 0.02, GALE[1] + 0.015]
    const [x, y] = lonLatToLocalMeters(p, GALE)
    expect(Math.hypot(x, y)).toBeCloseTo(distanceMeters(GALE, p), -1)
  })

  it('computes bearings', () => {
    expect(bearingDeg(GALE, [GALE[0], GALE[1] + 0.1])).toBeCloseTo(0, 3)
    expect(bearingDeg(GALE, [GALE[0] + 0.1, GALE[1]])).toBeCloseTo(90, 1)
  })

  it('sums polyline length', () => {
    const a: [number, number] = [137.3, -4.8]
    const b: [number, number] = [137.3, -4.79]
    const c: [number, number] = [137.31, -4.79]
    expect(pathLengthMeters([a, b, c])).toBeCloseTo(distanceMeters(a, b) + distanceMeters(b, c), 6)
  })

  it('computes ground resolution per pixel from degrees per pixel', () => {
    // Trek level 16 -> 0.703125 / 2^16 deg/px ~ 0.64 m/px at the equator
    const res = 0.703125 / 2 ** 16
    expect(metersPerPixel(res, 0)).toBeCloseTo(0.636, 2)
  })

  it('formats coordinates with hemispheres', () => {
    expect(formatLonLat(GALE, 3)).toBe('4.825°S 137.389°E')
  })

  it('picks nice scale lengths', () => {
    expect(niceScaleLength(730)).toBe(500)
    expect(niceScaleLength(180)).toBe(100)
    expect(niceScaleLength(2300)).toBe(2000)
  })

  it('normalizes longitudes', () => {
    expect(normalizeLon(190)).toBe(-170)
    expect(normalizeLon(-190)).toBe(170)
    expect(normalizeLon(137.4)).toBeCloseTo(137.4, 9)
  })
})
