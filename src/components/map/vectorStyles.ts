import { Circle as CircleStyle, Fill, RegularShape, Stroke, Style, Text } from 'ol/style'
import type { StyleLike } from 'ol/style/Style'

const CYAN = '#22d3ee'
const AMBER = '#ffb020'
const RED = '#ff5a5f'
const GREEN = '#3dff9a'
const WHITE = '#e8eef5'
const INK = '#05070a'

const label = (text: string, dy = -16, color = WHITE) =>
  new Text({
    text,
    offsetY: dy,
    font: '600 12px Inter, system-ui, sans-serif',
    fill: new Fill({ color }),
    stroke: new Stroke({ color: INK, width: 4 }),
  })

export function habitatStyle(): Style[] {
  return [
    new Style({
      image: new RegularShape({ points: 4, radius: 10, angle: Math.PI / 4, fill: new Fill({ color: INK }), stroke: new Stroke({ color: WHITE, width: 3 }) }),
      text: label('HAB', -18),
      zIndex: 30,
    }),
  ]
}

export function roverStyle(): Style[] {
  return [
    new Style({
      image: new RegularShape({ points: 3, radius: 11, fill: new Fill({ color: INK }), stroke: new Stroke({ color: GREEN, width: 3 }) }),
      text: label('ROVER', -18, GREEN),
      zIndex: 30,
    }),
  ]
}

export function stopStyle(opts: { index: number | null; name: string; required: boolean; selected: boolean; failed: boolean; optionalUsed: boolean }): Style[] {
  const stroke = opts.failed ? RED : opts.required || opts.optionalUsed ? CYAN : AMBER
  return [
    new Style({
      image: new CircleStyle({
        radius: opts.selected ? 13 : 10,
        fill: new Fill({ color: opts.required || opts.optionalUsed ? CYAN : INK }),
        stroke: new Stroke({ color: opts.selected ? WHITE : stroke, width: opts.selected ? 3 : 2, lineDash: opts.required || opts.optionalUsed ? undefined : [3, 3] }),
      }),
      text: new Text({
        text: opts.index !== null ? String(opts.index) : '+',
        font: '700 12px Inter, system-ui, sans-serif',
        fill: new Fill({ color: opts.required || opts.optionalUsed ? INK : AMBER }),
      }),
      zIndex: 28,
    }),
    new Style({ text: label(opts.name, 24), zIndex: 28 }),
  ]
}

export function routeStyle(selected: boolean, profile: 'safest' | 'fastest' | 'science'): Style[] {
  if (selected) {
    return [
      new Style({ stroke: new Stroke({ color: INK, width: 7, lineCap: 'round', lineJoin: 'round' }), zIndex: 20 }),
      new Style({ stroke: new Stroke({ color: CYAN, width: 4, lineCap: 'round', lineJoin: 'round' }), zIndex: 21 }),
    ]
  }
  const dash = profile === 'fastest' ? [10, 8] : profile === 'science' ? [2, 8] : [14, 6, 2, 6]
  return [
    new Style({ stroke: new Stroke({ color: 'rgba(232,238,245,0.75)', width: 2, lineDash: dash, lineCap: 'round' }), zIndex: 15 }),
  ]
}

export const abortStyle: StyleLike = [
  new Style({ stroke: new Stroke({ color: INK, width: 8 }), zIndex: 40 }),
  new Style({ stroke: new Stroke({ color: AMBER, width: 5, lineDash: [12, 8] }), zIndex: 41 }),
]

export const noGoStyle: StyleLike = new Style({
  stroke: new Stroke({ color: RED, width: 2, lineDash: [8, 6] }),
  fill: new Fill({ color: 'rgba(255,90,95,0.22)' }),
  zIndex: 10,
})

export const draftLineStyle: StyleLike = new Style({
  stroke: new Stroke({ color: AMBER, width: 3, lineDash: [6, 6] }),
  fill: new Fill({ color: 'rgba(255,176,32,0.15)' }),
  zIndex: 45,
})

export const draftPointStyle: StyleLike = new Style({
  image: new CircleStyle({ radius: 5, fill: new Fill({ color: AMBER }), stroke: new Stroke({ color: INK, width: 2 }) }),
  zIndex: 46,
})

export const profileLineStyle: StyleLike = [
  new Style({ stroke: new Stroke({ color: INK, width: 6 }), zIndex: 22 }),
  new Style({ stroke: new Stroke({ color: AMBER, width: 3, lineDash: [4, 6] }), zIndex: 23 }),
]

export function walkerStyle(heading: number, reducedMotion: boolean): Style[] {
  return [
    new Style({
      image: new CircleStyle({ radius: reducedMotion ? 12 : 14, stroke: new Stroke({ color: CYAN, width: 2 }), fill: new Fill({ color: 'rgba(34,211,238,0.18)' }) }),
      zIndex: 50,
    }),
    new Style({
      image: new RegularShape({
        points: 3,
        radius: 9,
        rotation: (heading * Math.PI) / 180,
        fill: new Fill({ color: WHITE }),
        stroke: new Stroke({ color: INK, width: 2 }),
      }),
      text: label('EVA-1', 26, WHITE),
      zIndex: 51,
    }),
  ]
}

export function buddyStyle(): Style[] {
  return [
    new Style({
      image: new CircleStyle({ radius: 8, fill: new Fill({ color: AMBER }), stroke: new Stroke({ color: INK, width: 2 }) }),
      text: label('EVA-2', 22, AMBER),
      zIndex: 49,
    }),
  ]
}

export const pointerHighlight = new Style({
  image: new CircleStyle({ radius: 4, stroke: new Stroke({ color: WHITE, width: 1 }) }),
})

/** Point where a direct walk back no longer fits the remaining time budget. */
export const pnrStyle: StyleLike = [
  new Style({
    image: new RegularShape({ points: 4, radius: 9, angle: 0, fill: new Fill({ color: INK }), stroke: new Stroke({ color: AMBER, width: 3 }) }),
    text: label('PNR', -18, AMBER),
    zIndex: 35,
  }),
]
