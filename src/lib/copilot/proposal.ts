import { create } from 'zustand'
import { useMissionStore, type AbortRoute } from '../../stores/useMissionStore.ts'

interface CopilotProposal {
  pendingAbort: AbortRoute | null
  setPendingAbort: (route: AbortRoute | null) => void
}

export const useCopilotStore = create<CopilotProposal>((set) => ({ pendingAbort: null, setPendingAbort: (pendingAbort) => set({ pendingAbort }) }))

/** A moving simulation invalidates a proposal; request a fresh one instead. */
export function confirmAbort(): boolean {
  const route = useCopilotStore.getState().pendingAbort
  const mission = useMissionStore.getState()
  if (!route || mission.elapsedS !== route.startElapsedS) {
    useCopilotStore.getState().setPendingAbort(null)
    return false
  }
  mission.setWalk({ abortRoute: route, walkStatus: 'aborting' })
  useCopilotStore.getState().setPendingAbort(null)
  return true
}

export function dismissAbort(): void {
  useCopilotStore.getState().setPendingAbort(null)
}
