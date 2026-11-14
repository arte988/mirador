// Dev tool (Node >= 22.18 strips types): load the committed DTM and test reachability from a candidate
// habitat position, to choose staging / science stop coordinates.
// usage: node scripts/check-route.ts <lon> <lat> [lon,lat ...]
import { readFileSync } from 'node:fs'
import { decodeDtm, type DtmMeta } from '../src/lib/dtm.ts'
import { DEFAULT_PARAMS } from '../src/lib/params.ts'
import { applyBlockers, buildCostGrid, cellCenter, dijkstraField, lonLatToCellIdx, nearestFreeCell } from '../src/lib/routing.ts'

const meta = JSON.parse(readFileSync('public/dtm/gale_aoi_4m.json', 'utf8')) as DtmMeta
const bin = readFileSync('public/dtm/gale_aoi_4m.bin')
const dtm = decodeDtm(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)
const g = buildCostGrid(dtm, 2)
applyBlockers(g, DEFAULT_PARAMS)

const [lon, lat] = process.argv.slice(2, 4).map(Number)
const start = nearestFreeCell(g, lonLatToCellIdx(g, lon, lat))
console.log('start', cellCenter(g, start % g.width, Math.floor(start / g.width)), 'z', g.z[start].toFixed(0), 'slope', g.slope[start].toFixed(1))
const f = dijkstraField(g, start, DEFAULT_PARAMS, 'fastest')
let reach = 0
for (const t of f.time) if (Number.isFinite(t)) reach++
console.log('reachable %', ((100 * reach) / f.time.length).toFixed(1))

for (const arg of process.argv.slice(4)) {
  const [cl, ca] = arg.split(',').map(Number)
  const i = nearestFreeCell(g, lonLatToCellIdx(g, cl, ca))
  console.log('cand', cl, ca, 'time min', i >= 0 ? (f.time[i] / 60).toFixed(1) : 'blocked', 'slope', i >= 0 ? g.slope[i].toFixed(1) : '-', 'z', i >= 0 ? g.z[i].toFixed(0) : '-')
}

// Flat windows (mean of max-pooled slope < 6 deg over 5x5 cells) reachable within 20-90 minutes.
const out: { lon: number; lat: number; min: number; s: number; z: number }[] = []
for (let r = 3; r < g.height - 3; r += 5)
  for (let c = 3; c < g.width - 3; c += 5) {
    let s = 0
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) s += g.slope[(r + dr) * g.width + c + dc]
    s /= 25
    const i = r * g.width + c
    const t = f.time[i] / 60
    if (s < 6 && Number.isFinite(t) && t > 15 && t < 100) {
      const [lo, la] = cellCenter(g, c, r)
      out.push({ lon: lo, lat: la, min: t, s, z: g.z[i] })
    }
  }
out.sort((a, b) => a.min - b.min)
console.log('flat windows', out.length)
for (const o of out.filter((_, k) => k % Math.max(1, Math.floor(out.length / 25)) === 0)) console.log(`${o.lon.toFixed(5)},${o.lat.toFixed(5)} ${o.min.toFixed(0)} min slope ${o.s.toFixed(1)} z ${o.z.toFixed(0)}`)
