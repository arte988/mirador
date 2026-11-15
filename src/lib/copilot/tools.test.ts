import { beforeEach, describe, expect, it } from 'vitest'
import { TOOL_NAMES } from '../../../api/_copilot.ts'
import { HABITAT } from '../../data/sites.ts'
import { useMissionStore, type AbortRoute } from '../../stores/useMissionStore.ts'
import { decodeDtm, type DtmMeta } from '../dtm.ts'
import { oneWayDelayMinutes } from '../commsDelay.ts'
import type { GaleForecast } from '../climateForecast.ts'
import { DEFAULT_PARAMS } from '../params.ts'
import { budgetSeconds } from '../planner.ts'
import { analyzeRoute, walkBackSummary } from '../walkPlan.ts'
import { simulate } from '../sim.ts'
import type { PlannedRoute } from '../routing.ts'
import { confirmAbort, dismissAbort, useCopilotStore } from './proposal.ts'
import { useToolLog } from './toolLog.ts'
import { executeToolCall, IMPLEMENTED_TOOL_NAMES, runCopilotTool, type CopilotContext } from './tools.ts'

const now = Date.parse('2026-11-15T12:00:00Z')
function fixture(): CopilotContext {
  const size = 20, step = 4 / 59274.6975
  const meta: DtmMeta = { id: 'test', source: 'test', credit: 'test', url: 'test', width: size, height: size, cellSizeMeters: 4, bbox: { west: HABITAT.lonLat[0] - 10 * step, east: HABITAT.lonLat[0] + 10 * step, north: HABITAT.lonLat[1] + 10 * step, south: HABITAT.lonLat[1] - 10 * step }, radiusMeters: 3396190, elevationBaseMeters: 0, elevationStepMeters: 0.1, nodata: -32768, datum: 'test' }
  const dtm = decodeDtm(meta, new Int16Array(size * size).buffer)
  const route: PlannedRoute = { profile: 'fastest', path: [HABITAT.lonLat, [HABITAT.lonLat[0] + step * 4, HABITAT.lonLat[1]]], legs: [], distanceM: 0, walkTimeS: 0, visited: [], failed: [] }
  const analysis = analyzeRoute(route, [], dtm, DEFAULT_PARAMS)
  const walkBack = walkBackSummary(analysis.timeline, budgetSeconds(DEFAULT_PARAMS), () => 40)
  const result = { route, analysis, walkBack }
  const sim = simulate({ routes: { fastest: result }, selectedProfile: 'fastest', elapsedS: 0, abortRoute: null, aborting: false, buddyRole: 'rover', params: DEFAULT_PARAMS, rover: HABITAT.lonLat })
  const abort: AbortRoute = { target: 'hab', path: route.path, timeS: analysis.walkTimeS, analysis, startElapsedS: 0, startEnergyKJ: 0 }
  return { now, simTime: now, sim, elapsedS: 0, walkStatus: 'idle', selectedProfile: 'fastest', route: result, currentBackS: 40, params: DEFAULT_PARAMS, safety: { level: 'green', reasons: [] }, weather: null, space: { data: { source: 'snapshot', fetchedAt: now - 10000, sep: [], notifications: [], marsImpacts: [] }, stale: true, savedAt: now, error: null, loading: false }, forecast: { data: null, cached: false }, dtm, computeAbort: async () => abort, saveProposal: useCopilotStore.getState().setPendingAbort }
}

beforeEach(() => { dismissAbort(); useToolLog.getState().clear() })

