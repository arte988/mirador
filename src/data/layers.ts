import type { WmtsFallback } from '../lib/wmts.ts'

export type LayerKind = 'optical' | 'topographic' | 'thermal' | 'geologic' | 'analysis'

export interface LayerDef {
  id: string
  kind: LayerKind
  /** i18n keys under layers.items.<id>.{name,help,credit} */
  source: 'trek' | 'arcgis' | 'dtm'
  defaultVisible: boolean
  defaultOpacity: number
  trek?: WmtsFallback
  /** Overlays that depend on the local DTM / route solver. */
  needsDtm?: boolean
  /** Layer is regional/global and must carry the honest scale warning. */
  regionalOnly?: boolean
}

const T = 'https://trek.nasa.gov/tiles/Mars/EQ'

/**
 * Drawing order: first = bottom. Fallback values come from the GetCapabilities documents verified on
 * 14 Nov 2026 and are only used when the XML cannot be fetched (offline).
 */
export const LAYER_DEFS: LayerDef[] = [
  {
    id: 'mola',
    kind: 'topographic',
    source: 'trek',
    defaultVisible: true,
    defaultOpacity: 1,
    trek: {
      id: 'Mars_MGS_MOLA_ClrShade_merge_global_463m',
      title: 'MOLA color hillshade',
      template: `${T}/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0//default/default028mm/{z}/{y}/{x}.jpg`,
      format: 'image/jpeg',
      bbox: { west: -180, south: -89.9991635, east: 179.9983271, north: 90 },
      maxZoom: 7,
    },
  },

  {
    id: 'ctx',
    kind: 'optical',
    source: 'trek',
    defaultVisible: true,
    defaultOpacity: 1,
    trek: {
      id: 'curiosity_ctx_mosaic',
      title: 'Curiosity CTX mosaic',
      template: `${T}/curiosity_ctx_mosaic/1.0.0//default/default028mm/{z}/{y}/{x}.png`,
      format: 'image/png',
      bbox: { west: 136.2768326, south: -7.2137273, east: 139.3864225, north: -3.5804738 },
      maxZoom: 10,
    },
  },

  {
    id: 'hirise',
    kind: 'optical',
    source: 'trek',
    defaultVisible: true,
    defaultOpacity: 1,
    trek: {
      id: 'curiosity_hirise_mosaic',
      title: 'Curiosity HiRISE mosaic',
      template: `${T}/curiosity_hirise_mosaic/1.0.0//default/default028mm/{z}/{y}/{x}.png`,
      format: 'image/png',
      bbox: { west: 137.1224669, south: -4.9254743, east: 137.7298129, north: -4.2489588 },
      maxZoom: 16,
    },
  },

  {
    id: 'themis',
    kind: 'thermal',
    source: 'trek',
    defaultVisible: false,
    defaultOpacity: 0.7,
    trek: {
      id: 'Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12_clon0_ly',
      title: 'THEMIS IR Day 100 m',
      template: `${T}/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12_clon0_ly/1.0.0//default/default028mm/{z}/{y}/{x}.png`,
      format: 'image/png',
      bbox: { west: -179.9999996, south: -89.9162505, east: 179.9986947, north: 89.9169529 },
      maxZoom: 8,
    },
  },

  {
    id: 'geology',
    kind: 'geologic',
    source: 'arcgis',
    defaultVisible: false,
    defaultOpacity: 0.55,
    regionalOnly: true,
  },

  { id: 'hillshade', kind: 'topographic', source: 'dtm', defaultVisible: false, defaultOpacity: 0.65, needsDtm: true },

  { id: 'slope', kind: 'analysis', source: 'dtm', defaultVisible: false, defaultOpacity: 0.55, needsDtm: true },

  { id: 'envelope', kind: 'analysis', source: 'dtm', defaultVisible: true, defaultOpacity: 0.5, needsDtm: true },

  { id: 'comms', kind: 'analysis', source: 'dtm', defaultVisible: false, defaultOpacity: 0.45, needsDtm: true },
]

export const ARCGIS_GEOLOGY = {
  /** USGS-NASA tiled service (Tanaka et al. 2014, USGS SIM 3292, 1:20,000,000). Verified 14 Nov 2026. */
  url: 'https://tiles.arcgis.com/tiles/nzS0F0zdNLvs7nc8/arcgis/rest/services/Mars_geology_All_layers_100pct/MapServer',
  /** From MapServer?f=json: GCS Mars 2000 (WKID 104971), 256 px, origin (-180, 180), LODs 0-6 cached (minLOD 1). */
  origin: [-179.99999999999983, 179.99999999999983] as [number, number],
  res0: 1.4062499999999987,
  minZoom: 1,
  maxZoom: 6,
  tileSize: 256,
  hub: 'https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars',
  citation:
    'Tanaka, K.L. et al., 2014, Geologic map of Mars: U.S. Geological Survey Scientific Investigations Map 3292, scale 1:20,000,000, https://dx.doi.org/10.3133/sim3292',
  doi: 'https://dx.doi.org/10.3133/sim3292',
}
