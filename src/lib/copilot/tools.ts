import type { CopilotToolName } from '../../../api/_copilot.ts'
import { HABITAT, SUPPORT_ROVER } from '../../data/sites.ts'
import { useMissionStore, type AbortRoute, type DataState, type RouteResult, type WalkStatus, type WeatherFeed } from '../../stores/useMissionStore.ts'
import { backTimeAt, usePlanData } from '../../stores/usePlanData.ts'
import { computeAbortRoute } from '../abortNow.ts'
import { loadForecast } from '../climateLoad.ts'
import { forecastAgeHours, forecastIsStale, type GaleForecast } from '../climateForecast.ts'
import { oneWayDelayMinutes } from '../commsDelay.ts'
import { getDtm } from '../dtmStore.ts'
import { lineOfSight } from '../los.ts'
import type { PlanningParams } from '../params.ts'
import { budgetSeconds } from '../planner.ts'
import { buildCostGrid, lonLatToCellIdx } from '../routing.ts'
import type { SafetyResult } from '../safety.ts'
import { effectiveParams } from '../scenarioPlan.ts'
import { simulate, type SimView } from '../sim.ts'
import { sunPosition, usefulWindow } from '../solar.ts'
import { summarizeDonki, type DonkiPayload } from '../spaceWeather.ts'
import type { Dtm } from '../dtm.ts'
import { useCopilotStore } from './proposal.ts'
import { useToolLog } from './toolLog.ts'

export type ToolResult<T = unknown> = { ok: boolean; value: T | null; source: string; ageS: number | null; note?: string }
export interface CopilotContext {
  now: number
  simTime: number
  sim: SimView | null
  elapsedS: number
  walkStatus: WalkStatus
  selectedProfile: string
  route: RouteResult | null
  currentBackS: number | null
  params: PlanningParams
  safety: SafetyResult | null
  weather: DataState<WeatherFeed>
  space: DataState<DonkiPayload>
  forecast: { data: GaleForecast | null; cached: boolean }
  dtm: Dtm | null
  computeAbort: () => Promise<AbortRoute | null>
  saveProposal: (route: AbortRoute | null) => void
}

const sources = {
  route: 'MIRADOR route simulation and planning assumptions',
  safety: 'MIRADOR safety rules (src/lib/safety.ts), weather and space weather feeds',
  space: 'NASA DONKI WSA-ENLIL model estimate and space weather events',
  forecast: 'TimesFM zero-shot forecast on the MSL REMS series',
  comms: 'JPL SSD Keplerian elements (approximate)',
  light: 'Mars24 solar geometry (Allison & McEwen)',
  los: 'USGS local 4 m DTM and MIRADOR line-of-sight model',
}
const fail = (source: string, note: string): ToolResult => ({ ok: false, value: null, source, ageS: null, note })
const success = <T>(value: T, source: string, ageS: number | null = 0, note?: string): ToolResult<T> => ({ ok: true, value, source, ageS, ...(note ? { note } : {}) })
const age = (timestamp: number, now: number): number | null => Number.isFinite(timestamp) ? Math.max(0, (now - timestamp) / 1000) : null
const feedNote = (state: DataState<{ source: string }>): string | undefined => {
  if (!state?.data) return undefined
  const labels = [state.data.source !== 'live' ? state.data.source : '', state.stale ? 'stale cached copy' : ''].filter(Boolean)
  return labels.length ? `Data source: ${labels.join(', ')}.` : undefined
}

