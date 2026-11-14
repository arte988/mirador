import { getDonki, respond, type FnResponse } from './_nasa.js'

export default async function handler(_req: unknown, res: FnResponse): Promise<void> {
  await respond(res, () => getDonki())
}
