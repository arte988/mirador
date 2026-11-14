/**
 * Local DTM access.
 *
 * Numeric elevation in MIRADOR only comes from a local DTM crop (never from the 8-bit Trek PNG tiles).
 * The committed crop is built by `scripts/make-dtm.mjs` from the USGS "MSL Gale DEM Mosaic 1 m v3"
 * (HiRISE DTM mosaic), averaged to 4 m cells and stored as Int16 (0.1 m steps above a base height).
 * Source: https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
 */
import { M_PER_DEG, distanceMeters, type LonLat } from './crsMars.ts'

export interface DtmMeta {
  id: string
  source: string
  credit: string
  url: string
  width: number
  height: number
  cellSizeMeters: number
  bbox: { west: number; east: number; north: number; south: number }
  radiusMeters: number
  elevationBaseMeters: number
  elevationStepMeters: number
  nodata: number
  datum: string
}

export interface Dtm {
  meta: DtmMeta
  width: number
  height: number
  /** Elevation in meters (NaN where there is no data). Row 0 is the northern edge. */
  z: Float32Array
  west: number
  east: number
  north: number
  south: number
  /** Degrees per cell. */
  dLon: number
  dLat: number
  /** Ground size of a cell in meters (east-west at the crop's mid latitude, north-south). */
  cellX: number
  cellY: number
}

export function decodeDtm(meta: DtmMeta, buf: ArrayBuffer): Dtm {
  const i16 = new Int16Array(buf)
  if (i16.length !== meta.width * meta.height) throw new Error('DTM size does not match metadata')
  const z = new Float32Array(i16.length)
  for (let i = 0; i < z.length; i++) {
    z[i] = i16[i] === meta.nodata ? NaN : meta.elevationBaseMeters + i16[i] * meta.elevationStepMeters
  }
  const { west, east, north, south } = meta.bbox
  const dLon = (east - west) / meta.width
  const dLat = (north - south) / meta.height
  const midLat = (north + south) / 2
  return {
    meta,
    width: meta.width,
    height: meta.height,
    z,
    west,
    east,
    north,
    south,
    dLon,
    dLat,
    cellX: dLon * M_PER_DEG * Math.cos((midLat * Math.PI) / 180),
    cellY: dLat * M_PER_DEG,
  }
}

export const DTM_BASE_URL = '/dtm/gale_aoi_4m'

/** Fetch the DTM. Returns null when the file is missing (UI then says "No local DTM loaded"). */
export async function loadDtm(baseUrl = DTM_BASE_URL): Promise<Dtm | null> {
  try {
    const metaRes = await fetch(`${baseUrl}.json`)
    if (!metaRes.ok) return null
    const meta = (await metaRes.json()) as DtmMeta
    if (!meta.width || !meta.height) return null
    const binRes = await fetch(`${baseUrl}.bin`)
    if (!binRes.ok) return null
    return decodeDtm(meta, await binRes.arrayBuffer())
  } catch {
    return null
  }
}

/** Fractional cell coordinates (col,row) of the cell center grid for a lon/lat. */
export function lonLatToCell(d: Dtm, lon: number, lat: number): [number, number] {
  return [(lon - d.west) / d.dLon - 0.5, (d.north - lat) / d.dLat - 0.5]
}

export function cellToLonLat(d: Dtm, col: number, row: number): LonLat {
  return [d.west + (col + 0.5) * d.dLon, d.north - (row + 0.5) * d.dLat]
}

export function inDtm(d: Dtm, lon: number, lat: number): boolean {
  return lon >= d.west && lon <= d.east && lat >= d.south && lat <= d.north
}

/** Bilinear elevation sample in meters, NaN outside the crop or over no-data. */
export function sampleElevation(d: Dtm, lon: number, lat: number): number {
  if (!inDtm(d, lon, lat)) return NaN
  const [fc, fr] = lonLatToCell(d, lon, lat)
  const c0 = Math.max(0, Math.min(d.width - 2, Math.floor(fc)))
  const r0 = Math.max(0, Math.min(d.height - 2, Math.floor(fr)))
  const tx = Math.max(0, Math.min(1, fc - c0))
  const ty = Math.max(0, Math.min(1, fr - r0))
  const i = r0 * d.width + c0
  const a = d.z[i]
  const b = d.z[i + 1]
  const c = d.z[i + d.width]
  const e = d.z[i + d.width + 1]
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty
}

/**
 * Slope in degrees using Horn's 3x3 method. The effective baseline is 2 cells (8 m for the 4 m crop),
 * i.e. roughly suit scale rather than per-pixel noise. Edge cells are NaN.
 */
export function computeSlopeDeg(d: Dtm): Float32Array {
  const { width: W, height: H, z } = d
  const out = new Float32Array(W * H).fill(NaN)
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      const i = r * W + c
      const a = z[i - W - 1], b = z[i - W], cc = z[i - W + 1]
      const dd = z[i - 1], f = z[i + 1]
      const g = z[i + W - 1], h = z[i + W], ii = z[i + W + 1]
      const dzdx = (cc + 2 * f + ii - a - 2 * dd - g) / (8 * d.cellX)
      const dzdy = (g + 2 * h + ii - a - 2 * b - cc) / (8 * d.cellY)
      out[i] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
    }
  }
  return out
}

