/**
 * Approximate Earth-Mars one-way light time from Keplerian elements.
 *
 * Source of the elements: JPL "Keplerian Elements for Approximate Positions of the Major Planets"
 * (Standish), valid 1800-2050 AD, https://ssd.jpl.nasa.gov/planets/approx_pos.html
 * Accuracy is a few percent of the distance: fine for a planning number, not for navigation.
 * The UI labels it "approximate".
 */

const DEG = Math.PI / 180
const AU_LIGHT_SECONDS = 499.004784

interface Elements {
  a: [number, number]
  e: [number, number]
  I: [number, number]
  L: [number, number]
  peri: [number, number]
  node: [number, number]
}

// Earth-Moon barycenter and Mars (a in AU, angles in degrees, rates per Julian century)
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

type Vec = [number, number, number]

function position(el: Elements, T: number): Vec {
  const at = (p: [number, number]) => p[0] + p[1] * T
  const a = at(el.a)
  const e = at(el.e)
  const I = at(el.I) * DEG
  const L = at(el.L)
  const peri = at(el.peri)
  const node = at(el.node) * DEG
  const w = (peri - at(el.node)) * DEG
  let M = (((L - peri) % 360) + 540) % 360 - 180
  M *= DEG
  let E = M + e * Math.sin(M)
  for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const cw = Math.cos(w), sw = Math.sin(w)
  const cn = Math.cos(node), sn = Math.sin(node)
  const ci = Math.cos(I), si = Math.sin(I)
  return [
    (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
    (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
    sw * si * xp + cw * si * yp,
  ]
}

/** Earth-Mars distance in AU on a UTC date. */
export function earthMarsDistanceAU(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5
  const T = (jd - 2451545.0) / 36525
  const e = position(EARTH, T)
  const m = position(MARS, T)
  return Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2])
}

/** One-way light time in minutes (approximate). */
export function oneWayDelayMinutes(date: Date): number {
  return (earthMarsDistanceAU(date) * AU_LIGHT_SECONDS) / 60
}

export function roundTripMinutes(date: Date): number {
  return 2 * oneWayDelayMinutes(date)
}

/** Format minutes as "mm:ss". */
export function formatMinutes(min: number): string {
  const total = Math.round(min * 60)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** True when the Sun is close to the Earth-Mars line (solar conjunction comms blackout is likely). */
export function nearSolarConjunction(date: Date): boolean {
  const jd = date.getTime() / 86400000 + 2440587.5
  const T = (jd - 2451545.0) / 36525
  const e = position(EARTH, T)
  const m = position(MARS, T)
  const toSun = (p: Vec): Vec => [-p[0], -p[1], -p[2]]
  const ve = [m[0] - e[0], m[1] - e[1], m[2] - e[2]]
  const vs = toSun(e)
  const dot = ve[0] * vs[0] + ve[1] * vs[1] + ve[2] * vs[2]
  const angle = Math.acos(dot / (Math.hypot(...ve) * Math.hypot(...vs))) / DEG
  return angle < 3
}
