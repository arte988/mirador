/**
 * Mars geometry helpers.
 *
 * AEOLIS uses a simple cylindrical (equirectangular) CRS on the Mars 2000 sphere
 * (IAU/IAG, R = 3 396 190 m), planetocentric latitude, east-positive longitude.
 * This matches the JPL Mars Trek "EQ" WMTS tile matrix sets (TopLeft -180 90, 2x1 tiles at level 0)
 * and the USGS MSL Gale DEM mosaic. Never use Web Mercator / EPSG:3857 for Mars, and never rely
 * on Earth's radius for scale bars or distances.
 *
 * Trek WMTS API docs: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
 */

/** Mars 2000 sphere radius in meters. */
export const MARS_RADIUS_M = 3_396_190

/** Meters per degree along a meridian (and along the equator) on the Mars 2000 sphere. */
export const M_PER_DEG = (MARS_RADIUS_M * Math.PI) / 180

/** OpenLayers projection code used across the app (degrees, lon/lat directly). */
export const MARS_PROJECTION_CODE = 'MARS2000:EQ'

export type LonLat = [lon: number, lat: number]

const toRad = (d: number) => (d * Math.PI) / 180

/** Great-circle (haversine) distance on the Mars sphere, in meters. */
export function distanceMeters(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const la1 = toRad(a[1])
  const la2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Total length of a lon/lat polyline in meters. */
export function pathLengthMeters(path: LonLat[]): number {
  let d = 0
  for (let i = 1; i < path.length; i++) d += distanceMeters(path[i - 1], path[i])
  return d
}

/** Initial bearing from a to b, degrees clockwise from north (0-360). */
export function bearingDeg(a: LonLat, b: LonLat): number {
  const la1 = toRad(a[1])
  const la2 = toRad(b[1])
  const dLon = toRad(b[0] - a[0])
  const y = Math.sin(dLon) * Math.cos(la2)
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon)
  return (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360
}

/** Equirectangular meters (x east, y north) relative to an origin; accurate for local (km) work. */
export function lonLatToLocalMeters(p: LonLat, origin: LonLat): [number, number] {
  const x = (p[0] - origin[0]) * M_PER_DEG * Math.cos(toRad((p[1] + origin[1]) / 2))
  const y = (p[1] - origin[1]) * M_PER_DEG
  return [x, y]
}

export function localMetersToLonLat(m: [number, number], origin: LonLat): LonLat {
  const lat = origin[1] + m[1] / M_PER_DEG
  const lon = origin[0] + m[0] / (M_PER_DEG * Math.cos(toRad((lat + origin[1]) / 2)))
  return [lon, lat]
}

/** Ground meters per map pixel at a given latitude for a view resolution expressed in degrees/pixel. */
export function metersPerPixel(resolutionDegPerPx: number, latDeg: number): number {
  return resolutionDegPerPx * M_PER_DEG * Math.cos(toRad(latDeg))
}

/** Pick a "nice" scale bar length (1, 2, 5 x 10^n) not larger than maxMeters. */
export function niceScaleLength(maxMeters: number): number {
  if (maxMeters <= 0) return 0
  const pow = 10 ** Math.floor(Math.log10(maxMeters))
  const n = maxMeters / pow
  const nice = n >= 5 ? 5 : n >= 2 ? 2 : 1
  return nice * pow
}

/** Format a Mars coordinate as "4.825°S 137.389°E". */
export function formatLonLat([lon, lat]: LonLat, digits = 4): string {
  const ns = lat < 0 ? 'S' : 'N'
  const ew = lon < 0 ? 'W' : 'E'
  return `${Math.abs(lat).toFixed(digits)}°${ns} ${Math.abs(lon).toFixed(digits)}°${ew}`
}

/** Normalize a longitude to [-180, 180). Mars Trek EQ tiles use -180..180, east positive. */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}
