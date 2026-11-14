import { describe, expect, it } from 'vitest'
import { ARCGIS_GEOLOGY } from '../data/layers.ts'
import legend from '../data/geologyLegend.json'
import { geologyTileGrid, geologyTileUrl } from './geologyGrid.ts'

describe('USGS geology tile grid (from the service tileInfo)', () => {
  const grid = geologyTileGrid()
  it('matches the published origin, level 0 resolution and cached levels', () => {
    expect(grid.getOrigin(0)).toEqual([-179.99999999999983, 179.99999999999983])
    expect(grid.getResolution(0)).toBeCloseTo(1.4062499999999987, 12)
    expect(grid.getResolution(4)).toBeCloseTo(0.08789062499999992, 12)
    expect(grid.getMinZoom()).toBe(1)
    expect(grid.getMaxZoom()).toBe(6)
  })
  it('puts Gale on the tile that exists on the server (checked live: 4/8/14 returns a PNG)', () => {
    const [z, x, y] = grid.getTileCoordForCoordAndZ([137.38444, -4.7974], 4)
    expect([z, x, y]).toEqual([4, 14, 8])
    expect(geologyTileUrl(z, x, y)).toBe(`${ARCGIS_GEOLOGY.url}/tile/4/8/14`)
  })
  it('keeps the URL order level/row/col', () => {
    expect(geologyTileUrl(3, 4, 7)).toMatch(/\/tile\/3\/7\/4$/)
  })
})

describe('geology legend data', () => {
  it('has colored units and the citation', () => {
    expect(legend.unitsInAoi.length).toBeGreaterThan(0)
    for (const u of legend.unitsInAoi) expect(u.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(legend.citation).toContain('Map 3292')
  })
})
