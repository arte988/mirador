/**
 * Glue between the UI, the routing worker and the stores. Keeps heavy work in the worker and stores
 * the results (three route profiles, walk-back fields) for the map, the cards and the walk simulation.
 */
import { HABITAT, SCIENCE_STOPS, SUPPORT_ROVER } from '../data/sites.ts'
import { useMissionStore, type RouteResult } from '../stores/useMissionStore.ts'
import { backTimeAt, usePlanData } from '../stores/usePlanData.ts'
import { ensureDtm } from './dtmStore.ts'
import { router } from './routerClient.ts'
import type { RouteProfileId } from './routing.ts'
import { effectiveParams } from './scenarioPlan.ts'
import { analyzeRoute, walkBackSummary } from './walkPlan.ts'

/** Seconds the suit can be used before the safety reserve is touched. */
export const budgetSeconds = (p: { suitCapacityHours: number; reserveMin: number }) => Math.max(0, p.suitCapacityHours * 3600 - p.reserveMin * 60)

let running = 0

export async function runPlan(): Promise<void> {
  const ticket = ++running
  const st = useMissionStore.getState()
  const dtm = await ensureDtm()
  if (!dtm) {
    st.setPlan({ planStatus: 'nodtm', routes: {}, planError: null })
    return
  }
  st.setPlan({ planStatus: 'planning', planError: null })
  const required = SCIENCE_STOPS.filter((s) => st.requiredStopIds.includes(s.id))
  const optional = SCIENCE_STOPS.filter((s) => !st.requiredStopIds.includes(s.id))
  const params = effectiveParams(st.params, st.scenario)
  const budgetS = budgetSeconds(params)
  try {
    const res = await router.plan({ params, noGo: st.noGo, habitat: HABITAT, rover: SUPPORT_ROVER, required, optional, budgetS })
    if (ticket !== running) return // a newer request superseded this one
    usePlanData.getState().set({ grid: res.grid, out: res.out, back: res.back, roverBack: res.roverBack, envelopeBudgetS: budgetS })
    const stopsById = [...required, ...optional]
    const routes: Partial<Record<RouteProfileId, RouteResult>> = {}
    for (const id of ['safest', 'fastest', 'science'] as RouteProfileId[]) {
      const route = res.routes[id]
      if (route.path.length < 2) continue
      const analysis = analyzeRoute(route, stopsById, dtm, params)
      const walkBack = walkBackSummary(analysis.timeline, budgetS, (p) => backTimeAt(p, res.back, res.grid))
      routes[id] = { route, analysis, walkBack }
    }
    useMissionStore.getState().setPlan({
      planStatus: 'ready',
      routes,
      scienceStopIds: res.scienceStopIds,
      blockedPct: res.blockedPct,
    })
  } catch (err) {
    if (ticket !== running) return
    const msg = err instanceof Error ? err.message : String(err)
    useMissionStore.getState().setPlan({ planStatus: msg.includes('No local DTM') ? 'nodtm' : 'error', planError: msg, routes: {} })
  }
}
