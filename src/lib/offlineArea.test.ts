import { describe, expect, it } from 'vitest'
import { LAYER_DEFS } from '../data/layers.ts'
import { HABITAT } from '../data/sites.ts'
import { AOI, estimateBytes, PACK } from './offlineArea.ts'
import { tilesForBbox, type WmtsLayerConfig } from './wmts.ts'

const cfg = (id: string, maxZoom: number, bbox: WmtsLayerConfig['bbox']): WmtsLayerConfig => ({
  id,
  title: id,
  template: `https://example.test/{z}/{y}/{x}.png`,
  format: 'image/png',
  bbox,
  maxZoom,
  tileSize: 256,
  topLeft: [-180, 90],
  matrixWidth0: 2,
  matrixHeight0: 1,
  from: 'fallback',
  capabilitiesUrl: '',
})

describe('mission-area pack', () => {
  it('lists a bounded set of layers and zooms', () => {
    expect(PACK.map((p) => p.id)).toEqual(['mola', 'themis', 'ctx', 'hirise'])
    expect(PACK.every((p) => p.zooms.every((z) => z >= 0))).toBe(true)
  })
  it('counts tiles inside the AOI and estimates size from that count', () => {
    const gale = { west: 137.12, east: 137.73, south: -4.93, north: -4.25 }
    const tiles = tilesForBbox(cfg('hirise', 16, gale), gale, [12, 13])
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.length).toBeLessThan(2000)
    const est = estimateBytes([{ layer: 'hirise', cfg: cfg('hirise', 16, gale), tiles }])
    expect(est.tiles).toBe(tiles.length)
    expect(est.bytes).toBe(tiles.length * 18_000)
  })
  it('returns no tiles when the bbox misses the layer', () => {
    const layer = cfg('ctx', 10, { west: 136, east: 139, south: -7, north: -3 })
    expect(tilesForBbox(layer, { west: 0, east: 1, south: 0, north: 1 }, [8])).toEqual([])
  })
  it('packs a habitat-sized pyramid, not the whole HiRISE mosaic', () => {
    expect(AOI.west).toBeLessThan(HABITAT.lonLat[0])
    expect(AOI.east).toBeGreaterThan(HABITAT.lonLat[0])
    expect(AOI.south).toBeLessThan(HABITAT.lonLat[1])
    expect(AOI.north).toBeGreaterThan(HABITAT.lonLat[1])
    const plans = PACK.map((p) => {
      const trek = LAYER_DEFS.find((d) => d.id === p.id)?.trek
      if (!trek) throw new Error(p.id)
      const layer = cfg(trek.id, trek.maxZoom, trek.bbox)
      layer.template = trek.template
      return { layer: p.id, cfg: layer, tiles: tilesForBbox(layer, AOI, p.zooms) }
    })
    const est = estimateBytes(plans)
    expect(est.tiles).toBeGreaterThan(8)
    expect(est.tiles).toBeLessThan(400)
  })
})
