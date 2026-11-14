import { useTranslation } from 'react-i18next'
import { CHECKLIST } from '../../lib/evaChecklist.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'

export default function Checklist() {
  const { t } = useTranslation()
  const checks = useMissionStore((s) => s.checklist)
  const commsAck = useMissionStore((s) => s.commsAck)
  const { setCheck, resetChecklist, setCommsAck } = useMissionStore.getState()
  const done = CHECKLIST.filter((c) => checks[c.id]).length
  return (
    <section aria-labelledby="check-title" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 id="check-title" className="text-sm font-bold uppercase tracking-wider text-muted">{t('eva.checklist')}</h2>
        <span className="chip ml-auto">{t('eva.progress', { n: done, total: CHECKLIST.length })}</span>
      </div>
      <p className="text-xs text-caution">{t('eva.checklistNote')}</p>
      <ul className="flex flex-col gap-1">
        {CHECKLIST.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              id={`chk-${c.id}`}
              type="checkbox"
              className="h-5 w-5 accent-[var(--color-go)]"
              checked={!!checks[c.id]}
              onChange={(e) => setCheck(c.id, e.target.checked)}
            />
            <label htmlFor={`chk-${c.id}`} className="flex-1 text-sm">{t(`eva.items.${c.id}`)}</label>
          </li>
        ))}
      </ul>
      <label className="mt-1 flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-go)]" checked={commsAck} onChange={(e) => setCommsAck(e.target.checked)} />
        <span>{t('eva.commsAck')}</span>
      </label>
      <button type="button" className="btn btn-sm self-start" onClick={resetChecklist}>{t('eva.reset')}</button>
    </section>
  )
}
