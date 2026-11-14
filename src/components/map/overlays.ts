/** Canvas overlays derived from the local DTM and the route solver. All images are georeferenced to the DTM bbox. */
import { M_PER_DEG } from '../../lib/crsMars.ts'
import type { Dtm } from '../../lib/dtm.ts'
import { computeHillshade } from '../../lib/dtm.ts'
import type { GridInfo } from '../../lib/routerTypes.ts'

export interface OverlayImage {
  url: string
  extent: [number, number, number, number]
}

function toImage(canvas: HTMLCanvasElement, extent: [number, number, number, number]): OverlayImage {
  return { url: canvas.toDataURL('image/png'), extent }
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D, ImageData] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  return [canvas, ctx, ctx.createImageData(w, h)]
}

export const dtmExtent = (d: Dtm): [number, number, number, number] => [d.west, d.south, d.east, d.north]
export const gridExtent = (g: GridInfo): [number, number, number, number] => [
  g.west,
  g.north - g.height * g.dLat,
  g.west + g.width * g.dLon,
  g.north,
]

/** Sun-aware hillshade (multiply blend in the layer). */
export function hillshadeOverlay(d: Dtm, sunAzimuthDeg: number, sunElevationDeg: number): OverlayImage {
  const hs = computeHillshade(d, sunAzimuthDeg, Math.max(sunElevationDeg, 12), 1.5)
  const [canvas, ctx, img] = makeCanvas(hs.width, hs.height)
  for (let i = 0; i < hs.data.length; i++) {
    const v = hs.data[i] * 0.85 + 38 // keep deep shadows readable
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return toImage(canvas, dtmExtent(d))
}

/** Slope risk: faint cyan = gentle, amber = caution, red = no-go (planning assumptions). */
export function slopeOverlay(d: Dtm, slope: Float32Array, cautionDeg: number, nogoDeg: number): OverlayImage {
  const [canvas, ctx, img] = makeCanvas(d.width, d.height)
  for (let i = 0; i < slope.length; i++) {
    const s = slope[i]
    let r = 0, g = 0, b = 0, a = 0
    if (Number.isNaN(s)) a = 0
    else if (s > nogoDeg) [r, g, b, a] = [255, 90, 95, 190]
    else if (s > cautionDeg) [r, g, b, a] = [255, 176, 32, 160]
    else if (s < 8) [r, g, b, a] = [34, 211, 238, 55]
    img.data[i * 4] = r
    img.data[i * 4 + 1] = g
    img.data[i * 4 + 2] = b
    img.data[i * 4 + 3] = a
  }
  ctx.putImageData(img, 0, 0)
  return toImage(canvas, dtmExtent(d))
}

/**
 * Walk-back envelope with isochrones. Value per cell = best-case round trip from the habitat (out + back, s).
 * Faint fill where the trip fits the budget, thin cyan contours every hour, and an amber outline where the
 * trip stops fitting (the walk-back limit). Blocked cells are left empty.
 */
export function envelopeOverlay(g: GridInfo, out: Float64Array, back: Float64Array, budgetS: number): OverlayImage {
  const [canvas, ctx, img] = makeCanvas(g.width, g.height)
  const n = g.width * g.height
  const trip = new Float64Array(n)
  for (let i = 0; i < n; i++) trip[i] = out[i] + back[i]
  const HOUR = 3600
  const band = (v: number) => Math.floor(v / HOUR)
  const set = (i: number, r: number, gr: number, b: number, a: number) => {
    img.data[i * 4] = r
    img.data[i * 4 + 1] = gr
    img.data[i * 4 + 2] = b
    img.data[i * 4 + 3] = a
  }
  for (let r = 0; r < g.height; r++) {
    for (let c = 0; c < g.width; c++) {
      const i = r * g.width + c
      const v = trip[i]
      if (!Number.isFinite(v)) continue
      const inside = v <= budgetS
      if (inside) set(i, 34, 211, 238, 26)
      let limit = false
      let hour = false
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr
          const cc = c + dc
          if ((dr === 0 && dc === 0) || rr < 0 || cc < 0 || rr >= g.height || cc >= g.width) continue
          const w = trip[rr * g.width + cc]
          if (!Number.isFinite(w)) continue
          if (inside && w > budgetS) limit = true
          if (inside && w <= budgetS && band(w) > band(v)) hour = true
        }
      }
      if (limit) set(i, 255, 176, 32, 255)
      else if (hour) set(i, 34, 211, 238, 170)
    }
  }
  ctx.putImageData(img, 0, 0)
  return toImage(canvas, gridExtent(g))
}

/** Comms coverage: cells within range that have line of sight to the observer (green) or are shadowed (red). */
export function commsOverlay(g: GridInfo, visible: Uint8Array, observer: [number, number], maxRangeM: number): OverlayImage {
  const [canvas, ctx, img] = makeCanvas(g.width, g.height)
  const mx = M_PER_DEG * Math.cos((observer[1] * Math.PI) / 180)
  for (let r = 0; r < g.height; r++) {
    for (let c = 0; c < g.width; c++) {
      const lon = g.west + (c + 0.5) * g.dLon
      const lat = g.north - (r + 0.5) * g.dLat
      const d = Math.hypot((lon - observer[0]) * mx, (lat - observer[1]) * M_PER_DEG)
      if (d > maxRangeM) continue
      const i = r * g.width + c
      const px = i * 4
      if (visible[i]) [img.data[px], img.data[px + 1], img.data[px + 2], img.data[px + 3]] = [61, 255, 154, 70]
      else [img.data[px], img.data[px + 1], img.data[px + 2], img.data[px + 3]] = [255, 90, 95, 95]
    }
  }
  ctx.putImageData(img, 0, 0)
  return toImage(canvas, gridExtent(g))
}
