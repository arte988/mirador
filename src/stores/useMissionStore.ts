import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { LAYER_DEFS } from '../data/layers.ts'
import { DEFAULT_REQUIRED_IDS, type SiteId } from '../data/sites.ts'
import type { LonLat } from '../lib/crsMars.ts'
import { DEFAULT_PARAMS, type PlanningParams } from '../lib/params.ts'
import type { Polygon, RouteProfileId } from '../lib/routing.ts'
import type { RouteAnalysis, WalkBackSummary } from '../lib/walkPlan.ts'
import type { PlannedRoute } from '../lib/routing.ts'
import type { ScenarioFlags, SafetyResult } from '../lib/safety.ts'
import type { FetchResult } from '../lib/storage.ts'
import type { DonkiPayload, FeedSource } from '../lib/spaceWeather.ts'

export type DisplayMode = 'habitat' | 'tablet' | 'hud'
export type DrawMode = 'none' | 'profile' | 'nogo' | 'stop'
/** Where the safety panel gets its data: real feeds, an Earth analog site, or a simulated calm day. */
export type DataMode = 'live' | 'analog' | 'rehearsal'
export type BuddyRole = 'follow' | 'safest' | 'rover'
export type WalkStatus = 'idle' | 'walking' | 'paused' | 'done' | 'aborting'

export interface LayerState {
  id: string
  visible: boolean
  opacity: number
}

export interface RouteResult {
  route: PlannedRoute
  analysis: RouteAnalysis
  walkBack: WalkBackSummary
}

export interface AbortRoute {
  target: 'hab' | 'rover'
  path: LonLat[]
  timeS: number
  analysis: RouteAnalysis
  /** Simulation clock (s) and cumulative energy (kJ) when the abort started. */
  startElapsedS: number
  startEnergyKJ: number
}

export interface WeatherRow {
  sol: string
  terrestrial_date: string
  min_temp: string
  max_temp: string
  pressure: string
  wind_speed?: string
  wind_direction?: string
  atmo_opacity?: string
  sunrise?: string
  sunset?: string
  local_uv_irradiance_index?: string
  ls?: string
  season?: string
}

export interface WeatherFeed {
  rows: WeatherRow[]
  source: FeedSource
  fetchedAt: number
  disclaimer: string
}

export type DataState<T> = (FetchResult<T> & { loading: boolean }) | null

export interface MissionState {
  // --- UI
  displayMode: DisplayMode
  site: SiteId
  drawMode: DrawMode
  draft: LonLat[]
  selectedStopId: string | null
  panel: 'layers' | 'safety' | 'route' | 'images' | 'eva'
  sheetOpen: boolean
  // --- layers
  layers: LayerState[]
  // --- planning
  params: PlanningParams
  requiredStopIds: string[]
  noGo: Polygon[]
  profileLine: LonLat[]
  planStatus: 'idle' | 'planning' | 'ready' | 'error' | 'nodtm'
  planError: string | null
  routes: Partial<Record<RouteProfileId, RouteResult>>
  scienceStopIds: string[]
  selectedProfile: RouteProfileId
  blockedPct: number | null
  planVersion: number
  // --- safety
  dataMode: DataMode
  scenario: ScenarioFlags
  stormFlag: boolean
  weather: DataState<WeatherFeed>
  space: DataState<DonkiPayload>
  safety: SafetyResult | null
  // --- walk simulation
  walkStatus: WalkStatus
  elapsedS: number
  /** Simulation speed multiplier, 1–20. Default 4 so a 2 h EVA finishes in about 30 minutes of wall time. */ 
  simSpeed: number
  buddyRole: BuddyRole
  abortRoute: AbortRoute | null
  // --- EVA
  checklist: Record<string, boolean>
  commsAck: boolean
  scenarioTimeMs: number | null

