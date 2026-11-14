import { useTranslation } from 'react-i18next'
import { ARCGIS_GEOLOGY } from '../../data/layers.ts'
import legend from '../../data/geologyLegend.json'

interface Unit {
  unit: string
  desc: string
  color: string | null
}

/**
 * Legend for the regional geologic map. It lists only the units mapped inside the Gale area (colors read from the
 * service's own renderer by scripts/make-geology-legend.mjs), plus the citation and the scale warning.
 */
export default function GeologyLegend() {
  const { t } = useTranslation()
  const units = legend.unitsInAoi as Unit[]
  const hab = (legend.atHabitat as Unit[])[0]
  return (
    <div className="mt-2 rounded-md border border-line bg-bg/60 p-2" data-testid="geology-legend">
      <p className="label">{t('layers.geo.legendTitle')}</p>
      <ul className="mt-1 flex flex-col gap-1">
        {units.map((u) => (
          <li key={u.unit} className="flex items-start gap-2 text-xs">
            <span
              aria-hidden="true"
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border border-line"
              style={{ background: u.color ?? 'transparent' }}
            />
            <span>
              <span className="hud-text font-semibold">{u.unit}</span> {u.desc}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">{t('layers.geo.aoiNote', { n: units.length })}</p>
      {hab && <p className="mt-1 text-xs text-muted">{t('layers.geo.atHabitat', { unit: hab.unit })}</p>}
      <p className="mt-1 text-xs font-semibold text-caution">{t('layers.geo.scale')}</p>
      <p className="mt-1 text-[0.6875rem] text-muted">
        {t('layers.geo.cite')}{' '}
        <a className="underline" href={ARCGIS_GEOLOGY.doi} target="_blank" rel="noreferrer">SIM 3292</a>
        {' · '}
        <a className="underline" href={ARCGIS_GEOLOGY.hub} target="_blank" rel="noreferrer">{t('layers.geo.hub')}</a>
      </p>
    </div>
  )
}
