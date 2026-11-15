import { describe, expect, it } from 'vitest'
import { LAYER_DEFS } from './layers.ts'
import { capabilitiesUrl, tileUrl, tilesForBbox, type WmtsLayerConfig } from '../lib/wmts.ts'

describe('THEMIS night layer', () => {
  it('uses the advertised Mars Trek mosaic and is optional', () => {
    const layer = LAYER_DEFS.find((def) => def.id === 'themisNight')!
    expect(layer).toMatchObject({ kind: 'thermal', source: 'trek', defaultVisible: false })
    expect(layer.trek).toMatchObject({
      id: 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018',
      format: 'image/png',
      bbox: { west: -179.9999997, south: -65.0006576, east: 179.9998849, north: 65.0007535 },
      maxZoom: 9,
    })
    const cfg: WmtsLayerConfig = {
      ...layer.trek!, tileSize: 256, topLeft: [-180, 90], matrixWidth0: 2, matrixHeight0: 1,
      from: 'fallback', capabilitiesUrl: capabilitiesUrl(layer.trek!.id),
    }
    expect(tilesForBbox(cfg, { west: 137.4, east: 137.41, south: -4.6, north: -4.59 }, [9]))
      .toContainEqual([9, 902, 269])
    expect(tileUrl(cfg, 9, 902, 269)).toBe(
      'https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018/1.0.0//default/default028mm/9/269/902.png',
    )
  })
})
