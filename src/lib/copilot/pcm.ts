/** PCM helpers use explicit little-endian encoding for Gemini Live. */
export function floatToInt16(input: Float32Array): Int16Array {
  return Int16Array.from(input, (sample) => {
    const n = Math.max(-1, Math.min(1, sample))
    return Math.round(n < 0 ? n * 32768 : n * 32767)
  })
}

/** Linear interpolation for a complete buffer; streaming capture preserves its fractional position separately. */
export function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (!input.length || from <= 0 || to <= 0) return new Float32Array()
  const result = new Float32Array(Math.floor(input.length * to / from))
  for (let i = 0; i < result.length; i++) {
    const x = i * from / to, a = Math.floor(x), b = Math.min(a + 1, input.length - 1)
    result[i] = input[a] + (input[b] - input[a]) * (x - a)
  }
  return result
}

export function encodePcm(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2), view = new DataView(bytes.buffer)
  samples.forEach((v, i) => view.setInt16(i * 2, v, true))
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}
export function decodePcm(data: string): Int16Array {
  const binary = atob(data)
  if (binary.length % 2) throw new Error('invalid PCM')
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0)), view = new DataView(bytes.buffer)
  return Int16Array.from({ length: bytes.length / 2 }, (_, i) => view.getInt16(i * 2, true))
}
export function chunkPcm(samples: Int16Array, size: number): Int16Array[] {
  if (!Number.isInteger(size) || size <= 0) throw new Error('invalid chunk size')
  const out: Int16Array[] = []
  for (let i = 0; i < samples.length; i += size) out.push(samples.slice(i, i + size))
  return out
}
