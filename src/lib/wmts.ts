/**
 * JPL Mars Trek WMTS helpers.
 * API docs: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
 *
 * Layers are described by their GetCapabilities document (format, style, TileMatrixSet, ResourceURL,
 * bounding box, matrix count). We parse the XML instead of guessing zoom schemes. If the document cannot be
 * fetched (offline), a fallback derived from the capabilities verified on 14 Nov 2026 is used.
 * Trek serves CORS "*". A 404 tile means "no coverage here", not a bug.
 */
import TileGrid from 'ol/tilegrid/TileGrid'
import { cacheGet, cacheSet } from './storage.ts'

export interface WmtsLayerConfig {
  id: string
  title: string
  /** URL with OpenLayers-style {z}/{y}/{x} placeholders (y = row from the top). */
  template: string
  format: string
  bbox: { west: number; south: number; east: number; north: number }
  maxZoom: number
  tileSize: number
  topLeft: [number, number]
  matrixWidth0: number
  matrixHeight0: number
  from: 'capabilities' | 'fallback'
  capabilitiesUrl: string
}

export interface WmtsFallback {
  id: string
  title: string
  template: string
  format: string
  bbox: WmtsLayerConfig['bbox']
  maxZoom: number
}

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ'
export const capabilitiesUrl = (layerId: string) => `${TREK}/${layerId}/1.0.0/WMTSCapabilities.xml`

function text(el: Element | null | undefined): string {
  return el?.textContent?.trim() ?? ''
}

function byLocal(root: Element | Document, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter((e) => e.localName === name)
}

export function parseCapabilities(xml: string, capsUrl: string): Omit<WmtsLayerConfig, 'from'> {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Invalid WMTS capabilities XML')
  const layer = byLocal(doc, 'Layer')[0]
  if (!layer) throw new Error('No <Layer> in capabilities')
  const id = text(byLocal(layer, 'Identifier')[0])
  const title = text(byLocal(layer, 'Title')[0]) || id
  const resource = byLocal(layer, 'ResourceURL').find((e) => e.getAttribute('resourceType') === 'tile')
  if (!resource) throw new Error('No tile ResourceURL')
  const format = resource.getAttribute('format') ?? 'image/png'
  const styleId = text(byLocal(byLocal(layer, 'Style')[0] ?? layer, 'Identifier')[0]) || 'default'
  const tmsId = text(byLocal(byLocal(layer, 'TileMatrixSetLink')[0], 'TileMatrixSet')[0])
  const wgs = byLocal(layer, 'WGS84BoundingBox')[0] ?? byLocal(layer, 'BoundingBox')[0]
  const [w, s] = text(byLocal(wgs, 'LowerCorner')[0]).split(/\s+/).map(Number)
  const [e, n] = text(byLocal(wgs, 'UpperCorner')[0]).split(/\s+/).map(Number)

  const tms = byLocal(doc, 'TileMatrixSet').find((t) => text(byLocal(t, 'Identifier')[0]) === tmsId)
  if (!tms) throw new Error(`TileMatrixSet ${tmsId} not found`)
  const matrices = byLocal(tms, 'TileMatrix')
  // Our reader takes the matrices that exist in the document; commented-out blocks are ignored by the XML parser.
  const first = matrices[0]
  const topLeft = text(byLocal(first, 'TopLeftCorner')[0]).split(/\s+/).map(Number) as [number, number]
  const template = (resource.getAttribute('template') ?? '')
    .replace('{Style}', styleId)
    .replace('{TileMatrixSet}', tmsId)
    .replace('{TileMatrix}', '{z}')
    .replace('{TileRow}', '{y}')
    .replace('{TileCol}', '{x}')
  return {
    id,
    title,
    template,
    format,
    bbox: { west: w, south: s, east: e, north: n },
    maxZoom: matrices.length - 1,
    tileSize: Number(text(byLocal(first, 'TileWidth')[0])) || 256,
    topLeft,
    matrixWidth0: Number(text(byLocal(first, 'MatrixWidth')[0])) || 2,
    matrixHeight0: Number(text(byLocal(first, 'MatrixHeight')[0])) || 1,
    capabilitiesUrl: capsUrl,
  }
}

