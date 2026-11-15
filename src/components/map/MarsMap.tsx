import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Feature from 'ol/Feature'
import OlMap from 'ol/Map'
import { LineString, Point, Polygon as OlPolygon } from 'ol/geom'
import ImageLayer from 'ol/layer/Image'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import ImageStatic from 'ol/source/ImageStatic'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import type BaseLayer from 'ol/layer/Base'
import { defaults as defaultControls } from 'ol/control/defaults'
import { defaults as defaultInteractions } from 'ol/interaction/defaults'
import { LAYER_DEFS, type LayerDef } from '../../data/layers.ts'
import { HABITAT, SCIENCE_STOPS, SITES, SUPPORT_ROVER } from '../../data/sites.ts'
import { formatLonLat, type LonLat } from '../../lib/crsMars.ts'
import { DRAW_CLICK_GAP_MS, DRAW_CLICK_MIN_PX, drawClickDecision } from '../../lib/drawClick.ts'
import { getDtm, getSlope, useDtm } from '../../lib/dtmStore.ts'
import { sampleElevation } from '../../lib/dtm.ts'
import { router } from '../../lib/routerClient.ts'
import { sunPosition } from '../../lib/solar.ts'
import { useSimView } from '../../lib/useSim.ts'
import { loadWmtsConfig, tileGridFor, tileUrl } from '../../lib/wmts.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'
import { useCopilotStore } from '../../lib/copilot/proposal.ts'
import { usePlanData } from '../../stores/usePlanData.ts'
import { commsOverlay, envelopeOverlay, hillshadeOverlay, slopeOverlay, type OverlayImage } from './overlays.ts'
import { createMarsView, marsProjection } from './olSetup.ts'
import { mapCenter, registerMap } from './mapBus.ts'
import MapStatus from './MapStatus.tsx'
import { geologyTileGrid, geologyTileUrl } from '../../lib/geologyGrid.ts'
import {
  abortStyle,
  buddyStyle,
  draftLineStyle,
  draftPointStyle,
  habitatStyle,
  noGoStyle,
  pnrStyle,
  proposedAbortStyle,
  profileLineStyle,
  roverStyle,
  routeStyle,
  stopStyle,
  walkerStyle,
} from './vectorStyles.ts'

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function geologyLayer(): TileLayer<XYZ> {
  const source = new XYZ({
    projection: marsProjection,
    // Grid and URL scheme come from the service's tileInfo (see lib/geologyGrid.ts); no warping is applied.
    tileGrid: geologyTileGrid(),
    tileUrlFunction: ([z, x, y]) => geologyTileUrl(z, x, y),
    crossOrigin: 'anonymous',
    attributions: ['USGS Astrogeology / Tanaka et al. 2014, SIM 3292 (1:20,000,000, regional only)'],
    wrapX: false,
  })
  return new TileLayer({ source })
}

async function trekLayer(def: LayerDef): Promise<TileLayer<XYZ>> {
  const cfg = await loadWmtsConfig(def.trek!)
  const source = new XYZ({
    projection: marsProjection,
    tileGrid: tileGridFor(cfg),
    tileUrlFunction: ([z, x, y]) => tileUrl(cfg, z, x, y),
    crossOrigin: 'anonymous',
    attributions: [def.kind === 'thermal' ? 'NASA/JPL-Caltech/ASU · Mars Trek' : 'NASA/JPL-Caltech · Mars Trek'],
    wrapX: false,
  })
  return new TileLayer({ source, extent: [cfg.bbox.west, cfg.bbox.south, cfg.bbox.east, cfg.bbox.north] })
}

