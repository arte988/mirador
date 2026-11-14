import { useTranslation } from 'react-i18next'
import { SCIENCE_STOPS } from '../../data/sites.ts'
import { evaDoseMsv, budgetShare } from '../../lib/dose.ts'
import { fmtDuration, fmtKm, pct } from '../../lib/format.ts'
import { useDtm } from '../../lib/dtmStore.ts'
import { budgetSeconds } from '../../lib/planner.ts'
import type { PlanningParams } from '../../lib/params.ts'
import type { RouteProfileId } from '../../lib/routing.ts'
import { useMissionStore, type RouteResult } from '../../stores/useMissionStore.ts'
import { usePlanData, backTimeAt } from '../../stores/usePlanData.ts'
import { abortAdvice, useEffectiveParams, STORM_SPEED_FACTOR, LEAK_SUPPLY_FACTOR } from '../../lib/scenarioPlan.ts'
import { useMemo } from 'react'

const PROFILES: RouteProfileId[] = ['safest', 'fastest', 'science']

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' }) {
  const color = tone === 'bad' ? 'text-danger' : tone === 'warn' ? 'text-caution' : 'text-fg'
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`hud-text text-sm ${color}`}>{value}</dd>
    </div>
  )
}

function RouteCard({ id, r, params, selected, busy }: { id: RouteProfileId; r: RouteResult | undefined; params: PlanningParams; selected: boolean; busy: boolean }) {
  const { t } = useTranslation()
  const select = useMissionStore((s) => s.selectProfile)
  const budget = budgetSeconds(params)
  const reserveFrac = params.reserveMin / (params.suitCapacityHours * 60)

  return (
    <label
      className={`card block cursor-pointer p-3 ${selected ? 'border-go ring-1 ring-go' : ''}`}
      data-profile={id}
    >
      <div className="flex items-center gap-2">
        <input
          type="radio"
          name="route-profile"
          className="h-5 w-5 accent-[var(--color-go)]"
          checked={selected}
          onChange={() => select(id)}
          disabled={!r}
        />
        <span className="text-sm font-bold">{t(`route.profiles.${id}.name`)}</span>
        {r && (
          <span className={`chip ml-auto ${r.analysis.totalTimeS > budget ? 'text-danger' : 'text-go'}`}>
            {r.analysis.totalTimeS > budget ? t('route.overBudget') : t('route.withinBudget')}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">{t(`route.profiles.${id}.desc`)}</p>
      {!r && <p className={`mt-2 text-xs ${busy ? 'text-muted' : 'text-caution'}`}>{busy ? t('route.planning') : t('route.noRoute')}</p>}
      {r && (
        <dl className="mt-2 grid gap-y-0.5">
          <Stat label={t('route.distance')} value={fmtKm(r.route.distanceM)} />
          <Stat label={t('route.totalTime')} value={fmtDuration(r.analysis.totalTimeS)} tone={r.analysis.totalTimeS > budget ? 'bad' : undefined} />
          <Stat label={t('route.maxSlope')} value={`${r.analysis.maxSlopeDeg.toFixed(1)}°`} tone={r.analysis.maxSlopeDeg >= params.nogoDeg ? 'bad' : r.analysis.maxSlopeDeg >= params.cautionDeg ? 'warn' : undefined} />
          <Stat label={t('route.cautionShare')} value={pct(r.analysis.cautionShare)} tone={r.analysis.cautionShare > 0.1 ? 'warn' : undefined} />
          <Stat label={t('route.ascent')} value={`+${Math.round(r.analysis.ascent)} m`} />
          <Stat label={t('route.o2End')} value={pct(r.analysis.fractionsAtEnd.o2)} tone={r.analysis.fractionsAtEnd.o2 < reserveFrac ? 'bad' : undefined} />
          <Stat label={t('route.batteryEnd')} value={pct(r.analysis.fractionsAtEnd.battery)} tone={r.analysis.fractionsAtEnd.battery < reserveFrac ? 'bad' : undefined} />
          <Stat
            label={t('route.doseEnd')}
            value={`${evaDoseMsv(r.analysis.totalTimeS).toFixed(3)} mSv`}
            tone={budgetShare(evaDoseMsv(r.analysis.totalTimeS), params.doseBudgetMsv) > 1 ? 'warn' : undefined}
          />
          <p className="text-xs text-muted">{t('route.doseShare', { pct: pct(Math.min(1, budgetShare(evaDoseMsv(r.analysis.totalTimeS), params.doseBudgetMsv))), budget: params.doseBudgetMsv })}</p>
          <Stat
            label={t('route.walkBackMargin')}
            value={fmtDuration(r.walkBack.minMarginS)}
            tone={r.walkBack.minMarginS < 0 ? 'bad' : r.walkBack.minMarginS < 15 * 60 ? 'warn' : undefined}
          />
          {r.walkBack.pointOfNoReturn ? (
            <p className="mt-1 text-xs text-caution">
              {t('route.pnr', { d: Math.round(r.walkBack.pointOfNoReturn.d), back: fmtDuration(r.walkBack.pointOfNoReturn.backS) })}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">{t('route.noPnr')}</p>
          )}
          {r.route.failed.length > 0 && (
            <p className="mt-1 text-xs text-danger">{t('route.failedStops', { ids: r.route.failed.join(', ') })}</p>
          )}
        </dl>
      )}
    </label>
  )
}

/** Shown while a scenario is injected: what it changed in the plan and where the crew should abort to. */
function AbortCard({ budgetS }: { budgetS: number }) {
  const { t } = useTranslation()
  const scenario = useMissionStore((s) => s.scenario)
  const routes = useMissionStore((s) => s.routes)
  const selected = useMissionStore((s) => s.selectedProfile)
  const data = usePlanData()
  const active = scenario.dustStorm || scenario.sepAlert || scenario.o2Leak
  const timeline = routes[selected]?.analysis.timeline
  const advice = useMemo(() => {
    if (!active || !timeline) return null
    return abortAdvice(timeline, budgetS, (p) => backTimeAt(p, data.back, data.grid), (p) => backTimeAt(p, data.roverBack, data.grid))
  }, [active, timeline, budgetS, data.back, data.roverBack, data.grid])
  if (!active) return null
  const applied = [
    scenario.dustStorm && t('route.abort.dust', { f: STORM_SPEED_FACTOR }),
    scenario.o2Leak && t('route.abort.leak', { pct: Math.round(LEAK_SUPPLY_FACTOR * 100) }),
    scenario.sepAlert && t('route.abort.sep'),
  ].filter(Boolean).join('; ')
  const where = advice ? t(`route.abort.${advice.nearest}`) : ''
  const fits = advice ? advice.marginS >= 0 : true
  return (
    <section aria-labelledby="abort-title" className="rounded-lg border border-caution/60 bg-caution/10 p-3 text-sm" data-testid="abort-card">
      <h3 id="abort-title" className="label text-caution">{t('route.abort.title')}</h3>
      <p className="mt-1 text-xs">{t('route.abort.applied', { list: applied })}</p>
      {advice && (
        <>
          <p className="mt-2 text-xs text-muted">{t('route.abort.worst', { d: Math.round(advice.at.d) })}</p>
          <ul className="hud-text mt-1 text-xs">
            <li>{t('route.abort.toHab', { time: fmtDuration(advice.habitatS) })}</li>
            <li>{t('route.abort.toRover', { time: fmtDuration(advice.roverS) })}</li>
          </ul>
          <p className={`mt-2 font-bold ${fits ? 'text-go' : 'text-danger'}`} role="status">
            {t(fits ? 'route.abort.go' : 'route.abort.tight', { where, time: fmtDuration(advice.nearestS), margin: fmtDuration(Math.abs(advice.marginS)) })}
          </p>
        </>
      )}
      <p className="mt-2 text-xs text-muted">{t('route.abort.note')}</p>
    </section>
  )
}

function NumberField(props: { id: string; label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={props.id} className="flex-1 text-xs text-fg/80">{props.label}</label>
      <input
        id={props.id}
        type="number"
        inputMode="decimal"
        className="w-20 rounded-md border border-line bg-bg px-2 py-1 text-right font-mono text-sm"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) props.onChange(Math.min(props.max, Math.max(props.min, v)))
        }}
      />
      <span className="w-8 text-xs text-muted">{props.unit}</span>
    </div>
  )
}

