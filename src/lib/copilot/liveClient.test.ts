import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildLiveSetup } from '../../../api/_copilot.ts'
import { LiveError, LiveSession, fetchLiveToken, type SocketLike } from './liveClient.ts'
import { decodePcm, encodePcm, floatToInt16, resample, chunkPcm } from './pcm.ts'
import { immediateOutput } from './useCopilot.ts'

class FakeSocket implements SocketLike {
  readyState = 1
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  sent: any[] = []
  send(data: string) { this.sent.push(JSON.parse(data)) }
  close() { this.readyState = 3 }
  open() { this.onopen?.({} as Event) }
  message(data: unknown) { this.onmessage?.({ data: typeof data === 'object' && !(data instanceof Blob) && !(data instanceof ArrayBuffer) ? JSON.stringify(data) : data } as MessageEvent) }
  disconnect() { this.readyState = 3; this.onclose?.({} as CloseEvent) }
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const result = { ok: true, value: { level: 'amber' }, source: 'test', ageS: 0 }
function setup(executeTool = vi.fn().mockResolvedValue(result)) {
  const sockets: FakeSocket[] = [], urls: string[] = []
  const client = new LiveSession({ fetchToken: async () => ({ token: 'auth_tokens/test+token', model: 'gemini-3.8-live' }), createSocket: (url) => { urls.push(url); const socket = new FakeSocket(); sockets.push(socket); return socket }, executeTool, setupTimeoutMs: 500 })
  return { client, sockets, urls }
}
async function ready(client: LiveSession, sockets: FakeSocket[]) {
  const promise = client.connect()
  await flush()
  sockets[0].open(); sockets[0].message({ setupComplete: {} }); await promise
}
afterEach(() => { vi.unstubAllGlobals() })

describe('LiveSession', () => {
  it('sends setup, runs tools and waits for the answer after the tool turn', async () => {
    const { client, sockets, urls } = setup()
    const audio: Int16Array[] = [], transcript: unknown[] = []
    client.on('onAudio', (a) => audio.push(a)); client.on('onTranscript', (t) => transcript.push(t))
    await ready(client, sockets)
    const socket = sockets[0]
    expect(urls[0]).toContain('BidiGenerateContentConstrained?access_token=auth_tokens%2Ftest%2Btoken')
    expect(socket.sent[0]).toEqual({ setup: buildLiveSetup() })
    client.sendText('Status?')
    expect(socket.sent[1]).toEqual({ realtimeInput: { text: 'Status?' } })
    socket.message({ toolCall: { functionCalls: [{ id: 'a', name: 'get_safety', args: {} }] } })
    socket.message({ serverContent: { generationComplete: true, turnComplete: true } })
    await flush(); await flush()
    expect(socket.sent[2]).toEqual({ toolResponse: { functionResponses: [{ id: 'a', name: 'get_safety', response: { result } }] } })
    expect(client.status).toBe('thinking')
    socket.message({ serverContent: { modelTurn: { parts: [{ inlineData: { data: encodePcm(new Int16Array([1, -2])) } }] }, outputTranscription: { text: 'Model ' } } })
    socket.message({ serverContent: { outputTranscription: { text: 'estimate.' } } })
    socket.message({ serverContent: { turnComplete: true } })
    await flush()
    expect([...audio[0]]).toEqual([1, -2]); expect(client.status).toBe('ready')
    expect(transcript.at(-1)).toEqual({ role: 'capcom', text: 'Model estimate.', final: true })
    client.close(); client.close()
  })
  it('sends push-to-talk in order and signals interruption', async () => {
    const { client, sockets } = setup(); await ready(client, sockets)
    const interrupted = vi.fn(); client.on('onInterrupted', interrupted)
    sockets[0].message({ serverContent: { modelTurn: { parts: [{ inlineData: { data: encodePcm(new Int16Array([5])) } }] } } }); await flush()
    client.startTalking(); client.sendAudioChunk(new Int16Array([-32768, 2])); client.stopTalking()
    expect(sockets[0].sent.slice(1)).toEqual([{ realtimeInput: { activityStart: {} } }, { realtimeInput: { audio: { data: encodePcm(new Int16Array([-32768, 2])), mimeType: 'audio/pcm;rate=16000' } } }, { realtimeInput: { activityEnd: {} } }])
    expect(interrupted).toHaveBeenCalledTimes(1)
    sockets[0].message({ serverContent: { interrupted: true } }); await flush(); expect(interrupted).toHaveBeenCalledTimes(2)
    client.close()
  })
  it('ignores unknown frames and reports malformed frames while accepting Blob and ArrayBuffer', async () => {
    const { client, sockets } = setup(); await ready(client, sockets)
    const errors = vi.fn(), texts = vi.fn(); client.on('onError', errors); client.on('onTranscript', texts)
    sockets[0].message(''); sockets[0].message('{}'); sockets[0].message('{')
    sockets[0].message(new Blob([JSON.stringify({ serverContent: { inputTranscription: { text: 'hello' } } })]))
    sockets[0].message(new TextEncoder().encode(JSON.stringify({ serverContent: { turnComplete: true } })).buffer)
    await flush(); await flush()
    expect(errors).toHaveBeenCalledTimes(1); expect(texts).toHaveBeenLastCalledWith({ role: 'user', text: 'hello', final: true })
    client.close()
  })
  it('ignores cancelled late tool results', async () => {
    let resolve!: (v: typeof result) => void
    const { client, sockets } = setup(vi.fn(() => new Promise((r) => { resolve = r })))
    await ready(client, sockets)
    sockets[0].message({ toolCall: { functionCalls: [{ id: 'a', name: 'get_safety' }] } }); await flush()
    sockets[0].message({ toolCallCancellation: { ids: ['a'] } }); await flush()
    resolve(result); await flush()
    expect(sockets[0].sent).toHaveLength(1); client.close()
  })
  it('returns failed tool results to the model', async () => {
    const { client, sockets } = setup(vi.fn().mockRejectedValue(new Error('internal')))
    await ready(client, sockets)
    sockets[0].message({ toolCall: { functionCalls: [{ id: 'b', name: 'get_status' }] } })
    await flush(); await flush()
    expect(sockets[0].sent[1].toolResponse.functionResponses[0].response.result).toMatchObject({ ok: false, value: null, note: 'tool error' })
    client.close()
  })
  it('closes a connection being set up without leaving its promise pending', async () => {
    const { client, sockets } = setup()
    const promise = client.connect(); await flush(); sockets[0].open(); client.close(); client.close()
    await expect(promise).rejects.toMatchObject({ code: 'closed' })
    expect(client.status).toBe('closed')
  })
  it('reconnects once with a fresh token and the resumption handle', async () => {
    const { client, sockets } = setup(); await ready(client, sockets)
    sockets[0].message({ sessionResumptionUpdate: { resumable: true, newHandle: 'handle' } }); await flush()
    sockets[0].disconnect(); await flush()
    expect(sockets).toHaveLength(2); sockets[1].open()
    expect(sockets[1].sent[0].setup.sessionResumption).toEqual({ handle: 'handle' })
    sockets[1].message({ setupComplete: {} }); await flush(); expect(client.status).toBe('ready')
    sockets[1].disconnect(); expect(client.status).toBe('closed'); client.close()
  })
  it('maps missing key to a typed error without opening a socket', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: 'no_key' }) }))
    const createSocket = vi.fn()
    const client = new LiveSession({ fetchToken: fetchLiveToken, createSocket })
    await expect(client.connect()).rejects.toMatchObject({ code: 'no_key' })
    expect(createSocket).not.toHaveBeenCalled(); client.close()
  })
  it('throws typed errors for forbidden and network token responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    await expect(fetchLiveToken()).rejects.toBeInstanceOf(LiveError)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    await expect(fetchLiveToken()).rejects.toMatchObject({ code: 'rate_limit' })
  })
})

describe('PCM and output gate', () => {
  it('converts, resamples, chunks and encodes little-endian samples', () => {
    expect([...floatToInt16(new Float32Array([-2, 0, 1, 2]))]).toEqual([-32768, 0, 32767, 32767])
    expect([...resample(new Float32Array([0, 1, 0, -1]), 4, 2)]).toEqual([0, 0])
    const pcm = new Int16Array([-32768, -1, 0, 32767])
    expect([...decodePcm(encodePcm(pcm))]).toEqual([...pcm])
    expect(chunkPcm(pcm, 3).map((c) => c.length)).toEqual([3, 1])
    expect(() => decodePcm('AA==')).toThrow()
  })
  it('delivers items immediately by default', () => {
    const deliver = vi.fn(), item = { type: 'audio' as const, samples: new Int16Array([5]) }
    immediateOutput(item, deliver); expect(deliver).toHaveBeenCalledWith(item)
  })
})
