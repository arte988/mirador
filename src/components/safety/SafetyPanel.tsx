import { useTranslation } from 'react-i18next'
import { SITES } from '../../data/sites.ts'
import type { FeedSource } from '../../lib/spaceWeather.ts'
import { refreshFeeds } from '../../lib/feeds.ts'
import { OTHER_AMBER_HOURS, SEP_AMBER_HOURS, SEP_RED_HOURS, WEATHER_STALE_DAYS, summarizeWeather, type Level } from '../../lib/safety.ts'
import { DOSE_DOI, MSL_RAD_SURFACE_MSV_PER_DAY } from '../../lib/dose.ts'
import { lightDelay } from '../../lib/ephemeris.ts'
import { daylightRemainingMin, formatHours, ltstHours, marsTime, nextLtst, sunPosition, usefulWindow } from '../../lib/solar.ts'
import { summarizeDonki } from '../../lib/spaceWeather.ts'
import { useSafetyInput } from '../../lib/useSafety.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'
import ForecastCard from '../climate/ForecastCard.tsx'
import { fmtDuration } from '../../lib/format.ts'

export const LEVEL_STYLE: Record<Level, { text: string; border: string; bg: string; glyph: string }> = {
  green: { text: 'text-visor', border: 'border-visor', bg: 'bg-visor/10', glyph: '●' },
  amber: { text: 'text-caution', border: 'border-caution', bg: 'bg-caution/10', glyph: '▲' },
  red: { text: 'text-danger', border: 'border-danger', bg: 'bg-danger/10', glyph: '■' },
}

