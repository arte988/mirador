import { floatToInt16 } from './pcm.ts'

/** Streaming linear resampler; retains fractional phase between audio callbacks. */
class CaptureResampler {
  private buffer = new Float32Array()
  private position = 0
  private output: number[] = []
  private rate: number
  private onChunk: (chunk: Int16Array) => void
  constructor(rate: number, onChunk: (chunk: Int16Array) => void) { this.rate = rate; this.onChunk = onChunk }
  push(input: Float32Array) {
    const joined = new Float32Array(this.buffer.length + input.length)
    joined.set(this.buffer); joined.set(input, this.buffer.length); this.buffer = joined
    const step = this.rate / 16000
    while (this.position + 1 < this.buffer.length) {
      const i = Math.floor(this.position), fraction = this.position - i
      this.output.push(this.buffer[i] + (this.buffer[i + 1] - this.buffer[i]) * fraction)
      this.position += step
      if (this.output.length === 1600) { this.onChunk(floatToInt16(Float32Array.from(this.output))); this.output = [] }
    }
    const consumed = Math.min(Math.floor(this.position), this.buffer.length - 1)
    this.buffer = this.buffer.slice(consumed); this.position -= consumed
  }
  reset() { this.buffer = new Float32Array(); this.position = 0; this.output = [] }
  finish() { if (this.output.length) this.onChunk(floatToInt16(Float32Array.from(this.output))); this.reset() }
}

export class MicrophoneCapture {
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private processor: AudioWorkletNode | ScriptProcessorNode | null = null
  private sink: GainNode | null = null
  private resampler: CaptureResampler | null = null
  private active = false
  async open(onChunk: (data: Int16Array) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.AudioContext) throw new Error('microphone unsupported')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })
    this.stream = stream
    try {
      const context = new AudioContext()
      this.context = context
      const source = context.createMediaStreamSource(stream)
      this.resampler = new CaptureResampler(context.sampleRate, onChunk)
      const consume = (data: Float32Array) => { if (this.active) this.resampler?.push(data) }
      if (context.audioWorklet && globalThis.AudioWorkletNode) {
        try {
          await context.audioWorklet.addModule('/copilot/capture-worklet.js')
          const processor = new AudioWorkletNode(context, 'capture-processor')
          processor.port.onmessage = (e: MessageEvent<Float32Array>) => consume(e.data)
          this.processor = processor
        } catch { /* use the legacy fallback below */ }
      }
      if (!this.processor) {
        const processor = context.createScriptProcessor(4096, 1, 1)
        processor.onaudioprocess = (e) => consume(e.inputBuffer.getChannelData(0))
        this.processor = processor
      }
      this.sink = context.createGain(); this.sink.gain.value = 0
      source.connect(this.processor); this.processor.connect(this.sink); this.sink.connect(context.destination)
      await context.resume()
    } catch (error) { await this.close(); throw error }
  }
  start() { this.resampler?.reset(); this.active = true; void this.context?.resume() }
  stop() { this.active = false; this.resampler?.finish() }
  async close() {
    this.active = false; this.resampler?.reset(); this.processor?.disconnect(); this.sink?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    if (this.context && this.context.state !== 'closed') await this.context.close()
    this.context = null; this.stream = null; this.processor = null; this.sink = null; this.resampler = null
  }
}

export class PcmPlayer {
  private context: AudioContext | null = null
  private nextTime = 0
  private nodes = new Set<AudioBufferSourceNode>()
  onIdle: () => void = () => {}
  play(samples: Int16Array) {
    if (!samples.length) return
    this.context ??= new AudioContext()
    const ctx = this.context
    void ctx.resume()
    const buffer = ctx.createBuffer(1, samples.length, 24000)
    const channel = buffer.getChannelData(0)
    samples.forEach((v, i) => { channel[i] = v / 32768 })
    const node = ctx.createBufferSource(); node.buffer = buffer; node.connect(ctx.destination)
    const start = Math.max(ctx.currentTime, this.nextTime)
    this.nextTime = start + buffer.duration
    this.nodes.add(node)
    node.onended = () => { this.nodes.delete(node); if (!this.nodes.size) this.onIdle() }
    node.start(start)
  }
  flush() {
    for (const node of this.nodes) { node.onended = null; node.stop(); node.disconnect() }
    this.nodes.clear(); this.nextTime = 0; this.onIdle()
  }
  async close() { this.flush(); if (this.context && this.context.state !== 'closed') await this.context.close(); this.context = null }
}
