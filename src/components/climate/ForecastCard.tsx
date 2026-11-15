import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SCIENCE_STOPS } from '../../data/sites.ts'
import { coldDropK, FORECAST_DROP_K, forecastAgeHours, forecastIsCold, forecastIsStale, type ForecastSeries, type GaleForecast } from '../../lib/climateForecast.ts'
import { loadForecast } from '../../lib/climateLoad.ts'

function band(s: GaleForecast['series']['t_air']): string {
  if (s.status !== 'prediction' || s.q50.length === 0) return '—'
  const lo = Math.min(...s.q10)
  const hi = Math.max(...s.q90)
  const mid = s.q50[0]
  return `${mid} (${lo}…${hi}) ${s.unit}`
}

export default function ForecastCard() {
  const { t } = useTranslation()
  const [file, setFile] = useState<GaleForecast | null>(null)
  const [cached, setCached] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    void loadForecast().then((r) => {
      setFile(r.data)
      setCached(r.cached)
      setMissing(r.data === null)
    })
  }, [])

  const drop = coldDropK(file)
  const cold = forecastIsCold(file)
  const stale = file ? forecastIsStale(file) : false
  const age = file ? forecastAgeHours(file) : null
  const evidence = (name: string, s: ForecastSeries) =>
    s.status === 'prediction' && s.mae_timesfm != null && s.mae_persistence != null
      ? t('climate.beats', { name, model: s.mae_timesfm, base: s.mae_persistence, n: s.holdout_sols ?? 14 })
      : t('climate.withheld', { name })

  return (
    <div className="card p-3" data-card="forecast">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="label">{t('climate.title')}</h3>
        <span className="chip text-fg">{t('climate.aiBadge')}</span>
        <span className="chip ml-auto">{file?.data_kind === 'prediction' ? t('climate.pred') : t('climate.unavailableShort')}</span>
      </div>
      <p className="mt-1 text-xs text-fg">{t('climate.aiLead')}</p>
      <p className="mt-1 text-xs text-muted">{t('climate.shared')}</p>
      {missing && <p className="mt-2 text-sm text-caution">{t('climate.unavailable')}</p>}
      {file && (
        <>
          <p className="mt-2 text-xs font-semibold">{t('climate.measured')}</p>
          <p className="text-sm">
            {t('climate.measuredLine', { sol: file.last_measured.sol, t: file.last_measured.t_air_c, p: file.last_measured.pressure_pa })}
          </p>
          <p className="text-xs text-muted">{t('climate.midpointNote')}</p>
          <p className="mt-2 text-xs font-semibold">{t('climate.prediction')}</p>
          <dl className="grid gap-y-0.5 text-sm">
            <div className="flex justify-between gap-2"><dt>{t('climate.tAir')}</dt><dd className="text-right">{band(file.series.t_air)}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('climate.pressure')}</dt><dd className="text-right">{band(file.series.pressure)}</dd></div>
            <div className="flex justify-between gap-2"><dt>{t('climate.tau')}</dt><dd className="text-right">{t('climate.unavailableShort')}</dd></div>
          </dl>
          <p className="mt-1 text-xs text-muted">{evidence(t('climate.tAirShort'), file.series.t_air)}</p>
          <p className="text-xs text-muted">{evidence(t('climate.pressureShort'), file.series.pressure)}</p>
          {drop !== null && (
            <p className={`mt-1 text-xs ${cold ? 'text-caution' : 'text-muted'}`}>{t('climate.drop', { k: drop, limit: FORECAST_DROP_K })}</p>
          )}
          <p className="mt-1 text-xs text-muted">
            {stale ? t('climate.stale') : age !== null ? t('climate.age', { h: Math.round(age) }) : null}
            {cached ? ` · ${t('climate.cached')}` : ''}
          </p>
          <p className="mt-2 text-xs text-muted">{t('climate.stops', { names: SCIENCE_STOPS.map((s) => s.name).join(', ') })}</p>
          <p className="mt-1 text-xs text-muted">{t('climate.about')}</p>
        </>
      )}
    </div>
  )
}
