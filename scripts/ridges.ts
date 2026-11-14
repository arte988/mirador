// Dev tool: list ridge-crest candidates (raised, gentle crest cells) reachable from a habitat position.
// usage: node scripts/ridges.ts <lon> <lat> [minMin maxMin]
import { readFileSync } from 'node:fs'
import { decodeDtm, type DtmMeta } from '../src/lib/dtm.ts'
import { DEFAULT_PARAMS } from '../src/lib/params.ts'
import { applyBlockers, buildCostGrid, cellCenter, dijkstraField, lonLatToCellIdx, nearestFreeCell } from '../src/lib/routing.ts'

const meta = JSON.parse(readFileSync('public/dtm/gale_aoi_4m.json', 'utf8')) as DtmMeta
const bin = readFileSync('public/dtm/gale_aoi_4m.bin')
const dtm = decodeDtm(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)
const g = buildCostGrid(dtm, 2)
applyBlockers(g, DEFAULT_PARAMS)
const [lon, lat, mn = 15, mx = 80] = process.argv.slice(2).map(Number)
const start = nearestFreeCell(g, lonLatToCellIdx(g, lon, lat))
const f = dijkstraField(g, start, DEFAULT_PARAMS, 'fastest')
const R = 5
const list: { lon: number; lat: number; min: number; rel: number; s: number; z: number }[] = []
for (let r = R; r < g.height - R; r += 2)
  for (let c = R; c < g.width - R; c += 2) {
    const i = r * g.width + c
    if (g.blocked[i] || !Number.isFinite(f.time[i])) continue
    const t = f.time[i] / 60
    if (t < mn || t > mx || g.slope[i] > 14) continue
    // mean of ring at radius R
    let sum = 0, n = 0
    for (let a = 0; a < 16; a++) {
      const rr = r + Math.round(R * Math.sin((a * Math.PI) / 8))
      const cc = c + Math.round(R * Math.cos((a * Math.PI) / 8))
      sum += g.z[rr * g.width + cc]
      n++
    }
    const rel = g.z[i] - sum / n
    if (rel > 2) {
      const [lo, la] = cellCenter(g, c, r)
      list.push({ lon: lo, lat: la, min: t, rel, s: g.slope[i], z: g.z[i] })
    }
  }
list.sort((a, b) => b.rel - a.rel)
console.log('ridge candidates', list.length)
// spread selection: greedy farthest-from-picked
const picked: typeof list = []
for (const c of list) {
  if (picked.every((p) => Math.hypot((p.lon - c.lon) * 59274 * 0.997, (p.lat - c.lat) * 59274) > 350)) picked.push(c)
  if (picked.length >= 12) break
}
for (const p of picked) console.log(`${p.lon.toFixed(5)},${p.lat.toFixed(5)} ${p.min.toFixed(0)} min crest +${p.rel.toFixed(1)} m slope ${p.s.toFixed(1)} z ${p.z.toFixed(0)}`)
