import { useEffect, useState } from 'react'
import { computeSlopeDeg, loadDtm, type Dtm } from './dtm.ts'

let dtm: Dtm | null = null
let promise: Promise<Dtm | null> | null = null
let slope: Float32Array | null = null

export type DtmStatus = 'loading' | 'ready' | 'missing'

export function ensureDtm(): Promise<Dtm | null> {
  if (!promise) {
    promise = loadDtm().then((d) => {
      dtm = d
      return d
    })
  }
  return promise
}

export const getDtm = () => dtm

export function getSlope(d: Dtm): Float32Array {
  if (!slope) slope = computeSlopeDeg(d)
  return slope
}

/** React hook: loads the committed DTM once and reports status ("missing" = No local DTM loaded). */
export function useDtm(): { dtm: Dtm | null; status: DtmStatus } {
  const [state, setState] = useState<{ dtm: Dtm | null; status: DtmStatus }>(() =>
    dtm ? { dtm, status: 'ready' } : { dtm: null, status: 'loading' },
  )
  useEffect(() => {
    let alive = true
    void ensureDtm().then((d) => {
      if (alive) setState({ dtm: d, status: d ? 'ready' : 'missing' })
    })
    return () => {
      alive = false
    }
  }, [])
  return state
}
