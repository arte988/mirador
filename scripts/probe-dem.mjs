// Probe the USGS MSL Gale 1 m DEM mosaic (remote GeoTIFF, HTTP range requests).
// Source: https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
import { fromUrl } from 'geotiff'

const URL = 'https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif'
const tiff = await fromUrl(URL, { allowFullFile: false })
const img = await tiff.getImage()
console.log('size', img.getWidth(), img.getHeight())
console.log('tile', img.getTileWidth(), img.getTileHeight())
console.log('origin', img.getOrigin(), 'res', img.getResolution())
console.log('bbox', img.getBoundingBox())
console.log('nodata', img.getGDALNoData())
console.log('fd', JSON.stringify(img.getFileDirectory(), (k, v) => (ArrayBuffer.isView(v) ? `[${v.constructor.name} ${v.length}]` : v)).slice(0, 1500))
console.log('geokeys', img.getGeoKeys())
console.log('overviews', await tiff.getImageCount())
