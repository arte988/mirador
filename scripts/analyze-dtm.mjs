// Dev tool: print slope statistics of the committed DTM crop and suggest flat staging cells and ridge crests.
import { readFileSync } from 'node:fs'

const meta = JSON.parse(readFileSync('public/dtm/gale_aoi_4m.json', 'utf8'))
const raw = readFileSync('public/dtm/gale_aoi_4m.bin')
const i16 = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
const { width: W, height: H, bbox } = meta
const z = new Float32Array(W * H)
for (let i = 0; i < z.length; i++) z[i] = i16[i] === meta.nodata ? NaN : meta.elevationBaseMeters + i16[i] * meta.elevationStepMeters

const lonOf = (c) => bbox.west + ((c + 0.5) / W) * (bbox.east - bbox.west)
const latOf = (r) => bbox.north - ((r + 0.5) / H) * (bbox.north - bbox.south)
const dx = meta.cellSizeMeters * Math.cos((((bbox.north + bbox.south) / 2) * Math.PI) / 180)
const dy = meta.cellSizeMeters

const slope = new Float32Array(W * H).fill(NaN)
const hist = new Array(10).fill(0)
for (let r = 1; r < H - 1; r++)
  for (let c = 1; c < W - 1; c++) {
    const g = (rr, cc) => z[rr * W + cc]
    const dzdx = (g(r - 1, c + 1) + 2 * g(r, c + 1) + g(r + 1, c + 1) - g(r - 1, c - 1) - 2 * g(r, c - 1) - g(r + 1, c - 1)) / (8 * dx)
    const dzdy = (g(r + 1, c - 1) + 2 * g(r + 1, c) + g(r + 1, c + 1) - g(r - 1, c - 1) - 2 * g(r - 1, c) - g(r - 1, c + 1)) / (8 * dy)
    const s = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI
    slope[r * W + c] = s
    hist[Math.min(9, Math.floor(s / 5))]++
  }
console.log('slope hist per 5deg bins', hist.map((n) => ((100 * n) / (W * H)).toFixed(1) + '%').join(' '))

// Block mean slope over 40 m windows; list flattest windows and elevation summary.
const B = 10
const cands = []
for (let r = 0; r + B < H; r += B)
  for (let c = 0; c + B < W; c += B) {
    let sum = 0, n = 0, zs = 0
    for (let rr = r; rr < r + B; rr++) for (let cc = c; cc < c + B; cc++) { const s = slope[rr * W + cc]; if (!Number.isNaN(s)) { sum += s; n++; zs += z[rr * W + cc] } }
    if (n) cands.push({ r: r + B / 2, c: c + B / 2, s: sum / n, z: zs / n })
  }
const flat = cands.filter((p) => p.s < 3).sort((a, b) => a.z - b.z)
console.log('flat (<3deg) windows:', flat.length)
for (const p of flat.slice(0, 8)) console.log('low flat', lonOf(p.c).toFixed(5), latOf(p.r).toFixed(5), p.z.toFixed(1), p.s.toFixed(1))
const mid = flat.filter((p) => p.c > W * 0.3 && p.c < W * 0.7).slice(0, 8)
for (const p of mid) console.log('mid flat', lonOf(p.c).toFixed(5), latOf(p.r).toFixed(5), p.z.toFixed(1), p.s.toFixed(1))

// elevation by quadrant
for (const [name, r0, c0] of [['NW', 0, 0], ['NE', 0, W / 2], ['SW', H / 2, 0], ['SE', H / 2, W / 2]]) {
  let s = 0, n = 0
  for (let r = r0; r < r0 + H / 2; r += 4) for (let c = c0; c < c0 + W / 2; c += 4) { s += z[r * W + c]; n++ }
  console.log(name, (s / n).toFixed(1))
}
// slope percentile
const sv = Array.from(slope).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b)
console.log('slope p50/p90/p99/max', [0.5, 0.9, 0.99, 1].map((p) => sv[Math.min(sv.length - 1, Math.floor(p * sv.length))].toFixed(1)).join(' '))
