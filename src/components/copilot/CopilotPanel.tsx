import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TOOL_NAMES, type CopilotToolName } from '../../../api/_copilot.ts'
import { HABITAT, SUPPORT_ROVER } from '../../data/sites.ts'
import { ageParts } from '../../lib/copilot/evidence.ts'
import { confirmAbort, dismissAbort, useCopilotStore } from '../../lib/copilot/proposal.ts'
import { useToolLog, type ToolLogEntry } from '../../lib/copilot/toolLog.ts'
import { useCopilot } from '../../lib/copilot/useCopilot.ts'
import { fmtDuration, fmtKm } from '../../lib/format.ts'

function ToolName({ name }: { name: string }) {
  const { t } = useTranslation()
  return <>{TOOL_NAMES.includes(name as CopilotToolName) ? t(`copilot.tools.${name as CopilotToolName}`) : name}</>
}
function Evidence({ entry }: { entry: ToolLogEntry }) {
  const { t } = useTranslation()
  const age = ageParts(entry.result.ageS)
  return <span className="inline-flex max-w-full flex-wrap gap-x-1 rounded-md border border-line bg-black/30 px-2 py-1 text-xs text-fg"><strong><ToolName name={entry.name} /></strong><span>· {entry.result.source}</span><span>· {age ? t(`copilot.${age.unit}`, { value: age.value }) : t('copilot.unknownAge')}</span>{!entry.result.ok && <span>· {t('copilot.noData')}</span>}{entry.result.note && <span>· {entry.result.note}</span>}</span>
}

interface ProposalValue { target: string; timeS: number; distanceM: number; fitsRemainingTimeBudget: boolean }
function proposalValue(entry: ToolLogEntry | undefined): ProposalValue | null {
  const value = entry?.result.value as Partial<ProposalValue> | null
  return entry?.name === 'propose_abort' && entry.result.ok && value && typeof value.target === 'string' && typeof value.timeS === 'number' && typeof value.distanceM === 'number' && typeof value.fitsRemainingTimeBudget === 'boolean' ? value as ProposalValue : null
}

