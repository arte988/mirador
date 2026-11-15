import { useTranslation } from 'react-i18next'
import { ageParts } from '../../lib/copilot/evidence.ts'
import type { FallbackResults } from '../../lib/copilot/fallback.ts'
import type { ToolResult } from '../../lib/copilot/tools.ts'
import { fmtDuration } from '../../lib/format.ts'
import type { SafetyResult } from '../../lib/safety.ts'

function Provenance({ result }: { result: ToolResult }) {
  const { t } = useTranslation()
  const age = ageParts(result.ageS)
  return <p className="mt-1 break-words text-xs text-muted">{result.source} · {age ? t(`copilot.${age.unit}`, { value: age.value }) : t('copilot.unknownAge')}{result.note && ` · ${result.note}`}</p>
}
export default function FallbackCard({ data }: { data: FallbackResults }) {
  const { t } = useTranslation()
  const route = data.can_continue.value as { currentMarginS?: number; totalTimeS?: number; fitsTimeBudget?: boolean; walkBack?: { pointOfNoReturn?: unknown } } | null
  const safety = data.get_safety.value as SafetyResult | null
  const comms = data.comms_delay.value as { oneWayMinutes?: number } | null
  return <section className="mt-3 rounded-lg border border-line bg-black/20 p-3" aria-label={t('copilot.fallbackTitle')}>
    <h3 className="font-bold">{t('copilot.fallbackTitle')}</h3><p className="mt-1 text-xs text-muted">{t('copilot.fallbackHelp')}</p>
    <div className="mt-3 space-y-3 text-sm">
      <div><strong>{t('copilot.fallbackButton')}</strong>{data.can_continue.ok && route ? <dl><div>{t('copilot.fallbackMargin')}: {typeof route.currentMarginS === 'number' && Number.isFinite(route.currentMarginS) ? `${route.currentMarginS < 0 ? '−' : ''}${fmtDuration(Math.abs(route.currentMarginS))}` : t('copilot.noData')}</div><div>{t('copilot.fallbackTotal')}: {typeof route.totalTimeS === 'number' && Number.isFinite(route.totalTimeS) ? fmtDuration(route.totalTimeS) : t('copilot.noData')}</div><div>{t('copilot.fallbackFits')}: {typeof route.fitsTimeBudget === 'boolean' ? t(route.fitsTimeBudget ? 'app.yes' : 'app.no') : t('copilot.noData')}</div><div>{t('copilot.fallbackPnr')}: {route.walkBack && 'pointOfNoReturn' in route.walkBack ? t(route.walkBack.pointOfNoReturn ? 'copilot.fallbackPnrYes' : 'copilot.fallbackPnrNo') : t('copilot.noData')}</div></dl> : <p>{t('copilot.noData')}</p>}<Provenance result={data.can_continue} /></div>
      <div><strong>{t('copilot.fallbackSafety')}</strong>: {data.get_safety.ok && safety ? t(`safety.levels.${safety.level}`) : t('copilot.noData')}{data.get_safety.ok && safety?.reasons?.length ? <ul className="list-inside list-disc">{safety.reasons.map((reason, i) => <li key={`${reason.id}-${i}`}>{t(`safety.reasons.${reason.key}`, reason.params ?? {})}</li>)}</ul> : null}<Provenance result={data.get_safety} /></div>
      <div><strong>{t('copilot.fallbackDelay')}</strong>: {data.comms_delay.ok && typeof comms?.oneWayMinutes === 'number' && Number.isFinite(comms.oneWayMinutes) ? fmtDuration(comms.oneWayMinutes * 60) : t('copilot.noData')}<Provenance result={data.comms_delay} /></div>
    </div>
  </section>
}
