/**
 * GeoJSON of the selected route plus a printable EVA cue card. Both are client-side downloads.
 */
import { HABITAT, SCIENCE_STOPS, SUPPORT_ROVER } from '../data/sites.ts'
import { useMissionStore } from '../stores/useMissionStore.ts'
import { fmtDuration, fmtKm } from './format.ts'
import { budgetSeconds } from './planner.ts'
import { evaDoseMsv } from './dose.ts'

export function selectedGeoJSON(): string {
  const s = useMissionStore.getState()
  const r = s.routes[s.selectedProfile]
  const features: unknown[] = [
    point('habitat', HABITAT.name, HABITAT.lonLat),
    point('rover', SUPPORT_ROVER.name, SUPPORT_ROVER.lonLat),
    ...SCIENCE_STOPS.map((st) => point(st.kind, st.name, st.lonLat, { id: st.id, required: s.requiredStopIds.includes(st.id) })),
  ]
  if (r && r.route.path.length > 1) {
    features.push({
      type: 'Feature',
      properties: {
        kind: 'route',
        profile: s.selectedProfile,
        distanceM: r.route.distanceM,
        totalTimeS: r.analysis.totalTimeS,
        maxSlopeDeg: r.analysis.maxSlopeDeg,
        simulated: true,
      },
      geometry: { type: 'LineString', coordinates: r.route.path },
    })
  }
  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2)
}

function point(kind: string, name: string, lonLat: [number, number], extra: Record<string, unknown> = {}) {
  return { type: 'Feature', properties: { kind, name, ...extra }, geometry: { type: 'Point', coordinates: lonLat } }
}

export function cueCardHtml(): string {
  const s = useMissionStore.getState()
  const r = s.routes[s.selectedProfile]
  const budget = budgetSeconds(s.params)
  const rows = r
    ? [
        ['Profile', s.selectedProfile],
        ['Distance', fmtKm(r.route.distanceM)],
        ['Time', fmtDuration(r.analysis.totalTimeS)],
        ['Usable suit time', fmtDuration(budget)],
        ['Max slope', `${r.analysis.maxSlopeDeg.toFixed(1)}°`],
        ['O2 at the end (sim.)', `${Math.round(r.analysis.fractionsAtEnd.o2 * 100)}%`],
        ['Battery at the end (sim.)', `${Math.round(r.analysis.fractionsAtEnd.battery * 100)}%`],
        ['Dose (ref.)', `${evaDoseMsv(r.analysis.totalTimeS).toFixed(3)} mSv`],
        ['Walk-back margin', fmtDuration(r.walkBack.minMarginS)],
        ['Stops', r.route.visited.join(', ') || '—'],
      ]
    : [['Plan', 'No route']]
  const body = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>MIRADOR EVA cue card</title>
<style>body{font:14px/1.4 system-ui,sans-serif;color:#111;padding:24px;max-width:640px}h1{font-size:20px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:4px 8px 4px 0;color:#555}td{padding:4px 0}p.note{color:#555;font-size:12px}</style></head>
<body>
<h1>MIRADOR · EVA cue card</h1>
<p>Gale crater · lower Mount Sharp. Prototype planning assumptions, not NASA flight procedure.</p>
<table>${body}</table>
<p class="note">O2, battery and dose are simulated / reference values. Geologic map is regional only. Stop coordinates are prototype picks.</p>
</body></html>`
}

export function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
