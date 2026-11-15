import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({ session: null as any, noKey: false, runFallback: vi.fn() }))
vi.mock('./liveClient.ts', () => ({
  LiveSession: class {
    status = 'idle'
    callbacks: Record<string, (...args: any[]) => void> = {}
    constructor() { fake.session = this }
    on(name: string, fn: (...args: any[]) => void) { this.callbacks[name] = fn }
    async connect() {
      if (fake.noKey) { this.callbacks.onError({ code: 'no_key' }); throw new Error('no key') }
      this.status = 'ready'; this.callbacks.onStatus('ready')
    }
    sendText() { this.status = 'thinking'; this.callbacks.onStatus('thinking') }
    close() { this.status = 'closed' }
    startTalking() {} stopTalking() {} sendAudioChunk() {}
  },
}))
vi.mock('./audio.ts', () => ({ MicrophoneCapture: class { async open() {} async close() {} start() {} stop() {} }, PcmPlayer: class { play() {} flush() {} async close() {} } }))
vi.mock('./fallback.ts', () => ({ needsFallback: (code: string) => code === 'no_key', runFallback: fake.runFallback }))

import { useCopilot } from './useCopilot.ts'
const data = { can_continue: { ok: false, value: null, source: 'route', ageS: null, note: 'no route planned' }, get_safety: { ok: false, value: null, source: 'safety', ageS: null, note: 'not loaded' }, comms_delay: { ok: true, value: { oneWayMinutes: 8 }, source: 'JPL', ageS: 0 } }
beforeEach(() => { fake.noKey = false; fake.runFallback.mockReset().mockResolvedValue(data); useCopilot.setState({ status: 'idle', transcript: [], visibleCalls: [], fallback: null, lastError: null, delay: null }); useCopilot.getState().setCommsMode('onboard') })
afterEach(() => { useCopilot.getState().stop(); vi.useRealTimers() })

describe('copilot delay and fallback integration', () => {
  it('automatically loads the local card after no_key', async () => {
    fake.noKey = true
    await useCopilot.getState().start()
    await vi.waitFor(() => expect(useCopilot.getState().fallback).toEqual(data))
    expect(useCopilot.getState().lastError).toBe('no_key')
    expect(useCopilot.getState().fallback?.can_continue.value).toBeNull()
  })
  it('hides tool evidence and model output until the countdown and blocks new requests', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))
    await useCopilot.getState().start(); useCopilot.getState().setCommsMode('earth'); useCopilot.getState().sendText('first')
    const initialDelay = useCopilot.getState().delay!
    fake.session.callbacks.onToolCall({ id: 'a', name: 'get_safety', args: {} }, data.get_safety)
    fake.session.callbacks.onTranscript({ role: 'capcom', text: 'No data', final: true })
    useCopilot.getState().sendText('blocked')
    expect(useCopilot.getState().transcript).toHaveLength(1)
    expect(useCopilot.getState().visibleCalls).toHaveLength(0)
    vi.advanceTimersByTime(initialDelay.deadline - Date.now() + 1)
    expect(useCopilot.getState().visibleCalls).toHaveLength(1)
    expect(useCopilot.getState().transcript[1]).toMatchObject({ text: 'No data', evidence: [{ id: 'a' }] })
    expect(useCopilot.getState().delay).toBeNull()
  })
  it('drops pending output on stop and delivers immediately onboard', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))
    await useCopilot.getState().start(); useCopilot.getState().setCommsMode('earth'); useCopilot.getState().sendText('first')
    fake.session.callbacks.onTranscript({ role: 'capcom', text: 'discard', final: true })
    useCopilot.getState().stop(); vi.advanceTimersByTime(60000)
    expect(useCopilot.getState().transcript.some((line) => line.text === 'discard')).toBe(false)
    await useCopilot.getState().start(); useCopilot.getState().setCommsMode('onboard'); useCopilot.getState().sendText('second')
    fake.session.callbacks.onTranscript({ role: 'capcom', text: 'immediate', final: true })
    expect(useCopilot.getState().transcript.at(-1)?.text).toBe('immediate')
    expect(useCopilot.getState().delay).toBeNull()
  })
})