type Handler = (ctx: CopilotContext) => Promise<ToolResult> | ToolResult
const handlers: Record<CopilotToolName, Handler> = {
  get_status: (c) => c.sim ? success({ position: c.sim.position, elapsedS: c.elapsedS, oxygenFraction: c.sim.o2, batteryFraction: c.sim.battery, secondsLeft: c.sim.secondsLeft, walkStatus: c.walkStatus, selectedProfile: c.selectedProfile }, sources.route, 0, 'Simulated, not telemetry.') : fail(sources.route, 'no route planned yet'),
  get_safety: (c) => {
    if (!c.safety) return fail(sources.safety, 'safety result not loaded')
    const times = [c.weather?.data?.fetchedAt, c.space?.data?.fetchedAt]
    const ages = times.map((t) => typeof t === 'number' ? age(t, c.now) : null)
    const notes = [feedNote(c.weather), feedNote(c.space), 'Feed ages are since fetch, not observation; safety evaluation time is not recorded.'].filter(Boolean).join(' ')
    return success(c.safety, sources.safety, ages.every((a) => a !== null) ? Math.max(...ages as number[]) : null, notes)
  },
  can_continue: (c) => {
    if (!c.route || !c.sim) return fail(sources.route, 'no route planned yet')
    if (c.currentBackS === null || !Number.isFinite(c.currentBackS) || !Number.isFinite(c.route.walkBack.minMarginS)) return fail(sources.route, 'walk-back field unavailable')
    const budgetS = budgetSeconds(c.params)
    return success({ currentMarginS: budgetS - c.elapsedS - c.currentBackS, walkBack: c.route.walkBack, nextStop: { kind: c.sim.nextKind, name: c.sim.nextName, distanceM: c.sim.nextDistanceM }, totalTimeS: c.route.analysis.totalTimeS, fitsTimeBudget: c.route.analysis.totalTimeS <= budgetS, endConsumables: c.route.analysis.fractionsAtEnd }, sources.route, 0, 'Time budget includes reserve; consumables are separate modeled estimates, not telemetry.')
  },
  propose_abort: async (c) => {
    c.saveProposal(null)
    if (!c.sim || !c.route) return fail(sources.route, 'no route planned yet')
    if (!c.dtm) return fail(sources.route, 'no local DTM loaded')
    const route = await c.computeAbort()
    if (!route) return fail(sources.route, 'no abort route available')
    c.saveProposal(route)
    return success({ target: route.target === 'hab' ? HABITAT.name : SUPPORT_ROVER.name, timeS: route.timeS, distanceM: route.analysis.profile.length, fitsRemainingTimeBudget: c.elapsedS + route.timeS <= budgetSeconds(c.params) }, sources.route, 0, 'Proposal only; requires user confirmation. Budget check is time only.')
  },
  get_space_weather: (c) => {
    if (!c.space?.data) return fail(sources.space, 'DONKI feed not loaded')
    const data = c.space.data
    const a = age(data.fetchedAt, c.now)
    const note = [feedNote(c.space), a === null ? 'Fetch time unknown.' : '', 'Model estimates are not surface radiation measurements.'].filter(Boolean).join(' ')
    const source = data.source === 'simulated' ? 'MIRADOR simulated space weather' : sources.space
    return success(summarizeDonki(data, c.now), source, a, note)
  },
  get_forecast: (c) => {
    const f = c.forecast.data
    if (!f || f.data_kind !== 'prediction') return fail(sources.forecast, 'no forecast published')
    const hours = forecastAgeHours(f, c.now)
    const notes = [c.forecast.cached ? 'Cached forecast.' : '', forecastIsStale(f, c.now) ? 'Stale forecast.' : '', hours === null ? 'Generation time unknown.' : '', ...f.warnings].filter(Boolean).join(' ')
    return success(f, sources.forecast, hours === null ? null : Math.max(0, hours * 3600), notes || undefined)
  },
  comms_delay: (c) => success({ oneWayMinutes: oneWayDelayMinutes(new Date(c.now)) }, sources.comms),
  light_check: (c) => {
    if (!c.sim) return fail(sources.light, 'no simulated position; no route planned yet')
    const [lon, lat] = c.sim.position
    const date = new Date(c.simTime)
    return success({ sun: sunPosition(date, lon, lat), usefulWindow: usefulWindow(date, lat, c.params.minSunElevationDeg), minElevationDeg: c.params.minSunElevationDeg }, sources.light, 0, 'Computed for scenario time and simulated position; window is local true solar time.')
  },
  los_check: (c) => {
    if (!c.sim) return fail(sources.los, 'no simulated position; no route planned yet')
    if (!c.dtm) return fail(sources.los, 'no local DTM loaded')
    const g = buildCostGrid(c.dtm)
    const a = lonLatToCellIdx(g, ...HABITAT.lonLat), b = lonLatToCellIdx(g, ...c.sim.position)
    if (a < 0 || b < 0 || !Number.isFinite(g.z[a]) || !Number.isFinite(g.z[b])) return fail(sources.los, 'position outside DTM coverage')
    const visible = lineOfSight(g, a, b)
    if (visible && !lineOfSight({ ...g, z: Float32Array.from(g.z, (z) => Number.isNaN(z) ? Infinity : z) }, a, b)) return fail(sources.los, 'terrain data missing along line of sight')
    return success({ visible }, sources.los, 0, 'Terrain model with assumed antenna and eye heights; not a radio measurement.')
  },
}
export const IMPLEMENTED_TOOL_NAMES = Object.keys(handlers) as CopilotToolName[]

export async function runCopilotTool(name: CopilotToolName, _args: unknown, ctx: CopilotContext): Promise<ToolResult> {
  const handler = handlers[name]
  return handler ? handler(ctx) : fail('MIRADOR copilot', 'unknown tool')
}

export async function liveCopilotContext(): Promise<CopilotContext> {
  const st = useMissionStore.getState()
  const now = Date.now()
  const params = effectiveParams(st.params, st.scenario)
  const sim = simulate({ routes: st.routes, selectedProfile: st.selectedProfile, elapsedS: st.elapsedS, abortRoute: st.abortRoute, aborting: st.walkStatus === 'aborting', buddyRole: st.buddyRole, params, rover: SUPPORT_ROVER.lonLat })
  const plan = usePlanData.getState()
  const back = sim ? backTimeAt(sim.position, plan.back, plan.grid) : Infinity
  return { now, simTime: st.scenarioTimeMs === null ? now : st.scenarioTimeMs + st.elapsedS * 1000, sim, elapsedS: st.elapsedS, walkStatus: st.walkStatus, selectedProfile: st.selectedProfile, route: st.routes[st.selectedProfile] ?? null, currentBackS: Number.isFinite(back) ? back : null, params, safety: st.safety, weather: st.weather, space: st.space, forecast: await loadForecast(), dtm: getDtm(), computeAbort: computeAbortRoute, saveProposal: useCopilotStore.getState().setPendingAbort }
}

export async function executeToolCall(call: { id: string; name: string; args?: unknown }, context?: CopilotContext): Promise<ToolResult> {
  let result: ToolResult
  try {
    const ctx = context ?? await liveCopilotContext()
    result = await runCopilotTool(call.name as CopilotToolName, call.args, ctx)
  } catch {
    result = fail('MIRADOR copilot', 'tool error')
  }
  useToolLog.getState().add({ id: call.id, at: Date.now(), name: call.name, args: call.args, result })
  return result
}
