import { useMemo } from 'react'
import { SUPPORT_ROVER } from '../data/sites.ts'
import { useMissionStore } from '../stores/useMissionStore.ts'
import { useEffectiveParams } from './scenarioPlan.ts'
import { simulate, type SimView } from './sim.ts'

/** Current simulated EVA state (position, consumables, next waypoint). Null before a plan exists. */
export function useSimView(): SimView | null {
  const routes = useMissionStore((s) => s.routes)
  const selectedProfile = useMissionStore((s) => s.selectedProfile)
  const elapsedS = useMissionStore((s) => s.elapsedS)
  const abortRoute = useMissionStore((s) => s.abortRoute)
  const walkStatus = useMissionStore((s) => s.walkStatus)
  const buddyRole = useMissionStore((s) => s.buddyRole)
  const params = useEffectiveParams()
  return useMemo(
    () =>
      simulate({
        routes,
        selectedProfile,
        elapsedS,
        abortRoute,
        aborting: walkStatus === 'aborting',
        buddyRole,
        params,
        rover: SUPPORT_ROVER.lonLat,
      }),
    [routes, selectedProfile, elapsedS, abortRoute, walkStatus, buddyRole, params],
  )
}
