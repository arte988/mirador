import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import {
  MISSION_NAME,
  SOL_RANGE,
  cameraLabel,
  loadImages,
  type ImagesPayload,
  type Mission,
  type RawImage,
} from '../../lib/povImages.ts'
import type { FetchResult } from '../../lib/storage.ts'

/** Kept outside the component so the choice survives switching panel tabs. */
const usePov = create<{ mission: Mission; sol: number; setMission: (m: Mission) => void; setSol: (n: number) => void }>((set) => ({
  mission: 'msl',
  sol: SOL_RANGE.msl.initial,
  setMission: (mission) => set({ mission, sol: SOL_RANGE[mission].initial }),
  setSol: (sol) => set({ sol }),
}))

const fmtUtc = (s: string) => (s ? s.slice(0, 16).replace('T', ' ') + ' UTC' : '—')

function SourceChip({ res }: { res: FetchResult<ImagesPayload> }) {
  const { t } = useTranslation()
  const p = res.data
  if (!p) return null
  if (p.source === 'snapshot') return <span className="chip text-caution">{t('images.src.snapshot')}</span>
  if (res.stale) return <span className="chip text-caution">{t('images.src.stale')}</span>
  return <span className="chip text-go">{t('images.src.live')}</span>
}

export default function ImagePanel() {
  const { t } = useTranslation()
  const { mission, sol, setMission, setSol } = usePov()
  const range = SOL_RANGE[mission]
  const [res, setRes] = useState<FetchResult<ImagesPayload> | null>(null)
  const [loading, setLoading] = useState(false)
  const [camera, setCamera] = useState('all')
  const [picked, setPicked] = useState<RawImage | null>(null)

  // Debounced load: dragging the slider does not fire a request per sol.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const id = window.setTimeout(() => {
      void loadImages(mission, sol).then((r) => {
        if (cancelled) return
        setRes(r)
        setLoading(false)
        setPicked(null)
        setCamera('all')
      })
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(id)
    }
  }, [mission, sol])

  // While another rover's list is still on screen (loading), show nothing from it and name images by their own rover.
  const wrongMission = !!res?.data && res.data.mission !== mission
  const images = wrongMission ? [] : (res?.data?.images ?? [])
  const cameras = useMemo(() => [...new Set(images.map((i) => i.camera))].sort(), [images])
  const shown = camera === 'all' ? images : images.filter((i) => i.camera === camera)
  const name = MISSION_NAME[mission]

  return (
    <section aria-labelledby="images-title" className="flex flex-col gap-3">
      <h2 id="images-title" className="text-sm font-bold uppercase tracking-wider text-muted">{t('images.title')}</h2>

      <p className="rounded-lg border border-caution/50 bg-caution/10 p-2 text-xs text-caution" role="note">
        {t('images.honest', { name })}
      </p>

      <fieldset className="flex flex-col gap-1">
        <legend className="label mb-1">{t('images.mission')}</legend>
        {(['msl', 'mars2020'] as Mission[]).map((m) => (
          <label key={m} className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="pov-mission"
              className="mt-1 h-4 w-4 accent-[var(--color-go)]"
              checked={mission === m}
              onChange={() => setMission(m)}
            />
            <span>
              <span className="font-semibold">{t(`images.missions.${m}.name`)}</span>
              <span className="block text-xs text-muted">{t(`images.missions.${m}.help`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div>
        <div className="flex items-center gap-2">
          <label htmlFor="pov-sol" className="label">{t('images.sol')}</label>
          <input
            id="pov-sol"
            type="number"
            inputMode="numeric"
            className="ml-auto w-20 rounded-md border border-line bg-bg px-2 py-1 text-right font-mono text-sm"
            min={range.min}
            max={range.max}
            value={sol}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value))
              if (Number.isFinite(v)) setSol(Math.min(range.max, Math.max(range.min, v)))
            }}
          />
        </div>
        <input
          type="range"
          aria-label={t('images.sol')}
          className="mt-1 h-6 w-full accent-[var(--color-go)]"
          min={range.min}
          max={range.max}
          value={sol}
          onChange={(e) => setSol(Number(e.target.value))}
        />
        <div className="flex justify-between font-mono text-xs text-muted"><span>{range.min}</span><span>{range.max}</span></div>
        <p className="mt-1 text-xs text-muted">{t(`images.range.${mission}`)}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        {loading && <span className="text-xs text-muted">{t('images.loading')}</span>}
        {!loading && res && !wrongMission && <SourceChip res={res} />}
        {!loading && res?.data && !wrongMission && (
          <span className="text-xs text-muted">{t('images.count', { shown: shown.length, total: res.data.total, sol: res.data.sol })}</span>
        )}
      </div>

      {!loading && res && !res.data && <p className="rounded-lg border border-danger/50 bg-danger/10 p-2 text-sm text-danger" role="alert">{t('images.error', { msg: res.error ?? '' })}</p>}
      {!loading && res?.data && !wrongMission && images.length === 0 && <p className="text-sm text-muted">{t('images.none', { sol })}</p>}

      {cameras.length > 1 && (
        <div>
          <label htmlFor="pov-cam" className="label">{t('images.camera')}</label>
          <select id="pov-cam" className="mt-1 w-full rounded-md border border-line bg-bg px-2 py-1.5 text-sm" value={camera} onChange={(e) => setCamera(e.target.value)}>
            <option value="all">{t('images.allCameras')}</option>
            {cameras.map((c) => <option key={c} value={c}>{cameraLabel(c)}</option>)}
          </select>
        </div>
      )}

      {picked && (
        <figure className="card p-2" data-testid="pov-preview">
          <img src={picked.large} alt={t('images.alt', { name, camera: cameraLabel(picked.camera), sol: picked.sol })} className="w-full rounded-md bg-black" />
          <figcaption className="mt-1 text-xs">
            <span className="font-semibold">{cameraLabel(picked.camera)}</span> · {t('images.solShort', { sol: picked.sol })} · {fmtUtc(picked.utc)}
            <span className="block text-muted">{picked.credit}</span>
            <a className="underline" href={picked.link} target="_blank" rel="noreferrer">{t('images.openRaw')}</a>
            <button type="button" className="btn btn-sm ml-2" onClick={() => setPicked(null)}>{t('images.close')}</button>
          </figcaption>
        </figure>
      )}

      <ul className="grid grid-cols-3 gap-1.5">
        {shown.map((img) => (
          <li key={img.id}>
            <button
              type="button"
              className={`block w-full overflow-hidden rounded-md border ${picked?.id === img.id ? 'border-go ring-1 ring-go' : 'border-line'}`}
              onClick={() => setPicked(img)}
              aria-label={t('images.alt', { name, camera: cameraLabel(img.camera), sol: img.sol })}
              aria-pressed={picked?.id === img.id}
            >
              <img src={img.small} alt="" loading="lazy" className="aspect-square w-full bg-black object-cover" />
            </button>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted">{t('images.credit')}</p>
    </section>
  )
}
