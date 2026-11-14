/**
 * Approximate Earth-Mars distance and one-way light time from simple Keplerian elements.
 *
 * Elements: E.M. Standish, "Keplerian Elements for Approximate Positions of the Major Planets" (JPL SSD), Table 1,
 * valid 1800 AD to 2050 AD. Earth uses the Earth-Moon barycenter row. The accuracy is about 0.01 AU, which is
 * well under one light-minute, so every number shown from this module must be labeled "approximate".
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 */

const DEG = Math.PI / 180

/** [value at J2000, rate per Julian century] for a, e, I, L, long.peri, long.node. Angles in degrees, a in AU. */
interface Elements {
  a: [number, number]
  e: [number, number]
  I: [number, number]
  L: [number, number]
  peri: [number, number]
  node: [number, number]
}

const EARTH: Elements = {
  a: [1.00000261, 0.00000562],
  e: [0.01671123, -0.00004392],
  I: [-0.00001531, -0.01294668],
  L: [100.46457166, 35999.37244981],
  peri: [102.93768193, 0.32327364],
  node: [0, 0],
}

const MARS: Elements = {
  a: [1.52371034, 0.00001847],
  e: [0.0933941, 0.00007882],
  I: [1.84969142, -0.00813131],
  L: [-4.55343205, 19140.30268499],
  peri: [-23.94362959, 0.44441088],
  node: [49.55953891, -0.29257343],
}

export const AU_KM = 149597870.7
export const LIGHT_SECONDS_PER_AU = AU_KM / 299792.458

const lerp = (p: [number, number], T: number) => p[0] + p[1] * T

/** Heliocentric ecliptic position (AU, J2000 ecliptic) of a body. */
function position(el: Elements, T: number): [number, number, number] {
  const a = lerp(el.a, T)
  const e = lerp(el.e, T)
  const I = lerp(el.I, T) * DEG
  const L = lerp(el.L, T)
  const peri = lerp(el.peri, T)
  const node = lerp(el.node, T) * DEG
  const w = (peri - lerp(el.node, T)) * DEG // argument of perihelion
  let M = (((L - peri) % 360) + 540) % 360 - 180 // mean anomaly in [-180, 180)
  M *= DEG
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(w)
  const sw = Math.sin(w)
  const cn = Math.cos(node)
  const sn = Math.sin(node)
  const ci = Math.cos(I)
  const si = Math.sin(I)
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ]
}

const centuries = (date: Date) => (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525

/** Approximate Earth-Mars distance in AU on a UTC date (ignores light travel time itself, which is tiny here). */
export function earthMarsAU(date: Date): number {
  const T = centuries(date)
  const e = position(EARTH, T)
  const m = position(MARS, T)
  return Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2])
}

export interface LightDelay {
  au: number
  km: number
  oneWayMin: number
  roundTripMin: number
}

export function lightDelay(date: Date): LightDelay {
  const au = earthMarsAU(date)
  const oneWayS = au * LIGHT_SECONDS_PER_AU
  return { au, km: au * AU_KM, oneWayMin: oneWayS / 60, roundTripMin: (2 * oneWayS) / 60 }
}