describe('CAPCOM tools', () => {
  it('implements exactly the declared names', () => {
    expect([...IMPLEMENTED_TOOL_NAMES].sort()).toEqual([...TOOL_NAMES].sort())
  })
  it('reports source and age or an explanatory note for every result', async () => {
    const ctx = fixture()
    for (const name of TOOL_NAMES) {
      const r = await runCopilotTool(name, {}, ctx)
      expect(r.source.length).toBeGreaterThan(0)
      if (r.ageS === null) expect(r.note).toBeTruthy()
      else expect(r.ageS).toBeGreaterThanOrEqual(0)
      if (!r.ok) expect(r.value).toBeNull()
    }
    const weather = await runCopilotTool('get_space_weather', {}, ctx)
    expect(weather.ageS).toBe(10)
    expect(weather.note).toContain('snapshot')
    expect(weather.note).toContain('stale')
  })
  it('reports missing data instead of inventing values', async () => {
    const ctx = { ...fixture(), sim: null, route: null, safety: null, space: null, dtm: null }
    for (const name of ['get_status', 'get_safety', 'can_continue', 'propose_abort', 'get_space_weather', 'get_forecast', 'light_check', 'los_check'] as const) {
      const result = await runCopilotTool(name, {}, ctx)
      expect(result).toMatchObject({ ok: false, value: null, ageS: null })
      expect(result.source).toBeTruthy()
      expect(result.note).toBeTruthy()
    }
  })
  it('uses planner analysis and walk-back calculations', async () => {
    const ctx = fixture()
    const result = await runCopilotTool('can_continue', {}, ctx)
    expect(result.value).toMatchObject({ currentMarginS: budgetSeconds(ctx.params) - 40, walkBack: ctx.route!.walkBack, totalTimeS: ctx.route!.analysis.totalTimeS, endConsumables: ctx.route!.analysis.fractionsAtEnd })
  })
  it('uses the existing light-time model', async () => {
    expect((await runCopilotTool('comms_delay', {}, fixture())).value).toEqual({ oneWayMinutes: oneWayDelayMinutes(new Date(now)) })
  })
  it('reports forecast age and cached status for a published prediction', async () => {
    const series = { unit: 'C', status: 'prediction' as const, q10: [-60], q50: [-50], q90: [-40], mae_timesfm: 1, mae_persistence: 2, mae_climatology: 3, reason: '' }
    const data: GaleForecast = { schema: 1, zone_id: 'gale', generated_at_utc: '2026-11-14T12:00:00Z', step: 'sol', horizon_steps: 1, model: 'TimesFM', license: '', data_kind: 'prediction', shared_point: '', last_measured: { kind: 'measured', sol: 1, t_air_c: -40, pressure_pa: 750, note: '' }, series: { t_air: series, pressure: series }, tau_dust: { status: 'unavailable', reason: '' }, warnings: [] }
    const result = await runCopilotTool('get_forecast', {}, { ...fixture(), forecast: { data, cached: true } })
    expect(result).toMatchObject({ ok: true, ageS: 86400, value: data })
    expect(result.note).toContain('Cached')
  })
  it('only starts an abort after confirmation', async () => {
    const ctx = fixture()
    useMissionStore.getState().setWalk({ elapsedS: 0, walkStatus: 'paused', abortRoute: null })
    expect((await runCopilotTool('propose_abort', {}, ctx)).ok).toBe(true)
    expect(useCopilotStore.getState().pendingAbort).not.toBeNull()
    expect(useMissionStore.getState().walkStatus).toBe('paused')
    expect(confirmAbort()).toBe(true)
    expect(useMissionStore.getState().walkStatus).toBe('aborting')
    useMissionStore.getState().setWalk({ walkStatus: 'idle', abortRoute: null })
  })
  it('rejects a proposal after the simulation clock advances', async () => {
    const ctx = fixture()
    await runCopilotTool('propose_abort', {}, ctx)
    useMissionStore.getState().setWalk({ elapsedS: 1, walkStatus: 'paused' })
    expect(confirmAbort()).toBe(false)
    expect(useMissionStore.getState().walkStatus).toBe('paused')
    useMissionStore.getState().setWalk({ elapsedS: 0, walkStatus: 'idle' })
  })
  it('logs failures and keeps only the newest 50 calls', async () => {
    const ctx = fixture()
    for (let i = 0; i < 51; i++) await executeToolCall({ id: String(i), name: 'comms_delay', args: {} }, ctx)
    await executeToolCall({ id: 'bad', name: 'propose_abort' }, { ...ctx, computeAbort: async () => { throw new Error('private') } })
    const entries = useToolLog.getState().entries
    expect(entries).toHaveLength(50)
    expect(entries[0].id).toBe('2')
    expect(entries.at(-1)?.result).toMatchObject({ ok: false, value: null, note: 'tool error' })
  })
})
