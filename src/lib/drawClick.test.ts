import { describe, expect, it } from 'vitest'
import { drawClickDecision } from './drawClick.ts'

describe('profile click filter', () => {
  it('ignores the second click of a double-click', () => {
    expect(drawClickDecision({ detail: 2, now: 100, lastClickAt: 40, pixel: [10, 10], previousPixel: [10, 10] })).toBe('ignore')
  })
  it('ignores a click within 300 ms or 3 px of the previous one', () => {
    expect(drawClickDecision({ detail: 1, now: 500, lastClickAt: 300, pixel: [40, 10], previousPixel: [10, 10] })).toBe('ignore')
    expect(drawClickDecision({ detail: 1, now: 900, lastClickAt: 100, pixel: [12, 10], previousPixel: [10, 10] })).toBe('ignore')
  })
  it('accepts a later click on a new spot', () => {
    expect(drawClickDecision({ detail: 1, now: 900, lastClickAt: 0, pixel: [20, 10], previousPixel: [10, 10] })).toBe('add')
  })
})
