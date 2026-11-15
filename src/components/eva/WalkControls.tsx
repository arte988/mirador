import { useTranslation } from 'react-i18next'
import { abortNow } from '../../lib/abortNow.ts'
import { preloadForecast } from '../../lib/climateLoad.ts'
import { fmtDuration, pct } from '../../lib/format.ts'
import { useEffectiveParams } from '../../lib/scenarioPlan.ts'
import { useSimView } from '../../lib/useSim.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'

export default function WalkControls() {
  const { t } = useTranslation()
  const sim = useSimView()
  const status = useMissionStore((s) => s.walkStatus)
  const speed = useMissionStore((s) => s.simSpeed)
  const buddy = useMissionStore((s) => s.buddyRole)
  const planStatus = useMissionStore((s) => s.planStatus)
  const params = useEffectiveParams()
  const mps = params.flatSpeedKmh / 3.6
  const { setWalk, setBuddyRole } = useMissionStore.getState()
  const ready = planStatus === 'ready' && !!sim
  const running = status === 'walking' || status === 'aborting'

  const start = () => {
    void preloadForecast()
    setWalk({ walkStatus: 'walking', elapsedS: status === 'paused' || status === 'aborting' ? useMissionStore.getState().elapsedS : 0, abortRoute: status === 'aborting' ? useMissionStore.getState().abortRoute : null })
  }
  const pause = () => setWalk({ walkStatus: 'paused' })
  const reset = () => setWalk({ walkStatus: 'idle', elapsedS: 0, abortRoute: null })

  const next =
    !sim ? '—'
    : sim.nextKind === 'stop' ? t('eva.nextStop', { name: sim.nextName ?? '' })
    : sim.nextKind === 'hab' ? t('eva.nextHab')
    : t('eva.nextRover')

  return (
    <section aria-labelledby="walk-title" className="flex flex-col gap-2">
      <h2 id="walk-title" className="text-sm font-bold uppercase tracking-wider text-muted">{t('eva.walk')}</h2>
      <p className="text-xs text-caution">{t('eva.walkNote')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-primary" disabled={!ready || running} onClick={start}>{status === 'paused' ? t('eva.resume') : t('eva.start')}</button>
        <button type="button" className="btn btn-sm" disabled={!running} onClick={pause}>{t('eva.pause')}</button>
        <button type="button" className="btn btn-sm" onClick={reset}>{t('eva.resetWalk')}</button>
        <button type="button" className="btn btn-sm btn-danger" disabled={!ready} onClick={() => void abortNow()}>{t('eva.abort')}</button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="flex-1">{t('eva.speed')}</span>
        <input type="range" min={1} max={20} step={1} value={speed} onChange={(e) => setWalk({ simSpeed: Number(e.target.value) })} className="h-6 flex-1 accent-[var(--color-go)]" />
        <span className="w-10 text-right font-mono text-xs">{Math.round(speed)}×</span>
      </label>
      <fieldset>
        <legend className="label mb-1">{t('eva.buddy')}</legend>
        {(['follow', 'safest', 'rover'] as const).map((r) => (
          <label key={r} className="flex items-center gap-2 py-0.5 text-sm">
            <input type="radio" name="buddy" className="h-4 w-4 accent-[var(--color-go)]" checked={buddy === r} onChange={() => setBuddyRole(r)} />
            {t(`eva.buddyRoles.${r}`)}
          </label>
        ))}
      </fieldset>
      {sim && (
        <dl className="grid gap-y-0.5 text-sm">
          <div className="flex justify-between"><dt className="text-xs text-muted">{t('eva.next')}</dt><dd>{next}</dd></div>
          <div className="flex justify-between"><dt className="text-xs text-muted">{t('eva.eta')}</dt><dd className="hud-text">{sim.nextDistanceM != null ? fmtDuration(sim.nextDistanceM / mps) : '—'}</dd></div>
          <div className="flex justify-between"><dt className="text-xs text-muted">{t('eva.o2')}</dt><dd className="hud-text">{pct(sim.o2)}</dd></div>
          <div className="flex justify-between"><dt className="text-xs text-muted">{t('eva.battery')}</dt><dd className="hud-text">{pct(sim.battery)}</dd></div>
          <div className="flex justify-between"><dt className="text-xs text-muted">{t('eva.left')}</dt><dd className="hud-text">{fmtDuration(sim.secondsLeft)}</dd></div>
        </dl>
      )}
      {!sim && <p className="text-xs text-muted">{planStatus === 'planning' || planStatus === 'idle' ? t('route.planning') : t('eva.needPlan')}</p>}
    </section>
  )
}
