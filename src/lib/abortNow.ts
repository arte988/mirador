/**
 * Compute a fastest abort path from the current simulated position to the nearest of habitat or rover.
 */
import { HABITAT, SCIENCE_STOPS, SUPPORT_ROVER } from '../data/sites.ts'
import { useMissionStore, type AbortRoute } from '../stores/useMissionStore.ts'
import { ensureDtm } from './dtmStore.ts'
import { router } from './routerClient.ts'
import { effectiveParams } from './scenarioPlan.ts'
import { simulate } from './sim.ts'
import { analyzeRoute } from './walkPlan.ts'
import type { PlannedRoute } from './routing.ts'

export async function computeAbortRoute(): Promise<AbortRoute | null> {
  const st = useMissionStore.getState()
  const sim = simulate({
    routes: st.routes,
    selectedProfile: st.selectedProfile,
    elapsedS: st.elapsedS,
    abortRoute: st.abortRoute,
    aborting: st.walkStatus === 'aborting',
    buddyRole: st.buddyRole,
    params: effectiveParams(st.params, st.scenario),
    rover: SUPPORT_ROVER.lonLat,
  })
  if (!sim) return null
  const dtm = await ensureDtm()
  if (!dtm) return null
  const params = effectiveParams(st.params, st.scenario)
  const res = await router.abort({ params, noGo: st.noGo, habitat: HABITAT, rover: SUPPORT_ROVER, from: sim.position })
  if (!res.target || res.path.length < 2) return null
  const route: PlannedRoute = { profile: 'fastest', path: res.path, legs: [], distanceM: 0, walkTimeS: res.timeS, visited: [], failed: [] }
  const analysis = analyzeRoute(route, SCIENCE_STOPS, dtm, params)
  return {
    target: res.target,
    path: res.path,
    timeS: res.timeS,
    analysis,
    startElapsedS: st.elapsedS,
    startEnergyKJ: sim.energyKJ,
  }
}

export async function abortNow(): Promise<void> {
  const abortRoute = await computeAbortRoute()
  if (abortRoute) useMissionStore.getState().setWalk({ abortRoute, walkStatus: 'aborting' })
}
