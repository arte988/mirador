import { executeToolCall, liveCopilotContext, type CopilotContext, type ToolResult } from './tools.ts'

export type FallbackName = 'can_continue' | 'get_safety' | 'comms_delay'
export type FallbackResults = Record<FallbackName, ToolResult>
type Run = (name: FallbackName) => Promise<ToolResult>
export const needsFallback = (error: string) => ['no_key', 'rate_limit', 'forbidden', 'network', 'upstream', 'timeout', 'closed', 'protocol'].includes(error)

/** Run the same local calculations as CAPCOM; an unavailable tool remains unavailable. */
export async function deterministicCheck(run: Run): Promise<FallbackResults> {
  const names: FallbackName[] = ['can_continue', 'get_safety', 'comms_delay']
  const results = await Promise.all(names.map(async (name) => {
    try { return await run(name) } catch { return { ok: false, value: null, source: 'AEOLIS local tools', ageS: null, note: 'tool error' } }
  }))
  return { can_continue: results[0], get_safety: results[1], comms_delay: results[2] }
}
export async function runFallback(): Promise<FallbackResults> {
  let ctx: CopilotContext
  try { ctx = await liveCopilotContext({ includeForecast: false }) }
  catch { return deterministicCheck(async () => { throw new Error('context unavailable') }) }
  return deterministicCheck((name) => executeToolCall({ id: `fallback-${name}-${Date.now()}`, name, args: {} }, ctx))
}