function fromFallback(fb: WmtsFallback, capsUrl: string): WmtsLayerConfig {
  return {
    id: fb.id,
    title: fb.title,
    template: fb.template,
    format: fb.format,
    bbox: fb.bbox,
    maxZoom: fb.maxZoom,
    tileSize: 256,
    topLeft: [-180, 90],
    matrixWidth0: 2,
    matrixHeight0: 1,
    from: 'fallback',
    capabilitiesUrl: capsUrl,
  }
}

const memo = new Map<string, Promise<WmtsLayerConfig>>()

/** Load (and memoize + cache) a layer configuration from its GetCapabilities document. */
export function loadWmtsConfig(fb: WmtsFallback): Promise<WmtsLayerConfig> {
  const url = capabilitiesUrl(fb.id)
  const hit = memo.get(fb.id)
  if (hit) return hit
  const p = (async () => {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 10000)
      const res = await fetch(url, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const cfg: WmtsLayerConfig = { ...parseCapabilities(await res.text(), url), from: 'capabilities' }
      cacheSet(`wmts.${fb.id}`, cfg)
      return cfg
    } catch {
      const cached = cacheGet<WmtsLayerConfig>(`wmts.${fb.id}`)
      if (cached) return cached.data
      return fromFallback(fb, url)
    }
  })()
  memo.set(fb.id, p)
  return p
}

/** Degrees per pixel at matrix level 0. */
export function baseResolution(cfg: WmtsLayerConfig): number {
  return 360 / (cfg.matrixWidth0 * cfg.tileSize)
}

export function tileGridFor(cfg: WmtsLayerConfig): TileGrid {
  const res0 = baseResolution(cfg)
  const resolutions = Array.from({ length: cfg.maxZoom + 1 }, (_, z) => res0 / 2 ** z)
  return new TileGrid({
    origin: cfg.topLeft,
    resolutions,
    tileSize: cfg.tileSize,
    extent: [
      cfg.topLeft[0],
      cfg.topLeft[1] - cfg.matrixHeight0 * cfg.tileSize * res0,
      cfg.topLeft[0] + cfg.matrixWidth0 * cfg.tileSize * res0,
      cfg.topLeft[1],
    ],
  })
}

export function tileUrl(cfg: WmtsLayerConfig, z: number, x: number, y: number): string {
  return cfg.template.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x))
}

/** Tile indices (z, x, y) covering a lon/lat bbox for the given zoom levels (clipped to layer coverage). */
export function tilesForBbox(
  cfg: WmtsLayerConfig,
  bbox: { west: number; south: number; east: number; north: number },
  zooms: number[],
): [number, number, number][] {
  const out: [number, number, number][] = []
  const res0 = baseResolution(cfg)
  const west = Math.max(bbox.west, cfg.bbox.west)
  const east = Math.min(bbox.east, cfg.bbox.east)
  const south = Math.max(bbox.south, cfg.bbox.south)
  const north = Math.min(bbox.north, cfg.bbox.north)
  if (west >= east || south >= north) return out
  for (const z of zooms) {
    if (z > cfg.maxZoom) continue
    const tileDeg = (cfg.tileSize * res0) / 2 ** z
    const x0 = Math.floor((west - cfg.topLeft[0]) / tileDeg)
    const x1 = Math.floor((east - cfg.topLeft[0]) / tileDeg)
    const y0 = Math.floor((cfg.topLeft[1] - north) / tileDeg)
    const y1 = Math.floor((cfg.topLeft[1] - south) / tileDeg)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y])
  }
  return out
}

/** Highest zoom level that is not overzoomed for a view resolution (deg/px) on a layer. */
export function zoomForResolution(cfg: WmtsLayerConfig, resolution: number): number {
  return Math.min(cfg.maxZoom, Math.max(0, Math.round(Math.log2(baseResolution(cfg) / resolution))))
}
