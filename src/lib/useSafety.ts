import { useEffect, useMemo, useState } from 'react'
import { SITES } from '../data/sites.ts'
import { useMissionStore } from '../stores/useMissionStore.ts'
import { refreshFeeds } from './feeds.ts'
import { coldDropK, forecastIsCold, type GaleForecast } from './climateForecast.ts'
import { loadForecast } from './climateLoad.ts'
import { evaluateSafety, type SafetyInput, type SafetyResult } from './safety.ts'
import { buildSafetyInput } from './safetyInput.ts'

const REFRESH_MS = 15 * 60 * 1000

/** Keeps the feeds fresh, evaluates the semaphore and stores the result. Mount once (PlanLayout). */
export function useSafetyEngine(): void {
  useEffect(() => {
    void refreshFeeds()
    const id = window.setInterval(() => void refreshFeeds(), REFRESH_MS)
    return () => window.clearInterval(id)
  }, [])
  const { input } = useSafetyInput()
  const result = useMemo(() => evaluateSafety(input), [input])
  useEffect(() => {
    useMissionStore.getState().setSafety(result)
  }, [result])
}

/** The assembled semaphore input, re-evaluated every minute so ages and daylight stay current. */
export function useSafetyInput(): { input: SafetyInput; now: number } {
  const weather = useMissionStore((s) => s.weather)
  const space = useMissionStore((s) => s.space)
  const scenario = useMissionStore((s) => s.scenario)
  const stormFlag = useMissionStore((s) => s.stormFlag)
  const scenarioTimeMs = useMissionStore((s) => s.scenarioTimeMs)
  const routes = useMissionStore((s) => s.routes)
  const selected = useMissionStore((s) => s.selectedProfile)
  const reserveMin = useMissionStore((s) => s.params.reserveMin)
  const [tick, setTick] = useState(() => Date.now())
  const [forecast, setForecast] = useState<GaleForecast | null>(null)
  useEffect(() => {
    void loadForecast().then((r) => setForecast(r.data))
  }, [])
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 60000)
    return () => window.clearInterval(id)
  }, [])
  const route = routes[selected]
  const routeMinutes = route ? route.analysis.totalTimeS / 60 : null
  const input = useMemo(
    () =>
      buildSafetyInput({
        weather,
        space,
        scenario,
        stormFlag,
        startMs: scenarioTimeMs ?? tick,
        site: { lon: SITES.gale.center[0], lat: SITES.gale.center[1] },
        routeMinutes,
        reserveMin,
        now: tick,
        forecastCold: forecastIsCold(forecast) ? { dropK: coldDropK(forecast) ?? 0 } : null,
      }),
    [weather, space, scenario, stormFlag, scenarioTimeMs, routeMinutes, reserveMin, tick, forecast],
  )
  return { input, now: tick }
}

export type { SafetyResult }
