import { useTranslation } from 'react-i18next'
import { metersPerPixel, niceScaleLength } from '../../lib/crsMars.ts'

interface Props {
  /** View resolution in degrees per pixel. */
  resolution: number
  centerLat: number
  cursorText: string
  elevation: number | null
  hasCursor: boolean
}

/** Scale bar in meters on the Mars sphere plus lon/lat (east) under the cursor. Never Earth Mercator. */
export default function MapStatus({ resolution, centerLat, cursorText, elevation, hasCursor }: Props) {
  const { t } = useTranslation()
  const mpp = metersPerPixel(resolution, centerLat)
  const maxPx = 120
  const length = niceScaleLength(mpp * maxPx)
  const px = length / mpp
  const label = length >= 1000 ? `${length / 1000} km` : `${length} m`
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col gap-1 text-xs">
      <div className="rounded-md border border-line bg-surface/90 px-2 py-1 font-mono text-fg" aria-live="off">
        <span className="label mr-2">{hasCursor ? t('map.cursor') : t('map.center')}</span>
        {cursorText}
        {elevation !== null && Number.isFinite(elevation) && (
          <span className="ml-2 text-go">
            {t('map.elevation')} {elevation.toFixed(0)} m
          </span>
        )}
      </div>
      <div className="flex items-end gap-2 rounded-md border border-line bg-surface/90 px-2 py-1 text-fg">
        <div style={{ width: px }} className="h-2 border-x-2 border-b-2 border-fg" aria-hidden />
        <span className="font-mono">{label}</span>
        <span className="text-muted">{t('map.mars')}</span>
      </div>
    </div>
  )
}
