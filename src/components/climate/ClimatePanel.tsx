import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { walkRisk, type WalkRisk } from '../../data/climateRisk.ts'
import { buildChartPoints } from '../../lib/climateChart.ts'
import { FORECAST_URL, HORIZONS, sliceQuantiles, type ClimateVariable, type GaleForecast, type Horizon } from '../../lib/climateForecast.ts'
import { loadForecastZones, loadZoneForecast, type ForecastZone } from '../../lib/climateLoad.ts'
import { resolveWhatIf } from '../../lib/climateWhatIf.ts'
import { LEVEL_STYLE } from '../safety/SafetyPanel.tsx'
import ClimateChart from './ClimateChart.tsx'

const control = 'mt-1 w-full min-h-[var(--spacing-touch)] rounded-md border border-line bg-bg px-2 text-sm text-fg'

function fmt(n: number): string {
  return n.toFixed(1)
}

function signed(n: number): string {
  const text = fmt(n)
  return n > 0 ? `+${text}` : text
}

const ZONE_KEY: Record<string, string> = {
  gale: 'climate.zoneGale',
  'ridge-a': 'climate.zoneRidgeA',
  'ridge-b': 'climate.zoneRidgeB',
  'ridge-c': 'climate.zoneRidgeC',
}

export default function ClimatePanel() {
  const { t, i18n } = useTranslation()
  const [zones, setZones] = useState<ForecastZone[]>([{ id: 'gale', url: FORECAST_URL }])
  const [zoneId, setZoneId] = useState('gale')
  const [file, setFile] = useState<GaleForecast | null>(null)
  const [missing, setMissing] = useState(false)
  const [variable, setVariable] = useState<ClimateVariable>('t_air')
  const [horizon, setHorizon] = useState<Horizon>(3)
  const [co2, setCo2] = useState(0)
  const [whatIf, setWhatIf] = useState<number[] | null>(null)
  const [expanded, setExpanded] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    void loadForecastZones().then((next) => {
      setZones(next)
      setZoneId((cur) => (next.some((z) => z.id === cur) ? cur : next[0]?.id ?? 'gale'))
    })
  }, [])

  useEffect(() => {
    const zone = zones.find((z) => z.id === zoneId) ?? zones[0]
    if (!zone) return
    let cancel = false
    void loadZoneForecast(zone.url).then((r) => {
      if (cancel) return
      setFile(r.data)
      setMissing(r.data === null)
    })
    return () => {
      cancel = true
    }
  }, [zoneId, zones])

  const series = file?.series[variable]
  const sliced = series ? sliceQuantiles(series, horizon) : { q10: [], q50: [], q90: [], missing: horizon }
  const lastValue = file ? (variable === 't_air' ? file.last_measured.t_air_c : file.last_measured.pressure_pa) : null
  const q50Key = sliced.q50.join(',')

  useEffect(() => {
    if (!file || sliced.q50.length === 0 || co2 < 1) {
      setWhatIf(null)
      return
    }
    let cancel = false
    const handle = window.setTimeout(() => {
      void resolveWhatIf({
        base: sliced.q50,
        percent: co2,
        variable,
        zone: zoneId,
        horizon,
        endpoint: import.meta.env.VITE_CLIMATE_API_URL,
      }).then((r) => {
        if (!cancel) setWhatIf(r.q50)
      })
    }, 200)
    return () => {
      cancel = true
      window.clearTimeout(handle)
    }
    // q50Key tracks the sliced median without retriggering on a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q50Key, co2, variable, zoneId, horizon, file])

  const points = useMemo(() => {
    if (!file || lastValue === null || sliced.q50.length === 0) return []
    const history = (file.history ?? []).map((p) => ({
      sol: p.sol,
      value: variable === 't_air' ? p.t_air_c : p.pressure_pa,
    }))
    return buildChartPoints({
      history,
      lastSol: file.last_measured.sol,
      lastValue,
      q10: sliced.q10,
      q50: sliced.q50,
      q90: sliced.q90,
      whatIf,
    })
  }, [file, lastValue, sliced.q10, sliced.q50, sliced.q90, variable, whatIf])

  const step = sliced.q50.length - 1
  const predicted = step >= 0 ? sliced.q50[step] : null
  const low = step >= 0 ? sliced.q10[step] : null
  const high = step >= 0 ? sliced.q90[step] : null
  const delta = predicted !== null && lastValue !== null ? Math.round((predicted - lastValue) * 10) / 10 : null
  const risk: WalkRisk | null = variable === 't_air' && delta !== null ? walkRisk(delta) : null
  const unit = series?.unit ?? (variable === 't_air' ? 'C' : 'Pa')
  const unitLabel = unit === 'C' ? '°C' : unit
  const generated = file ? formatGenerated(file.generated_at_utc, i18n.language) : ''
  const prevSol = step <= 0 ? lastValue : (sliced.q50[step - 1] ?? lastValue)
  const vsPrev = predicted !== null && prevSol !== null ? Math.round((predicted - prevSol) * 10) / 10 : null
  const labelFor = (id: string, estimatedFrom?: string) => {
    const key = ZONE_KEY[id]
    const name = key ? t(key) : id
    return estimatedFrom ? t('climate.estimatedFrom', { name }) : name
  }
  const zone = zones.find((z) => z.id === zoneId) ?? zones[0]
  const zoneText = zone ? labelFor(zone.id, zone.estimatedFrom ?? file?.estimated_from) : ''
  const chartCaption = t('climate.chartCaption', { variable: t(variable === 't_air' ? 'climate.tAirShort' : 'climate.pressureShort') })

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (expanded && !dialog.open) dialog.showModal()
    else if (!expanded && dialog.open) dialog.close()
  }, [expanded])

  return (
    <section className="flex flex-col gap-3" aria-labelledby="climate-title">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="climate-title" className="text-sm font-bold uppercase tracking-wider">{t('climate.title')}</h2>
        <span className="chip text-fg">{t('climate.aiBadge')}</span>
      </div>
      <p className="text-xs text-fg">{t('climate.aiLead')}</p>
      <p className="text-xs text-muted">{t('climate.shared')}</p>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="text-xs text-fg">
          <span className="label">{t('climate.zone')}</span>
          {zones.length < 2 ? (
            <p className="mt-1 min-h-[var(--spacing-touch)] text-sm text-fg">{zoneText}</p>
          ) : (
            <select id="climate-zone" className={control} value={zoneId} onChange={(e) => setZoneId(e.target.value)} aria-label={t('climate.zone')}>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>{labelFor(z.id, z.estimatedFrom)}</option>
              ))}
            </select>
          )}
        </div>
        <label className="text-xs text-fg" htmlFor="climate-variable">
          <span className="label">{t('climate.variable')}</span>
          <select id="climate-variable" className={control} value={variable} onChange={(e) => setVariable(e.target.value as ClimateVariable)}>
            <option value="t_air">{t('climate.tAirShort')} (°C)</option>
            <option value="pressure">{t('climate.pressureShort')} (Pa)</option>
          </select>
        </label>
        <label className="text-xs text-fg" htmlFor="climate-horizon">
          <span className="label">{t('climate.horizon')}</span>
          <select id="climate-horizon" className={control} value={horizon} onChange={(e) => setHorizon(Number(e.target.value) as Horizon)}>
            {HORIZONS.map((h) => (
              <option key={h} value={h}>{t('climate.horizonSols', { n: h })}</option>
            ))}
          </select>
        </label>
      </div>

      {missing && <p className="text-sm text-caution" role="status">{t('climate.unavailable')}</p>}
      {file && sliced.q50.length === 0 && (
        <p className="text-sm text-caution" role="status">{t('climate.emptySeries', { name: t(variable === 't_air' ? 'climate.tAirShort' : 'climate.pressureShort') })}</p>
      )}
      {sliced.missing > 0 && sliced.q50.length > 0 && (
        <p className="text-xs text-caution" role="status">{t('climate.shortHorizon', { have: sliced.q50.length, asked: horizon })}</p>
      )}

      {file?.estimated_from && <p className="text-xs text-caution">{t('climate.estimatedNote')}</p>}

      {points.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <button type="button" className="btn btn-sm" onClick={() => setExpanded(true)} aria-haspopup="dialog">{t('climate.expand')}</button>
          </div>
          <ClimateChart points={points} unit={unit} caption={chartCaption} />
        </div>
      )}

      {predicted !== null && low !== null && high !== null && (
        <div className="card p-3">
          <p className="label">{t('climate.summary')}</p>
          <p className="mt-1 text-lg font-bold text-fg">{fmt(predicted)} {unitLabel}</p>
          <p className="text-sm text-fg">{t('climate.range', { lo: fmt(low), hi: fmt(high), unit: unitLabel })}</p>
          {risk && (
            <p className={`mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm font-bold ${LEVEL_STYLE[risk].text} ${LEVEL_STYLE[risk].border} ${LEVEL_STYLE[risk].bg}`}>
              <span aria-hidden="true">{LEVEL_STYLE[risk].glyph}</span>
              {t(`climate.risk.${risk}`)}
            </p>
          )}
          {variable === 't_air' && delta !== null && (
            <p className="mt-1 text-xs text-muted">{t('climate.delta', { k: delta })}</p>
          )}
          {variable === 't_air' ? (
            <p className="mt-1 text-xs text-muted">{t('climate.riskNote')}</p>
          ) : (
            vsPrev !== null && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-sm font-bold text-fg">
                <span aria-hidden="true">○</span>
                {t('climate.pressureNeutral')}
                <span className="font-normal">{t('climate.vsPreviousSol', { n: signed(vsPrev), unit: unitLabel })}</span>
              </p>
            )
          )}
        </div>
      )}

      <fieldset className="card p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wider text-fg">{t('climate.whatIfTitle')}</legend>
        <p className="text-sm text-caution" role="note">{t('climate.whatIfWarning')}</p>
        <label className="mt-2 block text-xs text-fg" htmlFor="climate-co2">
          {t('climate.whatIfSlider', { n: co2 })}
          <input
            id="climate-co2"
            className="mt-1 block h-11 w-full accent-cyan-300"
            type="range"
            min={0}
            max={50}
            step={1}
            value={co2}
            onChange={(e) => setCo2(Number(e.target.value))}
          />
        </label>
        <p className="mt-1 text-xs text-muted">{t('climate.whatIfRule')}</p>
        {whatIf && whatIf.length > 0 && (
          <p className="mt-1 text-sm font-bold text-[#e879f9]">{t('climate.whatIfValue', { n: fmt(whatIf[whatIf.length - 1] ?? 0), unit: unitLabel })}</p>
        )}
      </fieldset>

      {file && (
        <p className="text-xs text-fg">
          <span className="chip text-fg">{t('climate.precomputed')}</span>
          {generated ? <span className="ml-2">{t('climate.generated', { when: generated })}</span> : null}
        </p>
      )}
      <dialog
        ref={dialogRef}
        className="w-[min(960px,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-4 text-fg backdrop:bg-black/75"
        aria-labelledby="climate-chart-dialog-title"
        onClose={() => setExpanded(false)}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 id="climate-chart-dialog-title" className="text-sm font-bold uppercase tracking-wider">{t('climate.expandTitle')}</h3>
          <button type="button" className="btn btn-sm" onClick={() => setExpanded(false)}>{t('app.close')}</button>
        </div>
        <ClimateChart points={points} unit={unit} caption={chartCaption} tall />
      </dialog>
    </section>
  )
}

function formatGenerated(iso: string, lang: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  return new Date(t).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })
}
