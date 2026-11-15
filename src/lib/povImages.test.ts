import { describe, expect, it } from 'vitest'
import { IMAGES_MAX, IMAGES_PER_CAMERA, isMission, isSol, normalizeImages } from '../../api/_nasa.ts'
import { BOXWORK_SOL_RANGE } from '../data/sites.ts'
import { cameraLabel, SOL_RANGE } from './povImages.ts'

const img = (n: number, camera: string, utc = `2025-04-04T0${n % 10}:00:00`) => ({
  sol: 4500,
  imageid: `id${n}`,
  camera: { instrument: camera },
  credit: 'NASA/JPL-Caltech/MSSS',
  date_taken_utc: utc,
  link: `https://mars.nasa.gov/raw/${n}`,
  image_files: { small: `https://x/s${n}.jpg`, medium: `https://x/m${n}.jpg`, large: `https://x/l${n}.jpg` },
})

describe('normalizeImages', () => {
  it('keeps a few images per camera, oldest first', () => {
    const raw = { sol: 4500, num_images: 40, images: Array.from({ length: 12 }, (_, i) => img(i, i < 9 ? 'NAV_LEFT_B' : 'MAST_LEFT')) }
    const p = normalizeImages(raw, 'msl', 4500, 1)
    expect(p.images.filter((i) => i.camera === 'NAV_LEFT_B')).toHaveLength(IMAGES_PER_CAMERA)
    expect(p.images.filter((i) => i.camera === 'MAST_LEFT')).toHaveLength(3)
    expect(p.total).toBe(40)
    expect(p.images.map((i) => i.utc)).toEqual([...p.images.map((i) => i.utc)].sort())
    expect(p.source).toBe('live')
  })
  it('never returns more than the cap', () => {
    const raw = { images: Array.from({ length: 100 }, (_, i) => img(i, `CAM_${i}`)) }
    expect(normalizeImages(raw, 'msl', 4500).images.length).toBe(IMAGES_MAX)
  })
  it('drops entries without a usable https thumbnail', () => {
    const bad = { ...img(1, 'X'), image_files: { small: 'http://insecure/s.jpg', medium: 'https://x/m.jpg' } }
    expect(normalizeImages({ images: [bad, img(2, 'Y')] }, 'msl', 4500).images.map((i) => i.id)).toEqual(['id2'])
  })
  it('never shows images from another sol (the feed answers with the latest list when a sol is empty)', () => {
    const generic = { total_images: 99, images: [{ ...img(1, 'NAV_LEFT_B'), sol: 5073 }, { ...img(2, 'NAV_LEFT_B'), sol: 5072 }] }
    const p = normalizeImages(generic, 'msl', 4520, 1)
    expect(p.images).toEqual([])
    expect(p.total).toBe(0)
  })
  it('rejects a payload without an images array', () => {
    expect(() => normalizeImages({ nope: true }, 'msl', 1)).toThrow()
    expect(() => normalizeImages(null, 'msl', 1)).toThrow()
  })
})

describe('request validation and labels', () => {
  it('defaults to the documented campaign with a phase 3 starting sol', () => {
    expect(BOXWORK_SOL_RANGE).toEqual({ min: 4534, max: 4844 })
    expect(SOL_RANGE.msl).toEqual({ ...BOXWORK_SOL_RANGE, initial: 4700 })
    expect(SOL_RANGE.msl.initial).toBeGreaterThanOrEqual(4600)
    expect(SOL_RANGE.msl.initial).toBeLessThanOrEqual(4805)
  })
  it('accepts only known missions and sane sols', () => {
    expect(isMission('msl')).toBe(true)
    expect(isMission('mars2020')).toBe(true)
    expect(isMission('../etc')).toBe(false)
    expect(isSol(4500)).toBe(true)
    expect(isSol(-1)).toBe(false)
    expect(isSol(1.5)).toBe(false)
    expect(isSol(Number('abc'))).toBe(false)
  })
  it('labels cameras and falls back to the published code', () => {
    expect(cameraLabel('NAV_RIGHT_B')).toBe('Navcam right')
    expect(cameraLabel('MAST_LEFT')).toBe('Mastcam left')
    expect(cameraLabel('WEIRD_CAM')).toBe('WEIRD_CAM')
  })
})
