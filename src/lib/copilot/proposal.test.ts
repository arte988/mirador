import { afterEach, describe, expect, it } from 'vitest'
import { useMissionStore, type AbortRoute } from '../../stores/useMissionStore.ts'
import { confirmAbort, dismissAbort, useCopilotStore } from './proposal.ts'

const proposal = { target: 'hab', path: [[0, 0], [1, 1]], timeS: 10, startElapsedS: 10, startEnergyKJ: 0, analysis: {} } as AbortRoute
const setProposal = () => useCopilotStore.getState().setPendingAbort(proposal)
afterEach(() => { dismissAbort(); useMissionStore.getState().setWalk({ elapsedS: 0, walkStatus: 'idle', abortRoute: null }) })

describe('proposal confirmation controls', () => {
  it('starts the proposed route only after confirmation', () => {
    useMissionStore.getState().setWalk({ elapsedS: 10, walkStatus: 'paused', abortRoute: null }); setProposal()
    expect(useMissionStore.getState().walkStatus).toBe('paused')
    expect(confirmAbort()).toBe(true)
    expect(useMissionStore.getState()).toMatchObject({ walkStatus: 'aborting', abortRoute: proposal })
    expect(useCopilotStore.getState().pendingAbort).toBeNull()
  })
  it('dismisses without starting and rejects a stale proposal', () => {
    useMissionStore.getState().setWalk({ elapsedS: 10, walkStatus: 'paused', abortRoute: null }); setProposal(); dismissAbort()
    expect(useMissionStore.getState().walkStatus).toBe('paused'); expect(useCopilotStore.getState().pendingAbort).toBeNull()
    setProposal(); useMissionStore.getState().setWalk({ elapsedS: 11 })
    expect(confirmAbort()).toBe(false); expect(useMissionStore.getState().walkStatus).toBe('paused')
    expect(useCopilotStore.getState().pendingAbort).toBeNull()
  })
})