export default function MarsMap() {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<OlMap | null>(null)
  const layerMap = useRef(new Map<string, BaseLayer>())
  const vectorSource = useRef(new VectorSource())
  const [ready, setReady] = useState(false)
  const [cursor, setCursor] = useState<{ ll: LonLat; z: number | null } | null>(null)
  const [resolution, setResolution] = useState(0.0001)
  const [center, setCenter] = useState<LonLat>(SITES.gale.center)
  const { dtm } = useDtm()

  const layers = useMissionStore((s) => s.layers)
  const params = useMissionStore((s) => s.params)
  const routes = useMissionStore((s) => s.routes)
  const selectedProfile = useMissionStore((s) => s.selectedProfile)
  const noGo = useMissionStore((s) => s.noGo)
  const draft = useMissionStore((s) => s.draft)
  const drawMode = useMissionStore((s) => s.drawMode)
  const profileLine = useMissionStore((s) => s.profileLine)
  const requiredStopIds = useMissionStore((s) => s.requiredStopIds)
  const scienceStopIds = useMissionStore((s) => s.scienceStopIds)
  const selectedStopId = useMissionStore((s) => s.selectedStopId)
  const abortRoute = useMissionStore((s) => s.abortRoute)
  const proposedAbort = useCopilotStore((s) => s.pendingAbort)
  const walkStatus = useMissionStore((s) => s.walkStatus)
  const scenarioTimeMs = useMissionStore((s) => s.scenarioTimeMs)
  const plan = usePlanData()
  const sim = useSimView()

  // ---- Map creation -------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!hostRef.current) return
    const vLayer = new VectorLayer({ source: vectorSource.current, zIndex: 1000, updateWhileInteracting: true })
    const map = new OlMap({
      target: hostRef.current,
      view: createMarsView(SITES.gale.center, 14),
      controls: defaultControls({ rotate: false, attributionOptions: { collapsible: true, collapsed: true } }),
      interactions: defaultInteractions({ altShiftDragRotate: false, pinchRotate: false }),
      layers: [vLayer],
    })
    mapRef.current = map
    registerMap(map)
    map.on('pointermove', (e) => {
      const ll: LonLat = [e.coordinate[0], e.coordinate[1]]
      const d = getDtm()
      setCursor({ ll, z: d ? sampleElevation(d, ll[0], ll[1]) : null })
    })
    map.getView().on('change:resolution', () => setResolution(map.getView().getResolution() ?? 0.0001))
    map.on('moveend', () => {
      const c = map.getView().getCenter()
      if (c) setCenter([c[0], c[1]])
      setResolution(map.getView().getResolution() ?? 0.0001)
    })
    let lastDrawAt = 0
    let drawTimer = 0
    let pendingPoint: LonLat | null = null
    const clearPendingPoint = () => {
      window.clearTimeout(drawTimer)
      drawTimer = 0
      pendingPoint = null
    }
    map.on('dblclick', (e) => {
      const st = useMissionStore.getState()
      if (st.drawMode === 'none') return
      e.preventDefault()
      clearPendingPoint()
      const min = st.drawMode === 'nogo' ? 3 : 2
      if (st.draft.length >= min) st.finishDraft()
    })
    map.on('click', (e) => {
      const st = useMissionStore.getState()
      const ll: LonLat = [e.coordinate[0], e.coordinate[1]]
      if (st.drawMode !== 'none') {
        const detail = (e.originalEvent as MouseEvent | undefined)?.detail ?? 1
        const now = performance.now()
        const px = map.getPixelFromCoordinate(e.coordinate)
        const prev = pendingPoint ?? st.draft[st.draft.length - 1]
        const prevPx = prev ? map.getPixelFromCoordinate(prev) : null
        const pixel: [number, number] | null = px ? [px[0], px[1]] : null
        const previousPixel: [number, number] | null = prevPx ? [prevPx[0], prevPx[1]] : null
        const decision = drawClickDecision({ detail, now, lastClickAt: lastDrawAt, pixel, previousPixel })
        if (decision === 'ignore') {
          const near = pixel && previousPixel && Math.hypot(pixel[0] - previousPixel[0], pixel[1] - previousPixel[1]) < DRAW_CLICK_MIN_PX
          if (detail > 1 || near) clearPendingPoint()
          lastDrawAt = now
          return
        }
        clearPendingPoint()
        lastDrawAt = now
        pendingPoint = ll
        drawTimer = window.setTimeout(() => {
          pendingPoint = null
          drawTimer = 0
          if (useMissionStore.getState().drawMode === 'none') return
          useMissionStore.getState().addDraftPoint(ll)
        }, DRAW_CLICK_GAP_MS)
        return
      }
      // Select a stop when clicking close to it (pixel tolerance).
      const px = map.getPixelFromCoordinate(e.coordinate)
      let best: { id: string; d: number } | null = null
      for (const s of SCIENCE_STOPS) {
        const sp = map.getPixelFromCoordinate(s.lonLat)
        if (!sp) continue
        const d = Math.hypot(sp[0] - px[0], sp[1] - px[1])
        if (d < 22 && (!best || d < best.d)) best = { id: s.id, d }
      }
      st.selectStop(best ? best.id : null)
    })
    setReady(true)
    return () => {
      clearPendingPoint()
      registerMap(null)
      map.setTarget(undefined)
      mapRef.current = null
    }
  }, [])

  // Disable double-click zoom while drawing so quick vertex taps do not zoom the map.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getInteractions().forEach((i) => {
      if (i.constructor.name === 'DoubleClickZoom') i.setActive(drawMode === 'none')
    })
  }, [drawMode, ready])

  // ---- Layer stack ------------------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let cancelled = false
    layers.forEach((ls, index) => {
      const def = LAYER_DEFS.find((d) => d.id === ls.id)
      if (!def) return
      const apply = (layer: BaseLayer) => {
        layer.setZIndex(index)
        layer.setVisible(ls.visible)
        layer.setOpacity(ls.opacity)
      }
      const existing = layerMap.current.get(def.id)
      if (existing) {
        apply(existing)
        return
      }
      if (def.source === 'dtm') return // created by the overlay effect below
      if (!ls.visible) return // lazy: do not hit the network for hidden layers
      layerMap.current.set(def.id, new TileLayer()) // placeholder to avoid double creation
      const make = def.source === 'arcgis' ? Promise.resolve(geologyLayer()) : trekLayer(def)
      void make.then((layer) => {
        if (cancelled) return
        layerMap.current.set(def.id, layer)
        map.addLayer(layer)
        const st = useMissionStore.getState().layers
        const idx = st.findIndex((l) => l.id === def.id)
        const cur = st[idx]
        layer.setZIndex(idx)
        layer.setVisible(cur?.visible ?? true)
        layer.setOpacity(cur?.opacity ?? 1)
      })
    })
    return () => {
      cancelled = true
    }
  }, [layers, ready])

  // ---- DTM overlays ----------------------------------------------------------------------------------------
  const setImageLayer = (id: string, img: OverlayImage | null, opts: { interpolate: boolean; className?: string }) => {
    const map = mapRef.current
    if (!map) return
    const state = useMissionStore.getState().layers
    const idx = state.findIndex((l) => l.id === id)
    const ls = state[idx]
    const old = layerMap.current.get(id)
    if (old) {
      map.removeLayer(old)
      layerMap.current.delete(id)
    }
    if (!img || !ls) return
    const layer = new ImageLayer({
      source: new ImageStatic({ url: img.url, imageExtent: img.extent, projection: marsProjection, interpolate: opts.interpolate }),
      className: opts.className,
    })
    layer.setZIndex(idx)
    layer.setVisible(ls.visible)
    layer.setOpacity(ls.opacity)
    layerMap.current.set(id, layer)
    map.addLayer(layer)
  }

  const hillshadeState = layers.find((l) => l.id === 'hillshade')
  const slopeState = layers.find((l) => l.id === 'slope')
  const envState = layers.find((l) => l.id === 'envelope')
  const commsState = layers.find((l) => l.id === 'comms')

  const sunKey = (() => {
    if (!dtm) return 'x'
    const when = new Date(scenarioTimeMs ?? Date.now())
    const sp = sunPosition(when, SITES.gale.center[0], SITES.gale.center[1])
    return `${Math.round(sp.azimuthDeg / 4)}:${Math.round(sp.elevationDeg / 4)}`
  })()

  useEffect(() => {
    if (!dtm || !ready) return
    if (!hillshadeState?.visible) {
      if (layerMap.current.has('hillshade')) setImageLayer('hillshade', null, { interpolate: true })
      return
    }
    const when = new Date(scenarioTimeMs ?? Date.now())
    const sp = sunPosition(when, SITES.gale.center[0], SITES.gale.center[1])
    setImageLayer('hillshade', hillshadeOverlay(dtm, sp.azimuthDeg, sp.elevationDeg), { interpolate: true, className: 'ol-layer mix-multiply' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dtm, ready, hillshadeState?.visible, sunKey])

  useEffect(() => {
    if (!dtm || !ready) return
    if (!slopeState?.visible) {
      if (layerMap.current.has('slope')) setImageLayer('slope', null, { interpolate: false })
      return
    }
    setImageLayer('slope', slopeOverlay(dtm, getSlope(dtm), params.cautionDeg, params.nogoDeg), { interpolate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dtm, ready, slopeState?.visible, params.cautionDeg, params.nogoDeg])

  useEffect(() => {
    if (!ready) return
    if (!envState?.visible || !plan.grid || !plan.out || !plan.back || plan.envelopeBudgetS <= 0) {
      if (layerMap.current.has('envelope')) setImageLayer('envelope', null, { interpolate: false })
      return
    }
    setImageLayer('envelope', envelopeOverlay(plan.grid, plan.out, plan.back, plan.envelopeBudgetS), { interpolate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, envState?.visible, plan.grid, plan.out, plan.back, Math.round(plan.envelopeBudgetS / 120)])

  useEffect(() => {
    if (!ready) return
    if (!commsState?.visible) {
      if (layerMap.current.has('comms')) setImageLayer('comms', null, { interpolate: false })
      return
    }
    let alive = true
    void router
      .viewshed({ observer: HABITAT.lonLat, maxRangeM: 2200, params, noGo })
      .then((res) => {
        if (!alive) return
        setImageLayer('comms', commsOverlay(res.grid, res.visible, HABITAT.lonLat, 2200), { interpolate: false })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, commsState?.visible, noGo, params.nogoDeg])

  // Keep image layers' z-order/opacity in sync with the layer state.
  useEffect(() => {
    layers.forEach((ls, idx) => {
      const l = layerMap.current.get(ls.id)
      if (l) {
        l.setZIndex(idx)
        l.setVisible(ls.visible)
        l.setOpacity(ls.opacity)
      }
    })
  }, [layers])

  // ---- Vector features -------------------------------------------------------------------------------------
  useEffect(() => {
    const src = vectorSource.current
    src.clear()
    const add = (geom: Point | LineString | OlPolygon, style: Parameters<Feature['setStyle']>[0], props: Record<string, unknown> = {}) => {
      const f = new Feature({ geometry: geom, ...props })
      f.setStyle(style)
      src.addFeature(f)
    }
    for (const poly of noGo) add(new OlPolygon([[...poly, poly[0]]]), noGoStyle)
    for (const profileKey of ['safest', 'fastest', 'science'] as const) {
      const r = routes[profileKey]
      if (!r || profileKey === selectedProfile || r.route.path.length < 2) continue
      add(new LineString(r.route.path), routeStyle(false, profileKey))
    }
    const sel = routes[selectedProfile]
    if (sel && sel.route.path.length > 1) add(new LineString(sel.route.path), routeStyle(true, selectedProfile))
    if (abortRoute && abortRoute.path.length > 1 && walkStatus === 'aborting') add(new LineString(abortRoute.path), abortStyle)
    if (proposedAbort && proposedAbort.path.length > 1) add(new LineString(proposedAbort.path), proposedAbortStyle)
    if (profileLine.length > 1) add(new LineString(profileLine), profileLineStyle)
    if (sel?.walkBack.pointOfNoReturn) add(new Point(sel.walkBack.pointOfNoReturn.lonLat), pnrStyle)

    add(new Point(HABITAT.lonLat), habitatStyle())
    add(new Point(SUPPORT_ROVER.lonLat), roverStyle())

    const visitedOrder = sel ? sel.route.visited.filter((id) => SCIENCE_STOPS.some((s) => s.id === id)) : []
    for (const s of SCIENCE_STOPS) {
      const required = requiredStopIds.includes(s.id)
      const idx = visitedOrder.indexOf(s.id)
      const optionalUsed = !required && scienceStopIds.includes(s.id) && selectedProfile === 'science'
      add(
        new Point(s.lonLat),
        stopStyle({
          index: idx >= 0 ? idx + 1 : null,
          name: s.name,
          required,
          selected: selectedStopId === s.id,
          failed: !!sel && sel.route.failed.includes(s.id),
          optionalUsed,
        }),
      )
    }

    if (draft.length) {
      if (draft.length > 1) add(drawMode === 'nogo' && draft.length > 2 ? new OlPolygon([[...draft, draft[0]]]) : new LineString(draft), draftLineStyle)
      for (const p of draft) add(new Point(p), draftPointStyle)
    }

    if (sim && (walkStatus !== 'idle' || sim.distanceM > 0)) {
      add(new Point(sim.position), walkerStyle(sim.heading, reducedMotion()))
      if (sim.buddy) add(new Point(sim.buddy), buddyStyle())
    }
  }, [routes, selectedProfile, noGo, draft, drawMode, profileLine, requiredStopIds, scienceStopIds, selectedStopId, abortRoute, proposedAbort, walkStatus, sim, ready])

  const geologyVisible = useMissionStore((s) => s.layers.find((l) => l.id === 'geology')?.visible ?? false)
  const cursorText = cursor ? formatLonLat(cursor.ll, 5) : formatLonLat(center, 5)

  return (
    <div className="relative h-full w-full" role="application" aria-label={t('map.aria')}>
      <div ref={hostRef} className="h-full w-full bg-black" data-testid="mars-map" />
      <MapStatus resolution={resolution} centerLat={center[1]} cursorText={cursorText} elevation={cursor?.z ?? null} hasCursor={!!cursor} />
      {geologyVisible && (
        <p className="pointer-events-none absolute bottom-10 right-3 z-10 max-w-64 rounded-lg border border-caution bg-surface/95 px-2 py-1 text-xs font-semibold text-caution" role="note">
          {t('map.geologyRegional')}
        </p>
      )}
      {drawMode !== 'none' && <DrawBar />}
    </div>
  )
}

function DrawBar() {
  const { t } = useTranslation()
  const drawMode = useMissionStore((s) => s.drawMode)
  const draft = useMissionStore((s) => s.draft)
  const { addDraftPoint, undoDraft, finishDraft, setDrawMode } = useMissionStore.getState()
  const min = drawMode === 'nogo' ? 3 : 2
  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-caution bg-surface/95 px-3 py-2 shadow-lg" role="group" aria-label={t('map.draw.title')}>
      <span className="text-sm font-semibold text-caution">{drawMode === 'nogo' ? t('map.draw.nogo') : t('map.draw.profile')}</span>
      <span className="chip">{t('map.draw.points', { n: draft.length })}</span>
      <button className="btn btn-sm" onClick={() => {
        const c = mapCenter()
        if (c) addDraftPoint(c)
      }}>
        {t('map.draw.addCenter')}
      </button>
      <button className="btn btn-sm" onClick={undoDraft} disabled={draft.length === 0}>{t('map.draw.undo')}</button>
      <button className="btn btn-sm btn-primary" onClick={finishDraft} disabled={draft.length < min}>{t('map.draw.finish')}</button>
      <button className="btn btn-sm" onClick={() => setDrawMode('none')}>{t('map.draw.cancel')}</button>
    </div>
  )
}

