import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLiveSetup, COPILOT_MODEL, COPILOT_SYSTEM_PROMPT, mintLiveToken, TOOL_DECLARATIONS, TOOL_NAMES } from '../../api/_copilot.ts'
import { createLiveTokenHandler, sameOrigin, type LiveTokenRequest } from '../../api/live-token.ts'
import type { FnResponse } from '../../api/_nasa.ts'

const now = Date.parse('2026-11-15T12:00:00Z')
const key = 'test-key-only'
const request = (ip: string, origin?: string): LiveTokenRequest => ({ method: 'POST', headers: { host: 'mirador.test', origin, 'x-forwarded-for': ip } })

async function call(req: LiveTokenRequest, env: { GEMINI_API_KEY?: string }) {
  let status = 0
  let body: unknown
  const headers: Record<string, string> = {}
  const res: FnResponse = { status(code) { status = code; return res }, setHeader(name, value) { headers[name] = String(value) }, json(value) { body = value } }
  await createLiveTokenHandler(env)(req, res)
  return { status, body, headers }
}

afterEach(() => vi.unstubAllGlobals())

describe('Gemini Live token', () => {
  it('mints a single-use token with locked setup and short lifetimes', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'auth_tokens/test-token' }) })
    vi.stubGlobal('fetch', mock)
    const result = await mintLiveToken({ GEMINI_API_KEY: key }, now)
    expect(result).toEqual({ status: 200, body: { token: 'auth_tokens/test-token', model: COPILOT_MODEL, expireTime: new Date(now + 30 * 60_000).toISOString() } })
    expect(JSON.stringify(result)).not.toContain(key)
    const [url, init] = mock.mock.calls[0]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/auth_tokens')
    expect(init.method).toBe('POST')
    expect(init.headers['x-goog-api-key']).toBe(key)
    expect(JSON.parse(init.body)).toEqual({ uses: 1, expireTime: new Date(now + 30 * 60_000).toISOString(), newSessionExpireTime: new Date(now + 60_000).toISOString(), bidiGenerateContentSetup: buildLiveSetup() })
    expect(buildLiveSetup()).toMatchObject({ model: 'models/gemini-3.8-live', generationConfig: { responseModalities: ['AUDIO'] }, realtimeInputConfig: { automaticActivityDetection: { disabled: true } }, inputAudioTranscription: {}, outputAudioTranscription: {}, sessionResumption: {} })
    expect(TOOL_DECLARATIONS.map((tool) => tool.name)).toEqual(TOOL_NAMES)
    expect(buildLiveSetup().tools[0].functionDeclarations).toEqual(TOOL_DECLARATIONS)
    expect(COPILOT_SYSTEM_PROMPT).toContain('Never state a number')
    expect(COPILOT_SYSTEM_PROMPT).toContain('source and age')
  })
  it('returns no_key without calling upstream and sanitizes failures', async () => {
    const mock = vi.fn().mockRejectedValue(new Error(key))
    vi.stubGlobal('fetch', mock)
    expect(await mintLiveToken({}, now)).toEqual({ status: 503, body: { error: 'no_key' } })
    expect(mock).not.toHaveBeenCalled()
    const result = await mintLiveToken({ GEMINI_API_KEY: key }, now)
    expect(result).toEqual({ status: 502, body: { error: 'upstream' } })
    expect(JSON.stringify(result)).not.toContain(key)
    mock.mockResolvedValue({ ok: false, json: async () => ({ error: key }) })
    expect(await mintLiveToken({ GEMINI_API_KEY: key }, now)).toEqual(result)
  })
  it('enforces origin and method and never caches responses', async () => {
    expect(sameOrigin(request('origin-test', 'https://mirador.test'))).toBe(true)
    expect(sameOrigin(request('origin-test', 'http://mirador.test'))).toBe(false)
    expect(sameOrigin(request('origin-test'))).toBe(true)
    expect(sameOrigin(request('origin-test', 'http://localhost:1234'))).toBe(false)
    expect(sameOrigin({ method: 'GET', headers: { host: 'localhost:1234', origin: 'http://localhost:1234' } })).toBe(true)
    expect(sameOrigin(request('origin-test', 'null'))).toBe(false)
    const forbidden = await call(request('origin-test', 'https://evil.test'), { GEMINI_API_KEY: key })
    expect(forbidden).toMatchObject({ status: 403, headers: { 'Cache-Control': 'no-store' } })
    const method = await call({ ...request('method-test'), method: 'DELETE' }, {})
    expect(method).toMatchObject({ status: 405, headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' } })
    expect(await call(request('missing-key-test'), {})).toMatchObject({ status: 503, body: { error: 'no_key' }, headers: { 'Cache-Control': 'no-store' } })
  })
  it('limits each IP to 12 requests per hour', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'auth_tokens/test-token' }) }))
    for (let i = 0; i < 12; i++) expect((await call(request('rate-test'), { GEMINI_API_KEY: key })).status).toBe(200)
    expect(await call(request('rate-test'), { GEMINI_API_KEY: key })).toMatchObject({ status: 429, body: { error: 'rate_limit' }, headers: { 'Cache-Control': 'no-store' } })
    expect((await call(request('other-ip'), { GEMINI_API_KEY: key })).status).toBe(200)
  })
})
