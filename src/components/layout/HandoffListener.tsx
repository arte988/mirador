import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CHANNEL, QUERY, applyShared, decodePlan } from '../../lib/handoff.ts'

/** Applies a plan arriving via URL (?plan=) or BroadcastChannel. */
export default function HandoffListener() {
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const token = params.get(QUERY)
    if (!token) return
    const plan = decodePlan(token)
    if (plan) applyShared(plan)
    const next = new URLSearchParams(params)
    next.delete(QUERY)
    setParams(next, { replace: true })
  }, [params, setParams])
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (e) => {
      if (e.data?.type === 'plan' && e.data.plan) applyShared(e.data.plan)
    }
    return () => ch.close()
  }, [])
  return null
}
