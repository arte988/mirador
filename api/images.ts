import { getImages, isMission, respond, type FnRequest, type FnResponse } from './_nasa.js'

/** GET /api/images?mission=msl|mars2020&sol=4451 */
export default async function handler(req: FnRequest, res: FnResponse): Promise<void> {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
  const mission = one(req.query?.mission) ?? 'msl'
  const sol = Number(one(req.query?.sol))
  await respond(res, () => (isMission(mission) ? getImages(mission, sol) : Promise.reject(new Error('bad mission'))))
}
