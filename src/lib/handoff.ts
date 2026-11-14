/**
 * Handoff of a plan between devices: a shareable URL (and a QR of that URL) plus a same-origin BroadcastChannel.
 * Only the serializable SharedPlan travels; routes themselves are recomputed on the receiving device.
 */
import { DEFAULT_REQUIRED_IDS, type SiteId } from '../data/sites.ts'
import { DEFAULT_PARAMS, type PlanningParams } from './params.ts'
import { useMissionStore, type SharedPlan } from '../stores/useMissionStore.ts'

export const CHANNEL = 'mirador.handoff'
export const QUERY = 'plan'

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'

export function encodePlan(p: SharedPlan): string {
  const json = JSON.stringify(p)
  const bytes = new TextEncoder().encode(json)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodePlan(token: string): SharedPlan | null {
  try {
    const pad = token.replace(/-/g, '+').replace(/_/g, '/')
    const b64 = pad + '='.repeat((4 - (pad.length % 4)) % 4)
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const raw: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (!isObj(raw)) return null
    const params: PlanningParams = { ...DEFAULT_PARAMS, ...((isObj(raw.params) ? raw.params : {}) as Partial<PlanningParams>) }
    const required = Array.isArray(raw.requiredStopIds) ? raw.requiredStopIds.filter((x): x is string => typeof x === 'string') : DEFAULT_REQUIRED_IDS
    const noGo = Array.isArray(raw.noGo) ? (raw.noGo as SharedPlan['noGo']) : []
    const selectedProfile = raw.selectedProfile === 'fastest' || raw.selectedProfile === 'science' ? raw.selectedProfile : 'safest'
    const site: SiteId = raw.site === 'jezero' ? 'jezero' : 'gale'
    const scenario = isObj(raw.scenario)
      ? {
          dustStorm: !!raw.scenario.dustStorm,
          sepAlert: !!raw.scenario.sepAlert,
          o2Leak: !!raw.scenario.o2Leak,
        }
      : { dustStorm: false, sepAlert: false, o2Leak: false }
    return { requiredStopIds: required, noGo, params, selectedProfile, stormFlag: !!raw.stormFlag, scenario, site }
  } catch {
    return null
  }
}

export function shareUrl(p: SharedPlan, origin = typeof location !== 'undefined' ? location.origin : '', path = '/hud'): string {
  return `${origin}${path}?${QUERY}=${encodePlan(p)}`
}

export function snapshotPlan(): SharedPlan {
  const s = useMissionStore.getState()
  return {
    requiredStopIds: s.requiredStopIds,
    noGo: s.noGo,
    params: s.params,
    selectedProfile: s.selectedProfile,
    stormFlag: s.stormFlag,
    scenario: s.scenario,
    site: s.site,
  }
}

export function applyShared(p: SharedPlan): void {
  useMissionStore.getState().hydrateShared(p)
}
