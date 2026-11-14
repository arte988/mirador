import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { profileAlong, type ElevationProfile } from '../../lib/dtm.ts'
import { useDtm } from '../../lib/dtmStore.ts'
import { formatLonLat } from '../../lib/crsMars.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'

const W = 640
const H = 150
const PAD = { l: 44, r: 10, t: 10, b: 22 }

function slopeColor(deg: number, caution: number, nogo: number): string {
  if (deg >= nogo) return '#ff5a5f'
  if (deg >= caution) return '#ffb020'
  return '#22d3ee'
}

function Chart({ p, caution, nogo }: { p: ElevationProfile; caution: number; nogo: number }) {
  const { t } = useTranslation()
  const [hover, setHover] = useState<number | null>(null)
  const span = Math.max(1, p.length)
  const lo = Math.floor(p.minElevation - 2)
  const hi = Math.ceil(p.maxElevation + 2)
  const x = (d: number) => PAD.l + (d / span) * (W - PAD.l - PAD.r)
  const y = (e: number) => PAD.t + (1 - (e - lo) / Math.max(1, hi - lo)) * (H - PAD.t - PAD.b)

  const segments = p.distance.slice(1).flatMap((d, i) => (Number.isFinite(p.elevation[i]) && Number.isFinite(p.elevation[i + 1]) ? [{
    x1: x(p.distance[i]),
    y1: y(p.elevation[i]),
    x2: x(d),
    y2: y(p.elevation[i + 1]),
    c: slopeColor(p.slopeDeg[i + 1], caution, nogo),
  }] : []))
  const complete = p.elevation.every(Number.isFinite)
  const area = complete
    ? `M ${x(0)} ${H - PAD.b} ` + p.distance.map((d, i) => `L ${x(d)} ${y(p.elevation[i])}`).join(' ') + ` L ${x(span)} ${H - PAD.b} Z`
    : ''
  const maxX = x(p.maxSlopeAtM)
  const maxIdx = p.distance.findIndex((d) => d >= p.maxSlopeAtM)
  const maxElev = p.elevation[Math.max(0, maxIdx)]
  const maxY = Number.isFinite(maxElev) ? y(maxElev) : H - PAD.b

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const d = ((px - PAD.l) / (W - PAD.l - PAD.r)) * span
    setHover(Math.min(span, Math.max(0, d)))
  }
  const hi2 = hover === null ? -1 : Math.max(0, p.distance.findIndex((d) => d >= hover))
  const ticks = [lo, Math.round((lo + hi) / 2), hi]

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full touch-none"
        role="img"
        aria-label={t('profile.chartAria', { length: Math.round(p.length), max: p.maxSlopeDeg.toFixed(1) })}
        onPointerMove={move}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(tk)} y2={y(tk)} stroke="#1b2430" strokeWidth={1} />
            <text x={PAD.l - 4} y={y(tk) + 3} textAnchor="end" fontSize={10} fill="#8a97a8">{tk}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={x(span * f)} y={H - 6} textAnchor="middle" fontSize={10} fill="#8a97a8">{Math.round(span * f)} m</text>
        ))}
        {area && <path d={area} fill="#22d3ee" opacity={0.08} />}
        {segments.map((s, i) => (
          <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.c} strokeWidth={2.5} strokeLinecap="round" />
        ))}
        {p.maxSlopeDeg > 0 && (
          <g>
            <line x1={maxX} x2={maxX} y1={PAD.t} y2={H - PAD.b} stroke="#ff5a5f" strokeDasharray="3 3" strokeWidth={1} />
            <circle cx={maxX} cy={maxY} r={4} fill="#05070a" stroke="#ff5a5f" strokeWidth={2} />
          </g>
        )}
        {hover !== null && hi2 >= 0 && Number.isFinite(p.elevation[hi2]) && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#e8eef6" strokeWidth={1} opacity={0.6} />
            <circle cx={x(p.distance[hi2])} cy={y(p.elevation[hi2])} r={3.5} fill="#e8eef6" />
          </g>
        )}
      </svg>
      <p className="min-h-5 text-xs text-muted" aria-live="off">
        {hi2 >= 0 && !Number.isFinite(p.elevation[hi2])
          ? t('profile.hoverOutside')
          : hi2 >= 0
          ? t('profile.hover', {
              d: Math.round(p.distance[hi2]),
              z: p.elevation[hi2].toFixed(1),
              s: p.slopeDeg[hi2].toFixed(1),
              ll: formatLonLat(p.lonLat[hi2], 5),
            })
          : t('profile.hoverHint')}
      </p>
    </div>
  )
}

