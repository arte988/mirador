import { create } from 'zustand'
import type { AbortRoute } from '../../stores/useMissionStore.ts'

/** A proposal becomes visible only when its tool result has been delivered. */
export const useProposalVisibility = create<{ revealed: AbortRoute | null; reveal: (route: AbortRoute | null) => void }>((set) => ({ revealed: null, reveal: (revealed) => set({ revealed }) }))
