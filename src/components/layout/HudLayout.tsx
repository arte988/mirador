import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HABITAT } from '../../data/sites.ts'
import { abortNow } from '../../lib/abortNow.ts'
import { preloadForecast } from '../../lib/climateLoad.ts'
import type { GaleForecast } from '../../lib/climateForecast.ts'
import { fmtDuration, fmtKm, pct } from '../../lib/format.ts'
import { backTimeAt, usePlanData } from '../../stores/usePlanData.ts'
import { useClock } from '../../lib/useClock.ts'
import { useAutoPlan } from '../../lib/useAutoPlan.ts'
import { useSafetyEngine } from '../../lib/useSafety.ts'
import { useSimView } from '../../lib/useSim.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'
import MarsMap from '../map/MarsMap.tsx'
import { LEVEL_STYLE } from '../safety/SafetyPanel.tsx'

export default function HudLayout() {
  const { t } = useTranslation()
  useAutoPlan()
  useSafetyEngine()
  useClock()
  const sim = useSimView()
  const safety = useMissionStore((s) => s.safety)
  const status = useMissionStore((s) => s.walkStatus)
  const planStatus = useMissionStore((s) => s.planStatus)
  const { setWalk } = useMissionStore.getState()
  const [forecast, setForecast] = useState<GaleForecast | null>(null)
  useEffect(() => {
    void preloadForecast().then((r) => setForecast(r.data))
  }, [])
  const air = forecast?.series.t_air
  const pred = air?.status === 'prediction' && air.q50.length > 0
  const grid = usePlanData((s) => s.grid)
  const back = usePlanData((s) => s.back)
  const level = safety?.level ?? 'amber'
  const st = LEVEL_STYLE[level]
  const backS = sim ? backTimeAt(sim.position, back, grid) : Infinity
  const next =
    planStatus === 'planning' || planStatus === 'idle' ? t('route.planning')
    : !sim ? t('eva.needPlan')
    : sim.nextKind === 'stop' ? t('eva.nextStop', { name: sim.nextName ?? '' })
    : sim.nextKind === 'hab' ? t('eva.nextHab')
    : t('eva.nextRover')
  return (
    <div className="relative h-full min-h-0 bg-black">
      <div className="h-full">
        <MarsMap />
      </div>
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3">
        <div className="flex items-start justify-between gap-2">
          <p className={`rounded-lg border px-3 py-1 text-lg font-extrabold uppercase tracking-wider ${st.border} ${st.bg} ${st.text}`} role="status">
            <span aria-hidden="true">{st.glyph} </span>{t(`safety.levels.${level}`)}
          </p>
          <p className="rounded-lg border border-line bg-surface/80 px-3 py-1 font-mono text-sm text-fg">{sim ? fmtKm(sim.distanceM) : '—'}</p>
        </div>
        <div className="pointer-events-auto mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-line bg-surface/90 p-3 text-center">
          <p className="hud-text text-2xl font-bold">{next}</p>
          <p className="text-sm text-fg">
            {pred && air
              ? t('climate.hud', { kind: t('climate.pred'), t: air.q50[0], lo: Math.min(...air.q10), hi: Math.max(...air.q90) })
              : t('climate.hudNone')}
          </p>
          {sim?.nextDistanceM != null && <p className="text-sm text-muted">{fmtKm(sim.nextDistanceM)} · {t('eva.habBack', { t: fmtDuration(backS) })}</p>}
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div><dt className="label">{t('eva.o2')}</dt><dd className="hud-text text-lg">{sim ? pct(sim.o2) : '—'}</dd></div>
            <div><dt className="label">{t('eva.battery')}</dt><dd className="hud-text text-lg">{sim ? pct(sim.battery) : '—'}</dd></div>
            <div><dt className="label">{t('eva.left')}</dt><dd className="hud-text text-lg">{sim ? fmtDuration(sim.secondsLeft) : '—'}</dd></div>
          </dl>
          <p className="text-xs text-caution">{t('eva.hudNote')}</p>
          <div className="flex justify-center gap-2">
            {status !== 'walking' && status !== 'aborting' && (
              <button type="button" className="btn btn-primary" onClick={() => { void preloadForecast(); setWalk({ walkStatus: 'walking' }) }}>{t('eva.start')}</button>
            )}
            {(status === 'walking' || status === 'aborting') && (
              <button type="button" className="btn" onClick={() => setWalk({ walkStatus: 'paused' })}>{t('eva.pause')}</button>
            )}
            <button type="button" className="btn btn-danger" onClick={() => void abortNow()}>{t('eva.abort')}</button>
          </div>
          <p className="text-[0.65rem] text-muted">{HABITAT.name}</p>
        </div>
      </div>
    </div>
  )
}
