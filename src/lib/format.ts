/** "2 h 05 min" style duration. Infinity or NaN renders as an em dash. */
export function fmtDuration(totalS: number): string {
  if (!Number.isFinite(totalS)) return '—'
  const sign = totalS < 0 ? '−' : ''
  const m = Math.round(Math.abs(totalS) / 60)
  const h = Math.floor(m / 60)
  const mm = m % 60
  return h > 0 ? `${sign}${h} h ${String(mm).padStart(2, '0')} min` : `${sign}${mm} min`
}

export function fmtKm(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

export const pct = (f: number) => `${Math.round(f * 100)}%`
