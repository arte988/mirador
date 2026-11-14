// Dev tool: connected components of the walkable grid for several no-go slope limits.
import { readFileSync } from 'node:fs'
import { decodeDtm, type DtmMeta } from '../src/lib/dtm.ts'
import { DEFAULT_PARAMS } from '../src/lib/params.ts'
import { applyBlockers, buildCostGrid, cellCenter } from '../src/lib/routing.ts'

const meta = JSON.parse(readFileSync('public/dtm/gale_aoi_4m.json', 'utf8')) as DtmMeta
const bin = readFileSync('public/dtm/gale_aoi_4m.bin')
const dtm = decodeDtm(meta, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer)
const g = buildCostGrid(dtm, 2)
for (const nogo of [25, 30, 35]) {
  const blocked = applyBlockers(g, { ...DEFAULT_PARAMS, nogoDeg: nogo })
  const N = g.width * g.height
  const comp = new Int32Array(N).fill(-1)
  const sizes: { id: number; n: number; sumC: number; sumR: number; zmin: number; zmax: number }[] = []
  for (let s = 0; s < N; s++) {
    if (g.blocked[s] || comp[s] >= 0) continue
    const id = sizes.length
    const stack = [s]
    comp[s] = id
    const info = { id, n: 0, sumC: 0, sumR: 0, zmin: Infinity, zmax: -Infinity }
    while (stack.length) {
      const u = stack.pop()!
      const c = u % g.width
      const r = (u - c) / g.width
      info.n++
      info.sumC += c
      info.sumR += r
      info.zmin = Math.min(info.zmin, g.z[u])
      info.zmax = Math.max(info.zmax, g.z[u])
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          const nc = c + dc
          const nr = r + dr
          if (nc < 0 || nr < 0 || nc >= g.width || nr >= g.height) continue
          const v = nr * g.width + nc
          if (g.blocked[v] || comp[v] >= 0) continue
          if (dr && dc && (g.blocked[r * g.width + nc] || g.blocked[nr * g.width + c])) continue
          comp[v] = id
          stack.push(v)
        }
    }
    sizes.push(info)
  }
  sizes.sort((a, b) => b.n - a.n)
  console.log(`nogo ${nogo}: blocked ${((100 * blocked) / N).toFixed(1)}% components ${sizes.length}`)
  for (const s of sizes.slice(0, 4)) {
    const [lon, lat] = cellCenter(g, Math.round(s.sumC / s.n), Math.round(s.sumR / s.n))
    console.log(`  size ${s.n} (${((100 * s.n) / N).toFixed(1)}%) centroid ${lon.toFixed(4)},${lat.toFixed(4)} z ${s.zmin.toFixed(0)}..${s.zmax.toFixed(0)}`)
  }
}
