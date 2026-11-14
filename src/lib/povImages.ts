/**
 * Raw rover images by sol, through our proxy (/api/images) with the usual fallback order:
 * live -> last cached copy (stale) -> committed snapshot (only a few sols are committed).
 */
import type { ImagesPayload, Mission } from '../../api/_nasa.ts'
import { fetchJSONCached, type FetchResult } from './storage.ts'

export type { ImagesPayload, Mission, RawImage } from '../../api/_nasa.ts'

/**
 * Default sol ranges for the sliders. The boxwork campaign range is approximate (about sols 4451 to 4550) and
 * should be verified against the mission's own campaign notes. Perseverance has no boxwork campaign: the range is
 * simply the 100 sols up to the newest one known when the snapshot was taken.
 */
export const SOL_RANGE: Record<Mission, { min: number; max: number; initial: number }> = {
  msl: { min: 4451, max: 4550, initial: 4500 },
  mars2020: { min: 1932, max: 2031, initial: 2031 },
}

export const MISSION_NAME: Record<Mission, string> = { msl: 'Curiosity', mars2020: 'Perseverance' }

const CAMERA_NAMES: [RegExp, string][] = [
  [/^MAST_LEFT/, 'Mastcam left'],
  [/^MAST_RIGHT/, 'Mastcam right'],
  [/^NAV_LEFT/, 'Navcam left'],
  [/^NAV_RIGHT/, 'Navcam right'],
  [/^FHAZ/, 'Front Hazcam'],
  [/^RHAZ/, 'Rear Hazcam'],
  [/^CHEMCAM/, 'ChemCam RMI'],
  [/^SUPERCAM/, 'SuperCam RMI'],
  [/^MAHLI/, 'MAHLI (arm)'],
  [/^MARDI/, 'MARDI (down)'],
]

/** Friendly camera name; unknown instrument codes are shown as published. */
export function cameraLabel(code: string): string {
  return CAMERA_NAMES.find(([re]) => re.test(code))?.[1] ?? code
}

export async function loadImages(mission: Mission, sol: number): Promise<FetchResult<ImagesPayload>> {
  return fetchJSONCached<ImagesPayload>(
    `images-${mission}-${sol}`,
    [`/api/images?mission=${mission}&sol=${sol}`, `/snapshots/images-${mission}-${sol}.json`],
    {
      timeoutMs: 20000,
      transform: (raw) => {
        const p = raw as ImagesPayload
        if (!p || !Array.isArray(p.images)) throw new Error('bad image payload')
        return p
      },
    },
  )
}
