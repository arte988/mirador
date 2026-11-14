import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { CHANNEL, applyShared, shareUrl, snapshotPlan } from '../../lib/handoff.ts'
import { cueCardHtml, download, selectedGeoJSON } from '../../lib/exportPlan.ts'
import DownloadArea from '../offline/DownloadArea.tsx'
import { useMissionStore } from '../../stores/useMissionStore.ts'

export default function ShareCard() {
  const { t } = useTranslation()
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const required = useMissionStore((s) => s.requiredStopIds)
  const profile = useMissionStore((s) => s.selectedProfile)
  const noGo = useMissionStore((s) => s.noGo)
  const url = shareUrl(snapshotPlan())

  useEffect(() => {
    let cancelled = false
    void QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#001014', light: '#e8eef5' } }).then((u) => {
      if (!cancelled) setDataUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [url, required, profile, noGo])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (e) => {
      if (e.data?.type === 'plan' && e.data.plan) applyShared(e.data.plan)
    }
    return () => ch.close()
  }, [])

  const send = () => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage({ type: 'plan', plan: snapshotPlan() })
    ch.close()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <section aria-labelledby="share-title" className="flex flex-col gap-2">
      <h2 id="share-title" className="text-sm font-bold uppercase tracking-wider text-muted">{t('eva.share')}</h2>
      <p className="text-xs text-muted">{t('eva.shareNote')}</p>
      {dataUrl && <img src={dataUrl} alt={t('eva.qrAlt')} className="mx-auto h-40 w-40 rounded-md border border-line bg-fg" />}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-sm" onClick={() => void copy()}>{copied ? t('eva.copied') : t('eva.copy')}</button>
        <button type="button" className="btn btn-sm" onClick={send}>{t('eva.broadcast')}</button>
        <button type="button" className="btn btn-sm" onClick={() => download('mirador-route.geojson', selectedGeoJSON(), 'application/geo+json')}>{t('eva.geojson')}</button>
        <button type="button" className="btn btn-sm" onClick={() => download('mirador-cue-card.html', cueCardHtml(), 'text/html')}>{t('eva.cue')}</button>
      </div>
      <DownloadArea />
    </section>
  )
}
