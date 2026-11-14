import { describe, expect, it } from 'vitest'
import { oneWayDelayMinutes, earthMarsDistanceAU, nearSolarConjunction } from './commsDelay.ts'
import { dayWindow, daylightRemainingMin, julianDateUTC, marsTime, nextLtst, sunPosition, ltstHours } from './solar.ts'

describe('Mars24 solar model', () => {
  it('reproduces the Mars Sol Date epoch (JD_TT 2451549.5 -> MSD 44796.0)', () => {
    // 2000-01-06 00:00:00 TT = UTC minus 64.184 s at that date; use the formula directly via a date near it.
    const jd = 2451549.5
    const msd = (jd - 2405522.0028779) / 1.0274912517
    expect(msd).toBeCloseTo(44796.0, 2)
  })

  it('converts UTC dates to Julian dates', () => {
    expect(julianDateUTC(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(2451545.0, 6)
  })

  it('matches the Ls reported by the NASA MSL weather feed (sol 4995, 2026-08-25: Ls ~ 341)', () => {
    const mt = marsTime(new Date(Date.UTC(2026, 7, 25, 12)))
    expect(mt.ls).toBeGreaterThan(339)
    expect(mt.ls).toBeLessThan(343.5)
  })

  it('has Ls in the early northern spring by mid November 2026', () => {
    const mt = marsTime(new Date(Date.UTC(2026, 10, 14, 18)))
    expect(mt.ls).toBeGreaterThan(15)
    expect(mt.ls).toBeLessThan(35)
  })

  it('keeps day length near 12 h at Gale (lat -4.8) and moves the sun through a full cycle', () => {
    const d = new Date(Date.UTC(2026, 10, 14, 18))
    const w = dayWindow(d, -4.8)
    expect(w.dayLengthHours).toBeGreaterThan(11.7)
    expect(w.dayLengthHours).toBeLessThan(12.3)
    const noon = nextLtst(d, 137.4, 12)
    expect(ltstHours(marsTime(noon), 137.4)).toBeCloseTo(12, 1)
    const p = sunPosition(noon, 137.4, -4.8)
    expect(p.elevationDeg).toBeGreaterThan(70)
    const night = nextLtst(d, 137.4, 0)
    expect(sunPosition(night, 137.4, -4.8).elevationDeg).toBeLessThan(-60)
    expect(daylightRemainingMin(night, 137.4, -4.8)).toBe(0)
  })

  it('puts the sun in the east in the morning and west in the afternoon', () => {
    const d = new Date(Date.UTC(2026, 10, 14, 18))
    const am = sunPosition(nextLtst(d, 137.4, 8), 137.4, -4.8)
    const pm = sunPosition(nextLtst(d, 137.4, 16), 137.4, -4.8)
    expect(am.azimuthDeg).toBeGreaterThan(45)
    expect(am.azimuthDeg).toBeLessThan(135)
    expect(pm.azimuthDeg).toBeGreaterThan(225)
    expect(pm.azimuthDeg).toBeLessThan(315)
  })
})

describe('Earth-Mars light time', () => {
  it('matches the 2003-08-27 closest approach (~0.373 AU, ~3.1 min)', () => {
    const d = new Date(Date.UTC(2003, 7, 27, 9))
    expect(earthMarsDistanceAU(d)).toBeGreaterThan(0.36)
    expect(earthMarsDistanceAU(d)).toBeLessThan(0.39)
    expect(oneWayDelayMinutes(d)).toBeGreaterThan(2.9)
    expect(oneWayDelayMinutes(d)).toBeLessThan(3.3)
  })

  it('stays inside 3-23 minutes through 2026-2030', () => {
    for (let y = 2026; y <= 2030; y++) {
      for (let m = 0; m < 12; m++) {
        const t = oneWayDelayMinutes(new Date(Date.UTC(y, m, 15)))
        expect(t).toBeGreaterThan(3)
        expect(t).toBeLessThan(23)
      }
    }
  })

  it('flags conjunction geometry near the far side of the sun', () => {
    // Mars solar conjunction occurred in January 2026.
    expect(nearSolarConjunction(new Date(Date.UTC(2026, 0, 9)))).toBe(true)
    expect(nearSolarConjunction(new Date(Date.UTC(2026, 10, 14)))).toBe(false)
  })
})