/** Compact semaphore chip, always visible above the panels. Color is never the only signal (glyph + word). */
export function SafetyBadge({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation()
  const safety = useMissionStore((s) => s.safety)
  const sim = useMissionStore((s) => s.scenario)
  const level: Level = safety?.level ?? 'amber'
  const st = LEVEL_STYLE[level]
  const dataMode = useMissionStore((s) => s.dataMode)
  const simulated = sim.dustStorm || sim.sepAlert || sim.o2Leak || dataMode !== 'live'
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left ${st.border} ${st.bg}`} aria-label={t('safety.badgeAria', { level: t(`safety.levels.${level}`) })}>
      <span className={`text-lg leading-none ${st.text}`} aria-hidden="true">{st.glyph}</span>
      <span className={`text-sm font-bold uppercase tracking-wide ${st.text}`}>{t(`safety.levels.${level}`)}</span>
      {simulated && <span className="chip ml-auto border-caution text-caution">{dataMode === 'analog' ? t('safety.modes.analogShort') : t('safety.simulated')}</span>}
    </button>
  )
}

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted">{k}</dt>
      <dd className={`hud-text text-sm ${tone ?? ''}`}>{v}</dd>
    </div>
  )
}

const fmtDate = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—')

function SourceTag({ source, stale, savedAt }: { source: FeedSource | null; stale: boolean; savedAt: number | null }) {
  const { t } = useTranslation()
  if (!source) return <span className="chip text-danger">{t('safety.src.none')}</span>
  if (source === 'simulated') return <span className="chip border-caution text-caution">{t('safety.src.simulated')}</span>
  if (source === 'analog') return <span className="chip border-caution text-caution">{t('safety.src.analog')}</span>
  if (source === 'snapshot') return <span className="chip text-caution">{t('safety.src.snapshot', { when: fmtDate(savedAt) })}</span>
  if (stale) return <span className="chip text-caution">{t('safety.src.stale', { when: fmtDate(savedAt) })}</span>
  return <span className="chip text-go">{t('safety.src.live')}</span>
}

const START_OPTIONS = ['now', '8', '10', '12', '14'] as const

export default function SafetyPanel() {
  const { t } = useTranslation()
  const { now } = useSafetyInput()
  const safety = useMissionStore((s) => s.safety)
  const weather = useMissionStore((s) => s.weather)
  const space = useMissionStore((s) => s.space)
  const scenario = useMissionStore((s) => s.scenario)
  const scenarioTimeMs = useMissionStore((s) => s.scenarioTimeMs)
  const dataMode = useMissionStore((s) => s.dataMode)
  const minElev = useMissionStore((s) => s.params.minSunElevationDeg)
  const { setScenario, setScenarioTime, setDataMode } = useMissionStore.getState()

  const level: Level = safety?.level ?? 'amber'
  const st = LEVEL_STYLE[level]
  const scenarioOn = scenario.dustStorm || scenario.sepAlert || scenario.o2Leak
  const simulated = scenarioOn || dataMode !== 'live'

  const [lon, lat] = SITES.gale.center
  const startMs = scenarioTimeMs ?? now
  const startDate = new Date(startMs)
  const mt = marsTime(startDate)
  const ltst = ltstHours(mt, lon)
  const daylight = daylightRemainingMin(startDate, lon, lat)
  const sun = sunPosition(startDate, lon, lat)
  const useful = usefulWindow(startDate, lat, minElev)
  const delay = lightDelay(startDate)
  const preset = scenarioTimeMs === null ? 'now' : START_OPTIONS.find((o) => o !== 'now' && Math.abs(ltst - Number(o)) < 0.05) ?? 'custom'

  const row = weather?.data?.rows?.[0] as unknown as Record<string, string> | undefined
  const wsum = row ? summarizeWeather(row, now) : null
  const donki = space?.data ? summarizeDonki(space.data, now) : null

  const hoursText = (h: number | null) => (h === null ? t('safety.none') : `${h < 48 ? h.toFixed(1) : Math.round(h)} h`)

  return (
    <section aria-labelledby="safety-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id="safety-title" className="text-sm font-bold uppercase tracking-wider text-muted">{t('safety.title')}</h2>
        <button type="button" className="btn btn-sm ml-auto" onClick={() => void refreshFeeds()} disabled={!!weather?.loading || !!space?.loading}>
          {weather?.loading || space?.loading ? t('safety.refreshing') : t('safety.refresh')}
        </button>
      </div>

      {simulated && (
        <p className="rounded-lg border border-caution bg-caution/10 p-2 text-xs font-semibold text-caution" role="status">
          {dataMode === 'analog' ? t('safety.modes.analogBanner') : dataMode === 'rehearsal' ? t('safety.modes.rehearsalBanner') : t('safety.simBanner')}
        </p>
      )}

      <fieldset className="rounded-lg border border-line p-3">
        <legend className="label px-1">{t('safety.modes.title')}</legend>
        {(['live', 'analog', 'rehearsal'] as const).map((m) => (
          <div key={m} className="py-1">
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="radio"
                name="data-mode"
                className="mt-1 h-4 w-4 accent-[var(--color-go)]"
                checked={dataMode === m}
                onChange={() => {
                  setDataMode(m)
                  // Rehearsal and analog runs are daytime demos: if the Sun is down at Gale, start at 10:00 local.
                  if (m !== 'live' && daylightRemainingMin(new Date(now), lon, lat) <= 0 && scenarioTimeMs === null) {
                    setScenarioTime(nextLtst(new Date(now), lon, 10).getTime())
                  }
                  void refreshFeeds()
                }}
              />
              <span>
                <span className="text-sm font-semibold">{t(`safety.modes.${m}.name`)}</span>
                <span className="block text-xs text-muted">{t(`safety.modes.${m}.desc`)}</span>
              </span>
            </label>
          </div>
        ))}
      </fieldset>

      <div className={`rounded-xl border-2 p-3 ${st.border} ${st.bg}`} role="status" aria-live="polite" data-level={level}>
        <div className="flex items-center gap-3">
          <span className={`text-3xl leading-none ${st.text}`} aria-hidden="true">{st.glyph}</span>
          <div>
            <p className={`text-xl font-extrabold uppercase tracking-wider ${st.text}`}>{t(`safety.levels.${level}`)}</p>
            <p className="text-xs text-muted">{t(`safety.meaning.${level}`)}</p>
          </div>
        </div>
        <h3 className="label mt-3">{t('safety.why')}</h3>
        <ul className="mt-1 flex flex-col gap-1">
          {(safety?.reasons ?? []).map((r) => (
            <li key={r.id} className="flex gap-2 text-sm">
              <span className={`mt-0.5 ${LEVEL_STYLE[r.level].text}`} aria-hidden="true">{LEVEL_STYLE[r.level].glyph}</span>
              <span><span className="sr-only">{t(`safety.levels.${r.level}`)}: </span>{t(`safety.reasons.${r.key}`, r.params ?? {})}</span>
            </li>
          ))}
        </ul>
      </div>

      <details className="rounded-lg border border-line p-2">
        <summary className="label cursor-pointer">{t('safety.rulesTitle')}</summary>
        <ul className="mt-2 list-disc pl-5 text-xs text-fg/80">
          <li>{t('safety.rules.sep', { red: SEP_RED_HOURS, amber: SEP_AMBER_HOURS })}</li>
          <li>{t('safety.rules.notif', { h: OTHER_AMBER_HOURS })}</li>
          <li>{t('safety.rules.impact')}</li>
          <li>{t('safety.rules.weather', { d: WEATHER_STALE_DAYS })}</li>
          <li>{t('safety.rules.daylight')}</li>
          <li>{t('safety.rules.unknown')}</li>
          <li>{t('safety.rules.scenario')}</li>
        </ul>
        <p className="mt-2 text-xs text-muted">{t('safety.rulesNote')}</p>
      </details>

      <div className="card p-3">
        <h3 className="label">{t('safety.timeTitle')}</h3>
        <label htmlFor="eva-start" className="mt-1 block text-xs text-fg/80">{t('safety.startLabel')}</label>
        <select
          id="eva-start"
          className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm"
          value={preset}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'now') setScenarioTime(null)
            else if (v !== 'custom') setScenarioTime(nextLtst(new Date(), lon, Number(v)).getTime())
          }}
        >
          {START_OPTIONS.map((o) => (
            <option key={o} value={o}>{o === 'now' ? t('safety.startNow') : t('safety.startAt', { h: `${o.padStart(2, '0')}:00` })}</option>
          ))}
          {preset === 'custom' && <option value="custom" disabled>{t('safety.startCustom')}</option>}
        </select>
        <dl className="mt-2 grid gap-y-0.5">
          <Row k={t('safety.ltst')} v={formatHours(ltst)} />
          <Row k={t('safety.daylight')} v={Number.isFinite(daylight) ? (daylight > 0 ? fmtDuration(daylight * 60) : t('safety.night')) : '24 h'} tone={daylight <= 0 ? 'text-caution' : undefined} />
          <Row k={t('safety.sunElev')} v={`${sun.elevationDeg.toFixed(1)}°`} tone={sun.elevationDeg < minElev ? 'text-caution' : undefined} />
          <Row k={t('safety.sunAz')} v={`${sun.azimuthDeg.toFixed(0)}°`} />
          <Row
            k={t('safety.useful', { deg: minElev })}
            v={
              useful.allDay
                ? t('safety.usefulAll', { deg: minElev })
                : useful.start === null
                  ? t('safety.usefulNone', { deg: minElev })
                  : t('safety.usefulRange', { from: formatHours(useful.start), to: formatHours(useful.end!) })
            }
          />
        </dl>
      </div>

      <div className="card p-3" data-card="delay">
        <h3 className="label">{t('safety.delayTitle')}</h3>
        <dl className="mt-1 grid gap-y-0.5">
          <Row k={t('safety.delayOneWay')} v={`${delay.oneWayMin.toFixed(1)} min`} />
          <Row k={t('safety.delayRound')} v={`${delay.roundTripMin.toFixed(1)} min`} />
          <Row k={t('safety.delayAu')} v={`${delay.au.toFixed(3)} AU`} />
        </dl>
        <p className="mt-1 text-xs text-muted">{t('safety.delayNote')}</p>
      </div>

      <div className="card p-3" data-card="dose">
        <h3 className="label">{t('safety.doseTitle')}</h3>
        <dl className="mt-1 grid gap-y-0.5">
          <Row k={t('safety.doseRate')} v={t('safety.doseRateVal', { rate: MSL_RAD_SURFACE_MSV_PER_DAY })} />
        </dl>
        <p className="mt-1 text-xs text-muted">
          {t('safety.doseNote')}{' '}
          <a className="underline" href={DOSE_DOI} target="_blank" rel="noreferrer">doi:10.1126/science.1244797</a>
        </p>
      </div>

      <div className="card p-3" data-card="weather">
        <div className="flex items-center gap-2">
          <h3 className="label">{weather?.data?.source === 'analog' ? t('safety.weatherTitleAnalog') : weather?.data?.source === 'simulated' ? t('safety.weatherTitleSim') : t('safety.weatherTitle')}</h3>
          <span className="ml-auto"><SourceTag source={weather?.data?.source ?? null} stale={!!weather?.stale} savedAt={weather?.data?.fetchedAt ?? weather?.savedAt ?? null} /></span>
        </div>
        {!row && <p className="mt-1 text-sm text-caution">{t('safety.weatherUnknownBody')}</p>}
        {row && (
          <dl className="mt-1 grid gap-y-0.5">
            <Row k={weather?.data?.source === 'live' || weather?.data?.source === 'snapshot' ? t('safety.lastSol') : t('safety.reading')} v={weather?.data?.source === 'live' || weather?.data?.source === 'snapshot' ? `${row.sol} · ${row.terrestrial_date}` : row.terrestrial_date} />
            <Row
              k={t('safety.age')}
              v={wsum?.ageDays != null ? t('safety.days', { n: Math.round(wsum.ageDays) }) : '—'}
              tone={wsum?.ageDays != null && wsum.ageDays > WEATHER_STALE_DAYS ? 'text-caution' : undefined}
            />
            <Row k={t('safety.temp')} v={`${row.min_temp} … ${row.max_temp} °C`} />
            <Row k={t('safety.pressure')} v={`${row.pressure} Pa`} />
            <Row k={t('safety.uv')} v={row.local_uv_irradiance_index ?? '—'} />
            <Row k={t('safety.opacity')} v={row.atmo_opacity ?? '—'} />
            <Row k="Ls" v={`${row.ls ?? '—'}°`} />
          </dl>
        )}
        {wsum?.ageDays != null && wsum.ageDays > WEATHER_STALE_DAYS && <p className="mt-1 text-xs text-caution">{t('safety.staleNote', { d: WEATHER_STALE_DAYS })}</p>}
        <p className="mt-1 text-xs text-muted">{weather?.data?.disclaimer ?? t('safety.weatherDisclaimer')}</p>
        {weather?.data?.source === 'analog' && <p className="mt-1 text-xs font-semibold text-caution">{t('safety.analogNotMars')}</p>}
      </div>

      <div className="card p-3" data-card="space">
        <div className="flex items-center gap-2">
          <h3 className="label">{t('safety.spaceTitle')}</h3>
          <span className="ml-auto"><SourceTag source={space?.data?.source ?? null} stale={!!space?.stale} savedAt={space?.data?.fetchedAt ?? space?.savedAt ?? null} /></span>
        </div>
        {!donki && <p className="mt-1 text-sm text-caution">{t('safety.spaceUnknownBody')}</p>}
        {donki && (
          <>
            <dl className="mt-1 grid gap-y-0.5">
              <Row k={t('safety.sinceSep')} v={hoursText(donki.hoursSinceSep)} tone={donki.hoursSinceSep !== null && donki.hoursSinceSep <= SEP_AMBER_HOURS ? 'text-caution' : undefined} />
              <Row k={t('safety.sinceOther')} v={hoursText(donki.hoursSinceOther)} tone={donki.hoursSinceOther !== null && donki.hoursSinceOther <= OTHER_AMBER_HOURS ? 'text-caution' : undefined} />
              <Row k={t('safety.marsImpact')} v={donki.marsImpactSoon ? fmtDate(donki.marsImpactAt) : t('safety.none')} tone={donki.marsImpactSoon ? 'text-caution' : undefined} />
            </dl>
            {donki.notifications.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {donki.notifications.slice(0, 4).map((n) => (
                  <li key={n.id} className="text-xs text-fg/80">
                    <span className="chip mr-1">{n.type}</span>
                    <span className="text-muted">{n.time.slice(0, 10)}</span>{' '}
                    {n.url ? <a className="text-go underline" href={n.url} target="_blank" rel="noreferrer">{t('safety.open')}</a> : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="mt-2 text-xs text-muted">{t('safety.spaceNote')}</p>
      </div>

      <ForecastCard />

      <fieldset className="rounded-lg border border-caution/60 p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wider text-caution">{t('safety.injectorTitle')}</legend>
        <p className="mb-2 text-xs text-muted">{t('safety.injectorNote')}</p>
        {(['dustStorm', 'sepAlert', 'o2Leak'] as const).map((k) => (
          <div key={k} className="flex items-center gap-2 py-1">
            <input id={`scn-${k}`} type="checkbox" className="h-5 w-5 accent-[var(--color-caution)]" checked={scenario[k]} onChange={(e) => setScenario({ [k]: e.target.checked })} />
            <label htmlFor={`scn-${k}`} className="flex-1 text-sm">{t(`safety.scenarios.${k}`)}</label>
          </div>
        ))}
        {scenarioOn && (
          <button type="button" className="btn btn-sm mt-2" onClick={() => setScenario({ dustStorm: false, sepAlert: false, o2Leak: false })}>{t('safety.clearScenarios')}</button>
        )}
      </fieldset>
    </section>
  )
}
