import { useTranslation } from 'react-i18next'
import { LAYER_DEFS, type LayerDef } from '../../data/layers.ts'
import { useDtm } from '../../lib/dtmStore.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'
import DownloadArea from '../offline/DownloadArea.tsx'
import GeologyLegend from './GeologyLegend.tsx'

/**
 * Worldview-inspired layer manager (UX only: Worldview is an Earth tool, GIBS tiles are never loaded as Mars).
 * One row per layer: visibility, name, type, opacity, reorder, one-line "what is this" help and credit.
 */
export default function LayerPanel() {
  const { t } = useTranslation()
  const layers = useMissionStore((s) => s.layers)
  const setVisible = useMissionStore((s) => s.setLayerVisible)
  const setOpacity = useMissionStore((s) => s.setLayerOpacity)
  const move = useMissionStore((s) => s.moveLayer)
  const reset = useMissionStore((s) => s.resetLayers)
  const { status } = useDtm()

  // Top of the list = top of the stack.
  const rows = [...layers].reverse()

  return (
    <section aria-labelledby="layers-title" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 id="layers-title" className="text-sm font-bold uppercase tracking-wider text-muted">
          {t('layers.title')}
        </h2>
        <button type="button" className="btn btn-sm" onClick={reset}>
          {t('layers.reset')}
        </button>
      </div>
      <p className="text-xs text-muted">{t('layers.worldviewNote')}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((ls, i) => {
          const def = LAYER_DEFS.find((d) => d.id === ls.id) as LayerDef
          const unavailable = def.needsDtm && status === 'missing'
          const upDisabled = i === 0
          const downDisabled = i === rows.length - 1
          return (
            <li key={ls.id} className="card p-2" data-layer={ls.id}>
              <div className="flex items-center gap-2">
                <input
                  id={`vis-${ls.id}`}
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-go)]"
                  checked={ls.visible}
                  disabled={unavailable}
                  onChange={(e) => setVisible(ls.id, e.target.checked)}
                />
                <label htmlFor={`vis-${ls.id}`} className="min-w-0 flex-1 cursor-pointer text-sm font-semibold leading-tight">
                  {t(`layers.items.${ls.id}.name`)}
                </label>
                <span className="chip">{t(`layers.kind.${def.kind}`)}</span>
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ minHeight: '1.5rem' }}
                    onClick={() => move(ls.id, 1)}
                    disabled={upDisabled}
                    aria-label={t('layers.moveUp', { name: t(`layers.items.${ls.id}.name`) })}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ minHeight: '1.5rem' }}
                    onClick={() => move(ls.id, -1)}
                    disabled={downDisabled}
                    aria-label={t('layers.moveDown', { name: t(`layers.items.${ls.id}.name`) })}
                  >
                    ▼
                  </button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label htmlFor={`op-${ls.id}`} className="label">
                  {t('layers.opacity')}
                </label>
                <input
                  id={`op-${ls.id}`}
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(ls.opacity * 100)}
                  onChange={(e) => setOpacity(ls.id, Number(e.target.value) / 100)}
                  className="h-6 flex-1 accent-[var(--color-go)]"
                />
                <span className="w-9 text-right font-mono text-xs text-muted">{Math.round(ls.opacity * 100)}%</span>
              </div>
              <p className="mt-1 text-xs text-fg/80">{t(`layers.items.${ls.id}.help`)}</p>
              {def.regionalOnly && <p className="mt-1 text-xs font-semibold text-caution">{t('layers.regionalOnly')}</p>}
              {ls.id === 'geology' && ls.visible && <GeologyLegend />}
              {unavailable && <p className="mt-1 text-xs text-danger">{t('layers.noDtm')}</p>}
              <p className="mt-1 text-[0.6875rem] text-muted">{t(`layers.items.${ls.id}.credit`)}</p>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted">{t('map.coverageNote')}</p>
      <div className="border-t border-line pt-3">
        <DownloadArea />
      </div>
    </section>
  )
}
