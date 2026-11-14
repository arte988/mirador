/**
 * Writes the PWA PNG icons from the same visor mark as public/favicon.svg (no extra deps).
 * Usage: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function paint(x, y, n, maskable) {
  const bg = [5, 7, 10]
  const go = [34, 211, 238]
  const fill = [19, 27, 37]
  const fg = [232, 238, 245]
  const cx = n / 2
  const cy = n / 2
  const r = (n / 2) * (maskable ? 0.58 : 0.68)
  const dx = x + 0.5 - cx
  const dy = y + 0.5 - cy
  const d = Math.hypot(dx, dy)
  const stroke = n * (maskable ? 0.04 : 0.042)
  if (d > r) return bg
  if (d > r - stroke) return go
  if (Math.abs(dy - n * 0.02) < n * 0.055 && Math.abs(dx) < r * 0.72) return go
  if (Math.hypot(dx, dy + r * 0.32) < n * 0.045) return fg
  return fill
}

function png(size, maskable) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = paint(x, y, size, maskable)
      const i = row + 1 + x * 3
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync(join(outDir, 'pwa-192.png'), png(192, false))
writeFileSync(join(outDir, 'pwa-512.png'), png(512, false))
writeFileSync(join(outDir, 'pwa-maskable-512.png'), png(512, true))
writeFileSync(join(root, 'public', 'apple-touch-icon.png'), png(180, false))
console.log('wrote public/icons/pwa-{192,512,maskable-512}.png and public/apple-touch-icon.png')