export default function RoutePanel() {
  const { t } = useTranslation()
  const { status: dtmStatus } = useDtm()
  const planStatus = useMissionStore((s) => s.planStatus)
  const planError = useMissionStore((s) => s.planError)
  const routes = useMissionStore((s) => s.routes)
  const selected = useMissionStore((s) => s.selectedProfile)
  const baseParams = useMissionStore((s) => s.params)
  const params = useEffectiveParams()
  const requiredIds = useMissionStore((s) => s.requiredStopIds)
  const scienceIds = useMissionStore((s) => s.scienceStopIds)
  const noGo = useMissionStore((s) => s.noGo)
  const blockedPct = useMissionStore((s) => s.blockedPct)
  const drawMode = useMissionStore((s) => s.drawMode)
  const { toggleRequiredStop, setDrawMode, removeNoGo, clearNoGo, setParams, bumpPlan } = useMissionStore.getState()

  const missing = dtmStatus === 'missing' || planStatus === 'nodtm'
  const budget = budgetSeconds(params)

  return (
    <section aria-labelledby="route-title" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 id="route-title" className="text-sm font-bold uppercase tracking-wider text-muted">{t('route.title')}</h2>
        <button type="button" className="btn btn-sm btn-primary ml-auto" onClick={bumpPlan} disabled={missing || planStatus === 'planning'}>
          {planStatus === 'planning' ? t('route.planning') : t('route.recompute')}
        </button>
      </div>

      {missing && <p className="rounded-lg border border-caution/50 bg-caution/10 p-2 text-sm text-caution" role="status">{t('route.noDtm')}</p>}
      {planStatus === 'error' && <p className="rounded-lg border border-danger/50 bg-danger/10 p-2 text-sm text-danger" role="alert">{t('route.error', { msg: planError })}</p>}
      {!missing && <p className="text-xs text-muted" role="status">{t('route.budget', { time: fmtDuration(budget), reserve: params.reserveMin })}</p>}

      <AbortCard budgetS={budget} />

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">{t('route.profilesTitle')}</legend>
        {PROFILES.map((id) => (
          <RouteCard key={id} id={id} r={routes[id]} params={params} selected={selected === id} busy={planStatus === 'idle' || planStatus === 'planning'} />
        ))}
      </fieldset>

      <div>
        <h3 className="label mb-1">{t('route.stops')}</h3>
        <ul className="flex flex-col gap-1">
          {SCIENCE_STOPS.map((s) => {
            const req = requiredIds.includes(s.id)
            const usedExtra = !req && scienceIds.includes(s.id)
            return (
              <li key={s.id} className="flex items-center gap-2">
                <input id={`stop-${s.id}`} type="checkbox" className="h-5 w-5 accent-[var(--color-go)]" checked={req} onChange={() => toggleRequiredStop(s.id)} />
                <label htmlFor={`stop-${s.id}`} className="flex-1 text-sm">{s.name}</label>
                {usedExtra && <span className="chip text-go">{t('route.addedByScience')}</span>}
                {!req && !usedExtra && <span className="chip">{t('route.optionalStop')}</span>}
              </li>
            )
          })}
        </ul>
        <p className="mt-1 text-xs text-muted">{t('route.stopsNote')}</p>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h3 className="label">{t('route.noGoTitle')}</h3>
          <button type="button" className="btn btn-sm ml-auto" onClick={() => setDrawMode(drawMode === 'nogo' ? 'none' : 'nogo')} aria-pressed={drawMode === 'nogo'}>
            {t('route.drawNoGo')}
          </button>
          {noGo.length > 0 && <button type="button" className="btn btn-sm" onClick={clearNoGo}>{t('route.clearNoGo')}</button>}
        </div>
        {noGo.length > 0 && (
          <ul className="mt-1 flex flex-col gap-1">
            {noGo.map((poly, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{t('route.noGoItem', { n: i + 1, pts: poly.length })}</span>
                <button type="button" className="btn btn-sm" onClick={() => removeNoGo(i)} aria-label={t('route.removeNoGo', { n: i + 1 })}>×</button>
              </li>
            ))}
          </ul>
        )}
        {blockedPct !== null && <p className="mt-1 text-xs text-muted">{t('route.blocked', { pct: blockedPct.toFixed(1), deg: params.nogoDeg })}</p>}
      </div>

      <details open className="rounded-lg border border-line p-2">
        <summary className="label cursor-pointer">{t('route.assumptions')}</summary>
        <div className="mt-2 flex flex-col gap-2">
          <NumberField id="p-caution" label={t('route.p.caution')} unit="°" value={baseParams.cautionDeg} min={5} max={baseParams.nogoDeg - 1} step={1} onChange={(v) => setParams({ cautionDeg: v })} />
          <NumberField id="p-nogo" label={t('route.p.nogo')} unit="°" value={baseParams.nogoDeg} min={baseParams.cautionDeg + 1} max={40} step={1} onChange={(v) => setParams({ nogoDeg: v })} />
          <NumberField id="p-speed" label={t('route.p.speed')} unit="km/h" value={baseParams.flatSpeedKmh} min={0.5} max={4} step={0.1} onChange={(v) => setParams({ flatSpeedKmh: v })} />
          <NumberField id="p-dwell" label={t('route.p.dwell')} unit="min" value={baseParams.stopDwellMin} min={0} max={60} step={5} onChange={(v) => setParams({ stopDwellMin: v })} />
          <NumberField id="p-cap" label={t('route.p.capacity')} unit="h" value={baseParams.suitCapacityHours} min={1} max={10} step={0.5} onChange={(v) => setParams({ suitCapacityHours: v })} />
          <NumberField id="p-reserve" label={t('route.p.reserve')} unit="min" value={baseParams.reserveMin} min={0} max={120} step={5} onChange={(v) => setParams({ reserveMin: v })} />
          <NumberField id="p-dose" label={t('route.p.dose')} unit="mSv" value={baseParams.doseBudgetMsv} min={0.01} max={2} step={0.01} onChange={(v) => setParams({ doseBudgetMsv: v })} />
          <NumberField id="p-sun" label={t('route.p.sunMin')} unit="°" value={baseParams.minSunElevationDeg} min={0} max={40} step={1} onChange={(v) => setParams({ minSunElevationDeg: v })} />
          <p className="text-xs text-muted">{t('route.assumptionsNote')}</p>
        </div>
      </details>
    </section>
  )
}
