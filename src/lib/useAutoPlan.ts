import { useEffect } from 'react'
import { useMissionStore } from '../stores/useMissionStore.ts'
import { runPlan } from './planner.ts'

/**
 * Plans on first load and re-plans (debounced) whenever an input changes: required stops, no-go polygons or
 * any planning assumption. The solver lives in a Web Worker, so the UI stays responsive.
 */
export function useAutoPlan(): void {
  const required = useMissionStore((s) => s.requiredStopIds)
  const noGo = useMissionStore((s) => s.noGo)
  const params = useMissionStore((s) => s.params)
  const version = useMissionStore((s) => s.planVersion)
  // Injected scenarios (dust storm, O2 leak) change the effective assumptions, so they trigger a re-plan.
  const dust = useMissionStore((s) => s.scenario.dustStorm)
  const leak = useMissionStore((s) => s.scenario.o2Leak)
  useEffect(() => {
    const id = window.setTimeout(() => void runPlan(), 300)
    return () => window.clearTimeout(id)
  }, [required, noGo, params, version, dust, leak])
}
