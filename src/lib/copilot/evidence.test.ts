import { describe, expect, it } from 'vitest'
import { ageParts, associateEvidence, type EvidenceLine } from './evidence.ts'
import type { ToolLogEntry } from './toolLog.ts'

const entry = (id: string, ok = true): ToolLogEntry => ({ id, name: 'get_safety', args: {}, at: 1, result: { ok, value: ok ? 'example' : null, source: 'fixture', ageS: ok ? 12 : null, ...(!ok ? { note: 'unavailable' } : {}) } })

describe('CAPCOM answer evidence', () => {
  it('attaches pending calls to the next answer, preserving them across partial updates and later turns', () => {
    const lines: EvidenceLine[] = []
    const user = associateEvidence(lines, { role: 'user', text: 'status', final: true }, [entry('1')], 'u')
    expect(user.lines[0].evidence).toEqual([])
    const first = associateEvidence(user.lines, { role: 'capcom', text: 'A', final: false }, user.pending, 'a')
    expect(first.lines[1].evidence).toEqual([entry('1')]); expect(first.pending).toEqual([])
    const final = associateEvidence(first.lines, { role: 'capcom', text: 'Answer', final: true }, [], 'unused')
    const second = associateEvidence(final.lines, { role: 'capcom', text: 'No data', final: true }, [entry('2', false)], 'b')
    expect(second.lines[1].evidence).toEqual([entry('1')])
    expect(second.lines[2].evidence).toEqual([entry('2', false)])
  })
  it('formats known ages without inventing unknown values', () => {
    expect(ageParts(12)).toEqual({ value: 12, unit: 'seconds' })
    expect(ageParts(180)).toEqual({ value: 3, unit: 'minutes' })
    expect(ageParts(7200)).toEqual({ value: 2, unit: 'hours' })
    expect(ageParts(null)).toBeNull()
    expect(ageParts(NaN)).toBeNull()
  })
})