/** Elevation profile of the drawn line, with maximum slope. Honest when no local DTM is loaded. */
export default function ProfilePanel() {
  const { t } = useTranslation()
  const { dtm, status } = useDtm()
  const line = useMissionStore((s) => s.profileLine)
  const caution = useMissionStore((s) => s.params.cautionDeg)
  const nogo = useMissionStore((s) => s.params.nogoDeg)
  const clear = useMissionStore((s) => s.clearProfileLine)
  const setDrawMode = useMissionStore((s) => s.setDrawMode)
  const drawMode = useMissionStore((s) => s.drawMode)

  const profile = useMemo(() => (dtm && line.length > 1 ? profileAlong(dtm, line, 8) : null), [dtm, line])
  const hasGaps = !!profile && profile.elevation.some((e) => !Number.isFinite(e))
  const allOutside = !!profile && !Number.isFinite(profile.minElevation)

  return (
    <section aria-label={t('profile.title')} className="border-t border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="label">{t('profile.title')}</h2>
        <div className="ml-auto flex gap-2">
          <button className="btn btn-sm btn-primary" onClick={() => setDrawMode(drawMode === 'profile' ? 'none' : 'profile')} aria-pressed={drawMode === 'profile'}>
            {line.length > 1 ? t('profile.redraw') : t('profile.draw')}
          </button>
          {line.length > 0 && (
            <button className="btn btn-sm" onClick={clear}>{t('profile.clear')}</button>
          )}
        </div>
      </div>

      {status === 'missing' && (
        <p className="mt-2 rounded-lg border border-caution/50 bg-caution/10 p-2 text-sm text-caution" role="status">{t('profile.noDtm')}</p>
      )}
      {status === 'loading' && <p className="mt-2 text-sm text-muted" role="status">{t('profile.loading')}</p>}

      {status === 'ready' && !profile && <p className="mt-2 text-sm text-muted">{t('profile.empty')}</p>}

      {profile && allOutside && (
        <p className="mt-2 rounded-lg border border-caution/50 bg-caution/10 p-2 text-sm text-caution" role="status">{t('profile.outsideAll')}</p>
      )}

      {profile && !allOutside && (
        <div className="mt-2 grid gap-3 md:grid-cols-[1fr_14rem]">
          <Chart p={profile} caution={caution} nogo={nogo} />
          <dl className="grid grid-cols-2 content-start gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{t('profile.length')}</dt>
            <dd className="hud-text text-right">{Math.round(profile.length)} m</dd>
            <dt className="text-muted">{t('profile.maxSlope')}</dt>
            <dd className="hud-text text-right" style={{ color: slopeColor(profile.maxSlopeDeg, caution, nogo) }}>
              {profile.maxSlopeDeg.toFixed(1)}° <span className="text-xs text-muted">@ {Math.round(profile.maxSlopeAtM)} m</span>
            </dd>
            <dt className="text-muted">{t('profile.ascent')}</dt>
            <dd className="hud-text text-right">+{Math.round(profile.ascent)} m</dd>
            <dt className="text-muted">{t('profile.descent')}</dt>
            <dd className="hud-text text-right">−{Math.round(profile.descent)} m</dd>
            <dt className="text-muted">{t('profile.range')}</dt>
            <dd className="hud-text text-right">{profile.minElevation.toFixed(0)} … {profile.maxElevation.toFixed(0)} m</dd>
            <dd className="col-span-2 mt-1 text-xs text-muted">{t('profile.note', { caution, nogo })}</dd>
            {hasGaps && <dd className="col-span-2 text-xs text-caution">{t('profile.outside')}</dd>}
          </dl>
        </div>
      )}
    </section>
  )
}