  setDisplayMode: (m: DisplayMode) => void
  setSite: (s: SiteId) => void
  setDrawMode: (m: DrawMode) => void
  addDraftPoint: (p: LonLat) => void
  undoDraft: () => void
  clearDraft: () => void
  finishDraft: () => void
  selectStop: (id: string | null) => void
  setPanel: (p: MissionState['panel']) => void
  setSheetOpen: (b: boolean) => void
  setLayerVisible: (id: string, v: boolean) => void
  setLayerOpacity: (id: string, o: number) => void
  moveLayer: (id: string, dir: -1 | 1) => void
  resetLayers: () => void
  setParams: (p: Partial<PlanningParams>) => void
  toggleRequiredStop: (id: string) => void
  removeNoGo: (index: number) => void
  clearNoGo: () => void
  clearProfileLine: () => void
  setPlan: (r: Partial<Pick<MissionState, 'planStatus' | 'planError' | 'routes' | 'scienceStopIds' | 'blockedPct'>>) => void
  selectProfile: (p: RouteProfileId) => void
  bumpPlan: () => void
  setDataMode: (m: DataMode) => void
  setScenario: (s: Partial<ScenarioFlags>) => void
  setStormFlag: (b: boolean) => void
  setWeather: (w: DataState<WeatherFeed>) => void
  setSpace: (s: DataState<DonkiPayload>) => void
  setSafety: (s: SafetyResult) => void
  setWalk: (s: Partial<Pick<MissionState, 'walkStatus' | 'elapsedS' | 'simSpeed' | 'abortRoute'>>) => void
  setBuddyRole: (r: BuddyRole) => void
  setCheck: (id: string, v: boolean) => void
  resetChecklist: () => void
  setCommsAck: (b: boolean) => void
  setScenarioTime: (ms: number | null) => void
  hydrateShared: (s: SharedPlan) => void
}

/** Serializable subset that can travel in a URL / BroadcastChannel (handoff between devices). */
export interface SharedPlan {
  requiredStopIds: string[]
  noGo: Polygon[]
  params: PlanningParams
  selectedProfile: RouteProfileId
  stormFlag: boolean
  scenario: ScenarioFlags
  site: SiteId
}

const defaultLayers = (): LayerState[] =>
  LAYER_DEFS.map((d) => ({ id: d.id, visible: d.defaultVisible, opacity: d.defaultOpacity }))

const noScenario: ScenarioFlags = { dustStorm: false, sepAlert: false, o2Leak: false }

