/**
 * Mars solar geometry, from the Mars24 algorithm (Allison 1997; Allison & McEwen 2000, Planet. Space Sci. 48),
 * NASA GISS: https://www.giss.nasa.gov/tools/mars24/help/algorithm.html
 *
 * Gives Ls, Mars Sol Date, local true solar time, sun elevation/azimuth, and sunrise/sunset in
 * local true solar time (LTST) for any UTC date. It is a clock-and-geometry model (no weather).
 */

export const MARS_SOL_SECONDS = 88775.244147
const DEG = Math.PI / 180

/** TT - UTC in seconds (TAI-UTC = 37 s since 2017 + 32.184 s). Update if new leap seconds are added. */
const TT_MINUS_UTC_S = 69.184

export function julianDateUTC(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

export interface MarsTime {
  /** Mars Sol Date. */
  msd: number
  /** Coordinated Mars Time (mean solar time at the prime meridian), hours 0-24. */
  mtcHours: number
  /** Areocentric solar longitude, degrees 0-360. */
  ls: number
  /** Equation of time in hours (LTST - LMST). */
  eotHours: number
  /** Solar declination, degrees. */
  declinationDeg: number
}

const PBS_A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.002, 0.0018]
const PBS_TAU = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493]
const PBS_PHI = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095]

export function marsTime(date: Date): MarsTime {
  const jdUt = julianDateUTC(date)
  const jdTt = jdUt + TT_MINUS_UTC_S / 86400
  const dt = jdTt - 2451545.0
  const M = (19.3871 + 0.52402073 * dt) % 360
  const alphaFMS = (270.3871 + 0.524038496 * dt) % 360
  let pbs = 0
  for (let i = 0; i < PBS_A.length; i++) pbs += PBS_A[i] * Math.cos(((0.985626 * dt) / PBS_TAU[i] + PBS_PHI[i]) * DEG)
  const nuMinusM =
    (10.691 + 3.0e-7 * dt) * Math.sin(M * DEG) +
    0.623 * Math.sin(2 * M * DEG) +
    0.05 * Math.sin(3 * M * DEG) +
    0.005 * Math.sin(4 * M * DEG) +
    0.0005 * Math.sin(5 * M * DEG) +
    pbs
  const ls = (((alphaFMS + nuMinusM) % 360) + 360) % 360
  const eotDeg =
    2.861 * Math.sin(2 * ls * DEG) - 0.071 * Math.sin(4 * ls * DEG) + 0.002 * Math.sin(6 * ls * DEG) - nuMinusM
  const msd = (jdTt - 2405522.0028779) / 1.0274912517
  const mtcHours = ((msd % 1) + 1) % 1 * 24
  const declinationDeg = Math.asin(0.42565 * Math.sin(ls * DEG)) / DEG + 0.25 * Math.sin(ls * DEG)
  return { msd, mtcHours, ls, eotHours: eotDeg / 15, declinationDeg }
}

/** Local true solar time at an east-positive longitude, hours in [0, 24). */
export function ltstHours(mt: MarsTime, lonEastDeg: number): number {
  const lmst = mt.mtcHours + lonEastDeg / 15
  return (((lmst + mt.eotHours) % 24) + 24) % 24
}

export interface SunPosition {
  ltst: number
  elevationDeg: number
  /** Degrees clockwise from north. */
  azimuthDeg: number
}

export function sunPosition(date: Date, lonEastDeg: number, latDeg: number): SunPosition {
  const mt = marsTime(date)
  const ltst = ltstHours(mt, lonEastDeg)
  const h = 15 * (ltst - 12) * DEG // hour angle, positive after local noon
  const dec = mt.declinationDeg * DEG
  const lat = latDeg * DEG
  const sinEl = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(h)
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinEl))) / DEG
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) / DEG + 180
  return { ltst, elevationDeg, azimuthDeg: ((az % 360) + 360) % 360 }
}

export interface DayWindow {
  /** LTST hours; null in polar day/night. */
  sunrise: number | null
  sunset: number | null
  dayLengthHours: number
}

export function dayWindow(date: Date, latDeg: number): DayWindow {
  const mt = marsTime(date)
  const x = -Math.tan(latDeg * DEG) * Math.tan(mt.declinationDeg * DEG)
  if (x >= 1) return { sunrise: null, sunset: null, dayLengthHours: 0 }
  if (x <= -1) return { sunrise: null, sunset: null, dayLengthHours: 24 }
  const h0 = Math.acos(x) / DEG // degrees
  const half = h0 / 15
  return { sunrise: 12 - half, sunset: 12 + half, dayLengthHours: 2 * half }
}

/** Hours of LTST -> Earth minutes (one Mars hour is 1/24 sol = 61.7 minutes). */
export const MARS_HOUR_MINUTES = (MARS_SOL_SECONDS / 3600 / 24) * 60

/** Minutes of daylight left (sun above the horizon) from a UTC date at a site. */
export function daylightRemainingMin(date: Date, lonEastDeg: number, latDeg: number): number {
  const win = dayWindow(date, latDeg)
  const mt = marsTime(date)
  const ltst = ltstHours(mt, lonEastDeg)
  if (win.sunset === null) return win.dayLengthHours >= 24 ? Infinity : 0
  if (ltst < win.sunrise! || ltst >= win.sunset) return 0
  return (win.sunset - ltst) * MARS_HOUR_MINUTES
}

/** Format LTST hours as HH:MM. */
export function formatHours(h: number): string {
  const total = Math.round(h * 60)
  const hh = Math.floor(((total / 60) % 24 + 24) % 24)
  const mm = ((total % 60) + 60) % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Shadow direction (degrees from north, clockwise) is opposite to the sun azimuth. */
export const shadowAzimuth = (sunAz: number) => (sunAz + 180) % 360

/** Next UTC date at which LTST at the site equals targetHours (searches up to one sol). */
export function nextLtst(from: Date, lonEastDeg: number, targetHours: number): Date {
  const mt = marsTime(from)
  const cur = ltstHours(mt, lonEastDeg)
  let delta = targetHours - cur
  if (delta < 0) delta += 24
  return new Date(from.getTime() + (delta / 24) * MARS_SOL_SECONDS * 1000)
}

export interface UsefulWindow {
  /** LTST hours when the Sun is at or above the minimum elevation; null if it never gets that high or is always above. */
  start: number | null
  end: number | null
  /** True when the Sun is above the limit all sol long. */
  allDay: boolean
}

/**
 * Part of the sol with the Sun at least `minElevationDeg` above the horizon, centered on local noon.
 * The limit is a planning assumption (low Sun means long shadows and poor contrast), not a flight rule.
 */
export function usefulWindow(date: Date, latDeg: number, minElevationDeg: number): UsefulWindow {
  const dec = marsTime(date).declinationDeg * DEG
  const lat = latDeg * DEG
  const c = (Math.sin(minElevationDeg * DEG) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec))
  if (c >= 1) return { start: null, end: null, allDay: false }
  if (c <= -1) return { start: null, end: null, allDay: true }
  const half = Math.acos(c) / DEG / 15
  return { start: 12 - half, end: 12 + half, allDay: false }
}