export default function CopilotPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [stale, setStale] = useState(false)
  const holding = useRef(false)
  const transcriptEnd = useRef<HTMLDivElement>(null)
  const state = useCopilot()
  const entries = useToolLog((s) => s.entries)
  const pending = useCopilotStore((s) => s.pendingAbort)
  const sessionActive = !['idle', 'closed', 'error'].includes(state.status)
  const canInput = ['ready', 'speaking', 'thinking', 'listening'].includes(state.status)
  const canTalk = canInput && state.mode === 'voice'
  const latest = [...entries].reverse().find((entry) => {
    const value = proposalValue(entry)
    return pending && value && value.timeS === pending.timeS && value.distanceM === pending.analysis.profile.length && value.target === (pending.target === 'hab' ? HABITAT.name : SUPPORT_ROVER.name)
  })
  const proposal = proposalValue(latest)
  useEffect(() => { if (expanded) transcriptEnd.current?.scrollIntoView({ block: 'nearest' }) }, [state.transcript, expanded])
  useEffect(() => () => { if (holding.current) useCopilot.getState().pttUp() }, [])
  const down = () => { if (!holding.current && canTalk) { holding.current = true; state.pttDown() } }
  const up = () => { if (holding.current) { holding.current = false; state.pttUp() } }
  const submit = (event: FormEvent) => { event.preventDefault(); if (text.trim() && canInput) { state.sendText(text); setText('') } }
  return (
    <section className={`pointer-events-auto absolute right-3 ${compact ? 'top-24' : 'top-16'} z-30 w-[min(23rem,calc(100%-1.5rem))] rounded-xl border border-line bg-surface/95 text-fg shadow-xl`} aria-label={t('copilot.title')}>
      <div className="flex items-center justify-between gap-2 p-2">
        <div className="min-w-0"><strong className="text-sm tracking-wider">{t('copilot.title')}</strong><p className="text-xs text-caution">{t('copilot.badge')}</p></div>
        <button type="button" className="btn min-h-11 shrink-0" aria-expanded={expanded} aria-label={t(expanded ? 'copilot.close' : 'copilot.open')} onClick={() => { up(); setExpanded(!expanded) }}>{expanded ? '−' : '+'}</button>
      </div>
      {expanded && <div className={`${compact ? 'max-h-[min(35vh,22rem)]' : 'max-h-[min(65vh,36rem)]'} overflow-y-auto border-t border-line p-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className="rounded-full border border-line px-2 py-1 text-sm">{t(`copilot.status.${state.status}`)}</span>
          <button type="button" className="btn min-h-11" onClick={() => sessionActive ? state.stop() : void state.start()}>{t(sessionActive ? 'copilot.disconnect' : 'copilot.connect')}</button>
          <button type="button" className="btn min-h-11" aria-pressed={state.muted} onClick={() => state.setMuted(!state.muted)}>{t(state.muted ? 'copilot.unmute' : 'copilot.mute')}</button>
        </div>
        {state.lastError && <p role="alert" className="mt-2 rounded-lg border border-caution p-2 text-sm text-caution">{t(`copilot.errors.${state.lastError}`)}</p>}
        <button type="button" className="btn btn-primary mt-3 min-h-14 w-full touch-none" disabled={!canTalk} aria-label={t('copilot.pttLabel')} aria-pressed={state.status === 'listening'}
          onPointerDown={(event) => { if (event.button === 0) { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); down() } }}
          onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onBlur={up}
          onKeyDown={(event) => { if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) down() } }}
          onKeyUp={(event) => { if (event.code === 'Space') { event.preventDefault(); up() } }}>
          {t(state.status === 'listening' ? 'copilot.listening' : 'copilot.hold')}
        </button>
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
          <label htmlFor="copilot-message" className="text-sm font-semibold">{t('copilot.textLabel')}</label>
          <div className="flex gap-2"><input id="copilot-message" className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-black/30 px-3 text-fg" value={text} onChange={(e) => setText(e.target.value)} disabled={!canInput} /><button className="btn min-h-11" type="submit" disabled={!canInput || !text.trim()}>{t('copilot.send')}</button></div>
        </form>
        {pending && <section className="mt-3 rounded-lg border border-caution bg-caution/10 p-3" aria-label={t('copilot.proposal')}>
          <h3 className="font-bold text-caution">{t('copilot.proposal')}</h3><p className="mt-1 text-sm">{t('copilot.proposalNote')}</p>
          {proposal && <dl className="mt-2 grid grid-cols-2 gap-2 text-sm"><div><dt>{t('copilot.target')}</dt><dd className="font-semibold">{proposal.target}</dd></div><div><dt>{t('copilot.travelTime')}</dt><dd>{fmtDuration(proposal.timeS)}</dd></div><div><dt>{t('copilot.distance')}</dt><dd>{fmtKm(proposal.distanceM)}</dd></div><div><dt>{t('copilot.fits')}</dt><dd>{t(proposal.fitsRemainingTimeBudget ? 'app.yes' : 'app.no')}</dd></div></dl>}
          <p className="mt-2 text-xs">{t('copilot.budgetNote')}</p>
          <div className="mt-2 flex flex-wrap gap-2"><button type="button" className="btn btn-danger min-h-11" onClick={() => { setStale(!confirmAbort()) }}>{t('copilot.confirm')}</button><button type="button" className="btn min-h-11" onClick={() => { dismissAbort(); setStale(false) }}>{t('copilot.dismiss')}</button></div>
        </section>}
        {stale && <p role="alert" className="mt-2 text-sm text-caution">{t('copilot.staleProposal')}</p>}
        <section className="mt-4" aria-label={t('copilot.transcript')}><h3 className="text-sm font-semibold">{t('copilot.transcript')}</h3>
          <div className="mt-2 max-h-48 space-y-2 overflow-y-auto" aria-live="polite">{state.transcript.length === 0 && <p className="text-sm text-muted">{t('copilot.empty')}</p>}{state.transcript.map((line) => <article key={line.id} className={`rounded-lg p-2 text-sm ${line.role === 'user' ? 'bg-black/30' : 'border border-line'}`}><p className="font-semibold">{line.role === 'user' ? t('copilot.textLabel') : t('copilot.title')} {!line.final && <span className="text-xs text-muted">· {t('copilot.partial')}</span>}</p><p className="whitespace-pre-wrap break-words">{line.text}</p>{line.evidence.length > 0 && <div className="mt-2 flex flex-wrap gap-1" aria-label={t('copilot.evidence')}>{line.evidence.map((entry, i) => <Evidence key={`${entry.id}-${i}`} entry={entry} />)}</div>}</article>)}<div ref={transcriptEnd} /></div>
        </section>
        <details className="mt-4 border-t border-line pt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">{t('copilot.log')} ({entries.length})</summary>{!entries.length && <p className="text-sm text-muted">{t('copilot.noCalls')}</p>}<ol className="max-h-56 space-y-2 overflow-y-auto">{[...entries].reverse().map((entry, i) => <li key={`${entry.id}-${entry.at}-${i}`} className="rounded-lg border border-line p-2 text-sm"><p><ToolName name={entry.name} /> · <time dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleTimeString()}</time> · {t(entry.result.ok ? 'copilot.ok' : 'copilot.noData')}</p><p className="break-all text-xs">{t('copilot.arguments')}: {JSON.stringify(entry.args ?? {})}</p><div className="mt-1"><Evidence entry={entry} /></div></li>)}</ol></details>
      </div>}
    </section>
  )
}
