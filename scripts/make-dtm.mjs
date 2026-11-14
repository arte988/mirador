// Build the committed DTM crop used by MIRADOR (route planning, profile, line of sight).
//
// Source: USGS Astrogeology "MSL Gale DEM Mosaic 1 m v3" (HiRISE DTM mosaic, 1 m/px, Float32,
// equirectangular, Mars 2000 sphere R=3396190 m, planetocentric, east positive).
//   https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
// Credit: NASA / JPL / University of Arizona (HiRISE) / USGS Astrogeology.
//
// The full file is 3.9 GB, so we read only a window through HTTP range requests, average it down
// to FACTOR m/px and store it as Int16 (0.1 m steps above a per-file base). Output stays under ~3 MB.
//
// Usage: node scripts/make-dtm.mjs [west east south north factor]
import { fromUrl } from 'geotiff'
import { mkdirSync, writeFileSync } from 'node:fs'

const URL = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif'
const R = 3396190
const M_PER_DEG = (R * Math.PI) / 180 // 59274.6975... m per degree on the Mars 2000 sphere

const [west, east, south, north, factor] = process.argv.slice(2).map(Number)
const W = west ?? 137.347
const E = east ?? 137.431
const S = south ?? -4.859
const N = north ?? -4.791
const FACTOR = factor ?? 4

const tiff = await fromUrl(URL, { allowFullFile: false })
const img = await tiff.getImage()
const [ox, oy] = img.getOrigin() // meters, top-left
const NODATA = img.getGDALNoData() ?? -32767

const x0 = Math.floor(W * M_PER_DEG - ox)
const x1 = Math.ceil(E * M_PER_DEG - ox)
const y0 = Math.floor(oy - N * M_PER_DEG)
const y1 = Math.ceil(oy - S * M_PER_DEG)
const w = Math.floor((x1 - x0) / FACTOR) * FACTOR
const h = Math.floor((y1 - y0) / FACTOR) * FACTOR
console.log({ x0, y0, w, h, factor: FACTOR })

const ow = w / FACTOR
const oh = h / FACTOR
const out = new Float32Array(ow * oh).fill(NaN)
const CHUNK = 400 // rows of source per request (multiple of FACTOR)

for (let r = 0; r < h; r += CHUNK) {
  const rows = Math.min(CHUNK, h - r)
  const t0 = Date.now()
  const [band] = await img.readRasters({ window: [x0, y0 + r, x0 + w, y0 + r + rows], samples: [0], interleave: false })
  for (let by = 0; by < rows / FACTOR; by++) {
    for (let bx = 0; bx < ow; bx++) {
      let sum = 0
      let n = 0
      for (let yy = 0; yy < FACTOR; yy++) {
        for (let xx = 0; xx < FACTOR; xx++) {
          const v = band[(by * FACTOR + yy) * w + bx * FACTOR + xx]
          if (v !== NODATA && Number.isFinite(v) && v > -1e5) {
            sum += v
            n++
          }
        }
      }
      // Require at least half of the block to be valid.
      if (n >= (FACTOR * FACTOR) / 2) out[(r / FACTOR + by) * ow + bx] = sum / n
    }
  }
  console.log(`rows ${r}-${r + rows} of ${h} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

let min = Infinity
let max = -Infinity
let valid = 0
for (const v of out) {
  if (Number.isNaN(v)) continue
  valid++
  if (v < min) min = v
  if (v > max) max = v
}
console.log({ min, max, validFraction: valid / out.length })
if (valid === 0) throw new Error('No valid DEM samples in the requested window')
if ((max - min) * 10 > 32000) throw new Error('Relief too large for Int16 at 0.1 m steps; use a smaller window')

const STEP = 0.1
const i16 = new Int16Array(out.length)
for (let i = 0; i < out.length; i++) i16[i] = Number.isNaN(out[i]) ? -32768 : Math.round((out[i] - min) / STEP)

// Exact geographic bounds of the cropped grid (pixel edges).
const bbox = {
  west: (ox + x0) / M_PER_DEG,
  east: (ox + x0 + w) / M_PER_DEG,
  north: (oy - y0) / M_PER_DEG,
  south: (oy - y0 - h) / M_PER_DEG,
}
const meta = {
  id: 'gale_aoi_4m',
  source: 'USGS Astrogeology MSL Gale DEM Mosaic 1m v3 (HiRISE DTM mosaic), averaged to coarser cells',
  credit: 'NASA / JPL-Caltech / University of Arizona (HiRISE) / USGS Astrogeology',
  url: 'https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m',
  width: ow,
  height: oh,
  cellSizeMeters: FACTOR,
  bbox,
  radiusMeters: R,
  elevationBaseMeters: min,
  elevationStepMeters: STEP,
  nodata: -32768,
  datum: 'Heights above the Mars 2000 areoid as published by USGS; planetocentric lat, east-positive lon',
  generatedBy: 'scripts/make-dtm.mjs',
}
mkdirSync('public/dtm', { recursive: true })
writeFileSync('public/dtm/gale_aoi_4m.bin', Buffer.from(i16.buffer))
writeFileSync('public/dtm/gale_aoi_4m.json', JSON.stringify(meta, null, 2))
console.log('wrote public/dtm/gale_aoi_4m.{bin,json}', meta)
