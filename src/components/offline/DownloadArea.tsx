import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { areaCacheCount, downloadPack, estimateBytes, fmtMb, planPack, type PackPlan } from '../../lib/offlineArea.ts'

export default function DownloadArea() {
  const { t } = useTranslation()
  const [plans, setPlans] = useState<PackPlan[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [cached, setCached] = useState(0)
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    void planPack().then(setPlans).catch((e) => setError(e instanceof Error ? e.message : String(e)))
    void areaCacheCount().then(setCached)
    return () => abort.current?.abort()
  }, [])

  const est = plans ? estimateBytes(plans) : null

  const run = async () => {
    if (!plans) return
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setBusy(true)
    setResult(null)
    setError(null)
    try {
      const r = await downloadPack(plans, (d, tot) => {
        setDone(d)
        setTotal(tot)
      }, ctrl.signal)
      setResult(r)
      setCached(await areaCacheCount())
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="off-title" className="flex flex-col gap-2">
      <h2 id="off-title" className="text-sm font-bold uppercase tracking-wider text-muted">{t('offline.title')}</h2>
      <p className="text-xs text-muted">{t('offline.note')}</p>
      {est && <p className="text-sm">{t('offline.estimate', { n: est.tiles, mb: fmtMb(est.bytes) })}</p>}
      {cached > 0 && <p className="text-xs text-go">{t('offline.cached', { n: cached })}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm btn-primary" disabled={!plans || busy} onClick={() => void run()}>
          {busy ? t('offline.working', { n: done, total: total || est?.tiles || 0 }) : t('offline.download')}
        </button>
        {busy && (
          <button type="button" className="btn btn-sm" onClick={() => abort.current?.abort()}>
            {t('offline.cancel')}
          </button>
        )}
      </div>
      {result && <p className="text-xs text-muted" role="status">{t('offline.done', { ok: result.ok, fail: result.fail })}</p>}
      {error && <p className="text-xs text-danger" role="alert">{t('offline.error', { msg: error })}</p>}
    </section>
  )
}
