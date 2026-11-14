import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from './params.ts'
import { decodePlan, encodePlan } from './handoff.ts'
import type { SharedPlan } from '../stores/useMissionStore.ts'

const sample: SharedPlan = {
  requiredStopIds: ['ridge-a'],
  noGo: [[[137.38, -4.8], [137.39, -4.8], [137.39, -4.79], [137.38, -4.8]]],
  params: { ...DEFAULT_PARAMS, reserveMin: 45 },
  selectedProfile: 'science',
  stormFlag: true,
  scenario: { dustStorm: true, sepAlert: false, o2Leak: false },
  site: 'gale',
}

describe('handoff encode/decode', () => {
  it('round-trips a plan, including no-go polygons', () => {
    const back = decodePlan(encodePlan(sample))
    expect(back).toEqual(sample)
  })
  it('rejects garbage and fills missing fields from defaults', () => {
    expect(decodePlan('%%%')).toBeNull()
    const slim = decodePlan(encodePlan({ ...sample, params: { ...DEFAULT_PARAMS } }))
    expect(slim?.params.doseBudgetMsv).toBe(DEFAULT_PARAMS.doseBudgetMsv)
  })
})
