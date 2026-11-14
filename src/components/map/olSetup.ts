/**
 * OpenLayers setup for Mars.
 *
 * The map projection is a plain lon/lat cylindrical CRS on the Mars 2000 sphere (see lib/crsMars.ts).
 * map coordinates ARE degrees, so cursor coordinates are Mars lon (east) / lat directly, never Earth Mercator.
 * Trek WMTS docs: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
 */
import { addProjection } from 'ol/proj'
import Projection from 'ol/proj/Projection'
import View from 'ol/View'
import { M_PER_DEG, MARS_PROJECTION_CODE } from '../../lib/crsMars.ts'

export const marsProjection = new Projection({
  code: MARS_PROJECTION_CODE,
  units: 'degrees',
  extent: [-180, -90, 180, 90],
  worldExtent: [-180, -90, 180, 90],
  global: true,
  metersPerUnit: M_PER_DEG,
})
// Any OL scale computation uses the Mars sphere, never the Earth radius.
marsProjection.setGetPointResolution((resolution, point) => resolution * M_PER_DEG * Math.cos((point[1] * Math.PI) / 180))
addProjection(marsProjection)

export function createMarsView(center: [number, number], zoom: number): View {
  return new View({
    projection: marsProjection,
    center,
    zoom,
    minZoom: 1,
    maxZoom: 21,
  })
}

/** Trek level L is drawn at view zoom L + 1 (the view root resolution is 360/256 deg/px). */
export const viewZoomForTrekLevel = (level: number) => level + 1
