import { useEffect } from 'react'
import { useMissionStore } from '../stores/useMissionStore.ts'

/**
 * Advances the simulated EVA clock while walking. Honors prefers-reduced-motion by not interpolating
 * visually elsewhere; the clock itself still ticks so a rehearsal can finish.
 */
export function useClock(): void {
  const walking = useMissionStore((s) => s.walkStatus === 'walking' || s.walkStatus === 'aborting')
  const speed = useMissionStore((s) => s.simSpeed)
  useEffect(() => {
    if (!walking) return
    let last = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      const st = useMissionStore.getState()
      if (st.walkStatus !== 'walking' && st.walkStatus !== 'aborting') return
      st.setWalk({ elapsedS: st.elapsedS + dt * st.simSpeed })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [walking, speed])
}