/** Local roughness proxy: standard deviation of elevation residuals vs the 3x3 mean, in meters. */
export function computeRoughness(d: Dtm): Float32Array {
  const { width: W, height: H, z } = d
  const out = new Float32Array(W * H).fill(NaN)
  for (let r = 1; r < H - 1; r++) {
    for (let c = 1; c < W - 1; c++) {
      const i = r * W + c
      let sum = 0
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) sum += z[i + dr * W + dc]
      const mean = sum / 9
      let sq = 0
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) sq += (z[i + dr * W + dc] - mean) ** 2
      out[i] = Math.sqrt(sq / 9)
    }
  }
  return out
}

export interface Hillshade {
  width: number
  height: number
  /** 0-255 grayscale, row-major, north up. */
  data: Uint8ClampedArray
}

/** Lambertian hillshade. azimuth: degrees clockwise from north of the sun; altitude: degrees above horizon. */
export function computeHillshade(d: Dtm, azimuthDeg: number, altitudeDeg: number, zFactor = 1): Hillshade {
  const { width: W, height: H, z } = d
  const data = new Uint8ClampedArray(W * H)
  const az = (azimuthDeg * Math.PI) / 180
  const alt = (altitudeDeg * Math.PI) / 180
  // Light vector (east, north, up)
  const lx = Math.sin(az) * Math.cos(alt)
  const ly = Math.cos(az) * Math.cos(alt)
  const lz = Math.sin(alt)
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c
      if (r === 0 || c === 0 || r === H - 1 || c === W - 1 || Number.isNaN(z[i])) {
        data[i] = 0
        continue
      }
      const dzdx = ((z[i - W + 1] + 2 * z[i + 1] + z[i + W + 1] - z[i - W - 1] - 2 * z[i - 1] - z[i + W - 1]) / (8 * d.cellX)) * zFactor
      // rows grow southward, so north-positive dz/dy flips sign
      const dzdy = -((z[i + W - 1] + 2 * z[i + W] + z[i + W + 1] - z[i - W - 1] - 2 * z[i - W] - z[i - W + 1]) / (8 * d.cellY)) * zFactor
      // Surface normal (-dzdx, -dzdy, 1)
      const n = Math.hypot(dzdx, dzdy, 1)
      const shade = (-dzdx * lx - dzdy * ly + lz) / n
      data[i] = Math.max(0, shade) * 255
    }
  }
  return { width: W, height: H, data }
}

export interface ElevationProfile {
  /** Cumulative distance in meters. */
  distance: number[]
  elevation: number[]
  /** Slope in degrees of the segment ending at each sample (first is 0). */
  slopeDeg: number[]
  lonLat: LonLat[]
  maxSlopeDeg: number
  maxSlopeAtM: number
  minElevation: number
  maxElevation: number
  ascent: number
  descent: number
  length: number
}

/** Sample the DTM along a lon/lat polyline every ~stepM meters. */
export function profileAlong(d: Dtm, path: LonLat[], stepM = 8): ElevationProfile {
  const distance: number[] = []
  const elevation: number[] = []
  const slopeDeg: number[] = []
  const lonLat: LonLat[] = []
  let acc = 0
  let maxSlopeDeg = 0
  let maxSlopeAtM = 0
  let ascent = 0
  let descent = 0
  const push = (p: LonLat, dist: number) => {
    const e = sampleElevation(d, p[0], p[1])
    let s = 0
    if (elevation.length > 0) {
      const dd = dist - distance[distance.length - 1]
      const prev = elevation[elevation.length - 1]
      if (dd > 0 && Number.isFinite(e) && Number.isFinite(prev)) {
        s = (Math.atan(Math.abs(e - prev) / dd) * 180) / Math.PI
        if (e > prev) ascent += e - prev
        else descent += prev - e
      }
    }
    if (s > maxSlopeDeg) {
      maxSlopeDeg = s
      maxSlopeAtM = dist
    }
    distance.push(dist)
    elevation.push(e)
    slopeDeg.push(s)
    lonLat.push(p)
  }
  if (path.length) push(path[0], 0)
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const seg = distanceMeters(a, b)
    const n = Math.max(1, Math.round(seg / stepM))
    for (let k = 1; k <= n; k++) {
      const t = k / n
      push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], acc + seg * t)
    }
    acc += seg
  }
  const finite = elevation.filter(Number.isFinite)
  return {
    distance,
    elevation,
    slopeDeg,
    lonLat,
    maxSlopeDeg,
    maxSlopeAtM,
    minElevation: finite.length ? Math.min(...finite) : NaN,
    maxElevation: finite.length ? Math.max(...finite) : NaN,
    ascent,
    descent,
    length: acc,
  }
}
