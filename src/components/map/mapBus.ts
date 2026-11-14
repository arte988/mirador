import type OlMap from 'ol/Map'
import type { LonLat } from '../../lib/crsMars.ts'

/** Tiny registry so panels (buttons, handoff, HUD) can talk to the map without prop drilling. */
let map: OlMap | null = null

export function registerMap(m: OlMap | null) {
  map = m
}

export function mapCenter(): LonLat | null {
  const c = map?.getView().getCenter()
  return c ? [c[0], c[1]] : null
}

export function flyTo(center: LonLat, zoom?: number) {
  const v = map?.getView()
  if (!v) return
  v.animate({ center, zoom: zoom ?? v.getZoom(), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 450 })
}

export function fitBox(box: { west: number; south: number; east: number; north: number }) {
  const v = map?.getView()
  if (!v || !map) return
  v.fit([box.west, box.south, box.east, box.north], { size: map.getSize(), padding: [40, 40, 40, 40], duration: 0 })
}

export function getMap() {
  return map
}
