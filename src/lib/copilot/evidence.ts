import type { ToolLogEntry } from './toolLog.ts'
import type { Transcript } from './liveClient.ts'

export interface EvidenceLine extends Transcript { id: string; evidence: ToolLogEntry[] }

/** Consume evidence once, when the first transcript fragment for an answer arrives. */
export function associateEvidence(lines: EvidenceLine[], transcript: Transcript, pending: ToolLogEntry[], id: string): { lines: EvidenceLine[]; pending: ToolLogEntry[] } {
  const next = [...lines]
  const index = next.findIndex((line) => line.role === transcript.role && !line.final)
  if (index >= 0) next[index] = { ...next[index], ...transcript, evidence: transcript.role === 'capcom' ? [...next[index].evidence, ...pending] : next[index].evidence }
  else next.push({ ...transcript, id, evidence: transcript.role === 'capcom' ? [...pending] : [] })
  return { lines: next, pending: transcript.role === 'capcom' ? [] : pending }
}

export function ageParts(ageS: number | null): { value: number; unit: 'seconds' | 'minutes' | 'hours' | 'days' } | null {
  if (ageS === null || !Number.isFinite(ageS) || ageS < 0) return null
  if (ageS < 60) return { value: Math.floor(ageS), unit: 'seconds' }
  if (ageS < 3600) return { value: Math.floor(ageS / 60), unit: 'minutes' }
  if (ageS < 86400) return { value: Math.floor(ageS / 3600), unit: 'hours' }
  return { value: Math.floor(ageS / 86400), unit: 'days' }
}