export const useMissionStore = create<MissionState>()(
  persist(
    (set, get) => ({
      displayMode: 'habitat',
      site: 'gale',
      drawMode: 'none',
      draft: [],
      selectedStopId: null,
      panel: 'route',
      sheetOpen: false,
      layers: defaultLayers(),
      params: DEFAULT_PARAMS,
      requiredStopIds: DEFAULT_REQUIRED_IDS,
      noGo: [],
      profileLine: [],
      planStatus: 'idle',
      planError: null,
      routes: {},
      scienceStopIds: [],
      selectedProfile: 'safest',
      blockedPct: null,
      planVersion: 0,
      dataMode: 'live',
      scenario: noScenario,
      stormFlag: false,
      weather: null,
      space: null,
      safety: null,
      walkStatus: 'idle',
      elapsedS: 0,
      simSpeed: 8,
      buddyRole: 'follow',
      abortRoute: null,
      checklist: {},
      commsAck: false,
      scenarioTimeMs: null,

      setDisplayMode: (m) => set({ displayMode: m }),
      setSite: (s) => set({ site: s }),
      setDrawMode: (m) => set({ drawMode: m, draft: [] }),
      addDraftPoint: (p) => set((s) => ({ draft: [...s.draft, p] })),
      undoDraft: () => set((s) => ({ draft: s.draft.slice(0, -1) })),
      clearDraft: () => set({ draft: [] }),
      finishDraft: () => {
        const { drawMode, draft, noGo } = get()
        if (drawMode === 'profile' && draft.length >= 2) set({ profileLine: draft, draft: [], drawMode: 'none' })
        else if (drawMode === 'nogo' && draft.length >= 3) set({ noGo: [...noGo, draft], draft: [], drawMode: 'none' })
        else set({ draft: [], drawMode: 'none' })
      },
      selectStop: (id) => set({ selectedStopId: id }),
      setPanel: (p) => set({ panel: p }),
      setSheetOpen: (b) => set({ sheetOpen: b }),
      setLayerVisible: (id, v) => set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, visible: v } : l)) })),
      setLayerOpacity: (id, o) => set((s) => ({ layers: s.layers.map((l) => (l.id === id ? { ...l, opacity: o } : l)) })),
      moveLayer: (id, dir) =>
        set((s) => {
          const i = s.layers.findIndex((l) => l.id === id)
          const j = i + dir
          if (i < 0 || j < 0 || j >= s.layers.length) return {}
          const next = [...s.layers]
          ;[next[i], next[j]] = [next[j], next[i]]
          return { layers: next }
        }),
      resetLayers: () => set({ layers: defaultLayers() }),
      setParams: (p) => set((s) => ({ params: { ...s.params, ...p } })),
      toggleRequiredStop: (id) =>
        set((s) => ({
          requiredStopIds: s.requiredStopIds.includes(id) ? s.requiredStopIds.filter((x) => x !== id) : [...s.requiredStopIds, id],
        })),
      removeNoGo: (i) => set((s) => ({ noGo: s.noGo.filter((_, k) => k !== i) })),
      clearNoGo: () => set({ noGo: [] }),
      clearProfileLine: () => set({ profileLine: [] }),
      setPlan: (r) => set(r),
      selectProfile: (p) => set({ selectedProfile: p }),
      bumpPlan: () => set((s) => ({ planVersion: s.planVersion + 1 })),
      setDataMode: (m) => set({ dataMode: m }),
      setScenario: (sc) =>
        set((s) => ({
          scenario: { ...s.scenario, ...sc },
          // The dust scenario raises the same flag the router listens to.
          stormFlag: sc.dustStorm !== undefined ? sc.dustStorm : s.stormFlag,
        })),
      setStormFlag: (b) => set((s) => ({ stormFlag: b, scenario: b ? s.scenario : { ...s.scenario, dustStorm: false } })),
      setWeather: (w) => set({ weather: w }),
      setSpace: (sp) => set({ space: sp }),
      setSafety: (sf) => set({ safety: sf }),
      setWalk: (w) => set(w),
      setBuddyRole: (r) => set({ buddyRole: r }),
      setCheck: (id, v) => set((s) => ({ checklist: { ...s.checklist, [id]: v } })),
      resetChecklist: () => set({ checklist: {}, commsAck: false }),
      setCommsAck: (b) => set({ commsAck: b }),
      setScenarioTime: (ms) => set({ scenarioTimeMs: ms }),
      hydrateShared: (sp) =>
        set({
          requiredStopIds: sp.requiredStopIds,
          noGo: sp.noGo,
          params: sp.params,
          selectedProfile: sp.selectedProfile,
          stormFlag: sp.stormFlag,
          scenario: sp.scenario,
          site: sp.site,
        }),
    }),
    {
      name: 'mirador.state',
      version: 1,
      partialize: (s) => ({
        displayMode: s.displayMode,
        site: s.site,
        layers: s.layers,
        params: s.params,
        requiredStopIds: s.requiredStopIds,
        noGo: s.noGo,
        selectedProfile: s.selectedProfile,
        buddyRole: s.buddyRole,
        dataMode: s.dataMode,
        checklist: s.checklist,
        commsAck: s.commsAck,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MissionState>
        // Keep any newly added layer definitions and drop removed ones.
        const known = new Map((p.layers ?? []).map((l) => [l.id, l]))
        const ordered = [
          ...(p.layers ?? []).filter((l) => LAYER_DEFS.some((d) => d.id === l.id)),
          ...LAYER_DEFS.filter((d) => !known.has(d.id)).map((d) => ({ id: d.id, visible: d.defaultVisible, opacity: d.defaultOpacity })),
        ]
        return { ...current, ...p, layers: ordered, params: { ...DEFAULT_PARAMS, ...(p.params ?? {}) } }
      },
    },
  ),
)
