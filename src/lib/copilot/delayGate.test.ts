import { afterEach, describe, expect, it, vi } from 'vitest'
import { DelayGate } from './delayGate.ts'
import { oneWayDelayMinutes } from '../commsDelay.ts'

const clock = { now: Date.now, setTimer: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimer: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer) }
afterEach(() => vi.useRealTimers())
describe('compressed Earth communications gate', () => {
  it('releases audio, transcript and evidence in order after round trip divided by 60', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-15T12:00:00Z'))
    const delivered: string[] = [], release = vi.fn(), gate = new DelayGate<string>(clock, release)
    const realRttS = oneWayDelayMinutes(new Date(Date.now())) * 120
    const delayMs = realRttS * 1000 / 60
    gate.begin(delayMs)
    gate.deliver('audio', (v) => delivered.push(v)); gate.deliver('evidence', (v) => delivered.push(v)); gate.deliver('transcript', (v) => delivered.push(v))
    vi.advanceTimersByTime(Math.floor(delayMs) - 1); expect(delivered).toEqual([])
    vi.advanceTimersByTime(2); expect(delivered).toEqual(['audio', 'evidence', 'transcript']); expect(release).toHaveBeenCalledTimes(1)
    gate.deliver('later', (v) => delivered.push(v)); expect(delivered.at(-1)).toBe('later')
  })
  it('delivers onboard immediately and cancels queued output on stop', () => {
    vi.useFakeTimers()
    const deliver = vi.fn(), gate = new DelayGate<string>(clock, vi.fn())
    gate.deliver('onboard', deliver); expect(deliver).toHaveBeenCalledWith('onboard')
    gate.begin(1000); gate.deliver('cancelled', deliver); gate.cancel(); vi.advanceTimersByTime(2000)
    expect(deliver).toHaveBeenCalledTimes(1)
    gate.begin(200); gate.deliver('next', deliver); vi.advanceTimersByTime(200); expect(deliver).toHaveBeenLastCalledWith('next')
  })
})
