// Builds src/data/geologyLegend.json: colors and descriptions of the USGS geologic units (Tanaka et al. 2014,
// USGS SIM 3292, 1:20,000,000) that are mapped inside the Gale AOI, plus the unit under the habitat.
//
// Source: USGS Astrogeology ArcGIS feature layer "Mars_Geology_feature_layer" (same data and symbology as the
// tiled service used on the map). Colors come from the layer's own unique-value renderer, nothing is invented.
// Run: node scripts/make-geology-legend.mjs   (needs network)
import { writeFile } from 'node:fs/promises'

const FEATURE = 'https://services.arcgis.com/nzS0F0zdNLvs7nc8/arcgis/rest/services/Mars_Geology_feature_layer/FeatureServer/0'
// Gale AOI: matches the DTM crop footprint with some margin (lon_min, lat_min, lon_max, lat_max).
const AOI = [137.1, -5.0, 137.8, -4.2]
const HABITAT = [137.38444, -4.7974]

async function getJson(url, params) {
  const u = new URL(url)
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v))
  u.searchParams.set('f', 'json')
  const res = await fetch(u, { headers: { 'user-agent': 'mirador-legend-script' } })
  if (!res.ok) throw new Error(`${res.status} ${u}`)
  const j = await res.json()
  if (j.error) throw new Error(JSON.stringify(j.error))
  return j
}

const meta = await getJson(FEATURE, {})
const colors = new Map()
for (const v of meta.drawingInfo.renderer.uniqueValueInfos) {
  const [r, g, b] = v.symbol.color
  colors.set(v.value, '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join(''))
}

const q = (extra) =>
  getJson(`${FEATURE}/query`, { where: '1=1', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', returnGeometry: false, outFields: 'Unit,UnitDesc,SphArea_km', ...extra })

const inAoi = await q({ geometry: AOI.join(','), geometryType: 'esriGeometryEnvelope' })
const atHab = await q({ geometry: HABITAT.join(','), geometryType: 'esriGeometryPoint' })

const units = new Map()
for (const f of inAoi.features) units.set(f.attributes.Unit, { unit: f.attributes.Unit, desc: f.attributes.UnitDesc, color: colors.get(f.attributes.Unit) ?? null })
const list = [...units.values()].sort((a, b) => a.unit.localeCompare(b.unit))

const out = {
  source: 'USGS Astrogeology, Geologic map of Mars (Tanaka et al. 2014, SIM 3292), feature layer Mars_Geology_feature_layer',
  citation:
    'Tanaka, K.L., Skinner, J.A., Jr., Dohm, J.M., Irwin, R.P., III, Kolb, E.J., Fortezzo, C.M., Platz, T., Michael, G.G., and Hare, T.M., 2014, Geologic map of Mars: U.S. Geological Survey Scientific Investigations Map 3292, scale 1:20,000,000, https://dx.doi.org/10.3133/sim3292',
  scale: '1:20,000,000',
  aoi: AOI,
  generated: new Date().toISOString().slice(0, 10),
  unitsInAoi: list,
  atHabitat: atHab.features.map((f) => ({ unit: f.attributes.Unit, desc: f.attributes.UnitDesc, color: colors.get(f.attributes.Unit) ?? null })),
}
await writeFile(new URL('../src/data/geologyLegend.json', import.meta.url), JSON.stringify(out, null, 2) + '\n')
console.log(`${list.length} units in AOI, ${out.atHabitat.length} at the habitat`)
for (const u of list) console.log(u.unit.padEnd(6), u.color, u.desc)
