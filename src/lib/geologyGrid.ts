import TileGrid from 'ol/tilegrid/TileGrid'
import { ARCGIS_GEOLOGY } from '../data/layers.ts'

/**
 * Tile grid of the USGS geologic map service, built from the values in `MapServer?f=json` -> `tileInfo`:
 * spatial reference GCS Mars 2000 (WKID 104971, degrees, same sphere as our CRS), 256 px tiles, origin at the
 * top-left corner (-180, 180) and level 0 resolution 1.40625 deg/px, so one level 0 tile spans 360 x 360 deg
 * (half of it empty). Levels 1 to 6 are cached, level 0 returns 404.
 */
export function geologyTileGrid(g = ARCGIS_GEOLOGY): TileGrid {
  return new TileGrid({
    origin: g.origin,
    resolutions: Array.from({ length: g.maxZoom + 1 }, (_, z) => g.res0 / 2 ** z),
    tileSize: g.tileSize,
    minZoom: g.minZoom,
    extent: [-180, -90, 180, 90],
  })
}

/** ArcGIS REST cache URL: MapServer/tile/{level}/{row}/{col}. OpenLayers gives [z, x(col), y(row from the top)]. */
export function geologyTileUrl(z: number, col: number, row: number, g = ARCGIS_GEOLOGY): string {
  return `${g.url}/tile/${z}/${row}/${col}`
}
