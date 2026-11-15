import { buildLiveSetup } from '../../../api/_copilot.ts'
import { executeToolCall, type ToolResult } from './tools.ts'
import { decodePcm, encodePcm } from './pcm.ts'

export type LiveStatus = 'idle' | 'connecting' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error' | 'closed'
export type LiveErrorCode = 'no_key' | 'rate_limit' | 'forbidden' | 'network' | 'upstream' | 'protocol' | 'timeout' | 'closed'
export class LiveError extends Error {
  code: LiveErrorCode
  constructor(code: LiveErrorCode) { super(code); this.code = code }
}
export interface SocketLike {
  readyState: number
  send(data: string): void
  close(): void
  onopen: ((event: Event) => void) | null
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onclose: ((event: CloseEvent) => void) | null
}
export type ToolCall = { id: string; name: string; args: unknown }
export type Transcript = { role: 'user' | 'capcom'; text: string; final: boolean }
export interface LiveEvents {
  onStatus: (status: LiveStatus) => void
  onTranscript: (value: Transcript) => void
  onAudio: (value: Int16Array) => void
  onInterrupted: () => void
  onToolCall: (call: ToolCall, result: ToolResult) => void
  onError: (error: LiveError) => void
}
export interface LiveDependencies {
  fetchToken: () => Promise<{ token: string; model: string }>
  createSocket: (url: string) => SocketLike
  executeTool: (call: ToolCall) => Promise<ToolResult>
  now: () => number
  setupTimeoutMs: number
}

export async function fetchLiveToken(): Promise<{ token: string; model: string }> {
  let response: Response
  try { response = await fetch('/api/live-token', { method: 'POST', cache: 'no-store' }) } catch { throw new LiveError('network') }
  if (!response.ok) {
    if (response.status === 503) {
      const body = await response.json().catch(() => null) as { error?: string } | null
      throw new LiveError(body?.error === 'no_key' ? 'no_key' : 'upstream')
    }
    throw new LiveError(response.status === 429 ? 'rate_limit' : response.status === 403 ? 'forbidden' : 'upstream')
  }
  const body: unknown = await response.json().catch(() => null)
  const token = body as { token?: unknown; model?: unknown } | null
  if (typeof token?.token !== 'string' || !token.token || typeof token.model !== 'string') throw new LiveError('upstream')
  return { token: token.token, model: token.model }
}

const endpoint = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained'
type Message = Record<string, any>
export class LiveSession {
  status: LiveStatus = 'idle'
  private deps: LiveDependencies
  private listeners: { [K in keyof LiveEvents]: Set<LiveEvents[K]> } = { onStatus: new Set(), onTranscript: new Set(), onAudio: new Set(), onInterrupted: new Set(), onToolCall: new Set(), onError: new Set() }
  private socket: SocketLike | null = null
  private closed = false
  private retryUsed = false
  private handle: string | null = null
  private pending = new Set<string>()
  private waitingForAnswer = false
  private answerStarted = false
  private text = { user: '', capcom: '' }
  private generation = 0
  private connecting: Promise<void> | null = null
  private cancelSetup: (() => void) | null = null
  private frames: Promise<void> = Promise.resolve()
  constructor(deps: Partial<LiveDependencies> = {}) {
    this.deps = { fetchToken: fetchLiveToken, createSocket: (url) => new WebSocket(url) as SocketLike, executeTool: executeToolCall, now: Date.now, setupTimeoutMs: 15000, ...deps }
  }
  on<K extends keyof LiveEvents>(event: K, callback: LiveEvents[K]): () => void {
    this.listeners[event].add(callback)
    return () => { this.listeners[event].delete(callback) }
  }
  private emit<K extends keyof LiveEvents>(event: K, ...args: Parameters<LiveEvents[K]>) {
    for (const fn of this.listeners[event]) (fn as (...values: Parameters<LiveEvents[K]>) => void)(...args)
  }
  private setStatus(status: LiveStatus) { this.status = status; this.emit('onStatus', status) }
  private error(code: LiveErrorCode) { const e = new LiveError(code); this.emit('onError', e); return e }
  connect(): Promise<void> {
    if (this.connecting) return this.connecting
    if (this.status === 'ready') return Promise.resolve()
    this.closed = false
    this.retryUsed = false
    const p = this.open(false)
    this.connecting = p
    void p.finally(() => { if (this.connecting === p) this.connecting = null }).catch(() => {})
    return p
  }
  private async open(resume: boolean): Promise<void> {
    this.setStatus('connecting')
    const generation = ++this.generation
    let token: { token: string; model: string }
    try { token = await this.deps.fetchToken() } catch (e) {
      if (this.closed || generation !== this.generation) throw new LiveError('closed')
      this.setStatus('error'); throw this.error(e instanceof LiveError ? e.code : 'network')
    }
    if (this.closed || generation !== this.generation) throw new LiveError('closed')
    const setup = buildLiveSetup()
    // The token locks setup on the server. A handle is attempted here, but may be ignored by constrained setup.
    // https://ai.google.dev/api/live#SessionResumptionConfig
    if (resume && this.handle) setup.sessionResumption = { handle: this.handle }
    return new Promise<void>((resolve, reject) => {
      let settled = false
      let established = false
      const finish = (error?: LiveError) => {
        if (settled) return
        settled = true; clearTimeout(timer); this.cancelSetup = null
        if (error) { if (!this.closed) { this.setStatus('error'); this.emit('onError', error) }; reject(error) } else resolve()
      }
      const timer = setTimeout(() => { finish(new LiveError('timeout')); socket.close() }, this.deps.setupTimeoutMs)
      this.cancelSetup = () => finish(new LiveError('closed'))
      let socket: SocketLike
      try { socket = this.deps.createSocket(`${endpoint}?access_token=${encodeURIComponent(token.token)}`) } catch { finish(new LiveError('network')); return }
      this.socket = socket
      socket.onopen = () => { if (!this.closed && generation === this.generation) socket.send(JSON.stringify({ setup })) }
      socket.onmessage = (event) => {
        this.frames = this.frames.then(async () => {
          if (this.closed || generation !== this.generation) return
          let message: Message
          try {
            const data: unknown = event.data
            const raw = typeof data === 'string' ? data : data instanceof ArrayBuffer ? new TextDecoder().decode(data) : data instanceof Blob ? await data.text() : ''
            if (!raw.trim()) return
            message = JSON.parse(raw) as Message
            if (!message || typeof message !== 'object' || Array.isArray(message)) return
          } catch { this.error('protocol'); return }
          if (message.setupComplete && !settled) { established = true; this.setStatus('ready'); finish(); return }
          if (settled) this.handleMessage(message, generation)
        }).catch(() => { this.error('protocol') })
      }
      socket.onerror = () => { if (!settled) finish(new LiveError('network')) }
      socket.onclose = () => {
        if (generation !== this.generation || this.closed) return
        if (!settled) { finish(new LiveError('closed')); return }
        if (established) this.reconnect()
      }
    })
  }
  private reconnect() {
    if (this.closed) return
    if (this.retryUsed || !this.handle) { ++this.generation; this.socket?.close(); this.socket = null; this.setStatus('closed'); this.error('closed'); return }
    this.retryUsed = true
    this.pending.clear(); this.waitingForAnswer = false
    const old = this.socket
    this.socket = null
    ++this.generation
    old?.close()
    void this.open(true).catch(() => { if (!this.closed) this.setStatus('closed') })
  }
  private send(message: unknown) {
    if (!this.socket || this.socket.readyState !== 1 || this.closed) throw new LiveError('closed')
    this.socket.send(JSON.stringify(message))
  }
  sendText(text: string) { this.send({ realtimeInput: { text } }); this.setStatus('thinking') }
  startTalking() { if (this.status === 'speaking') this.emit('onInterrupted'); this.send({ realtimeInput: { activityStart: {} } }); this.setStatus('listening') }
  sendAudioChunk(pcm: Int16Array) { if (this.status !== 'listening') throw new LiveError('closed'); this.send({ realtimeInput: { audio: { data: encodePcm(pcm), mimeType: 'audio/pcm;rate=16000' } } }) }
  stopTalking() { if (this.status !== 'listening') return; this.send({ realtimeInput: { activityEnd: {} } }); this.setStatus('thinking') }
  private handleMessage(message: Message, generation: number) {
    const update = message.sessionResumptionUpdate
    if (update?.resumable && typeof (update.newHandle ?? update.token) === 'string') this.handle = update.newHandle ?? update.token
    if (message.goAway) { this.reconnect(); return }
    if (Array.isArray(message.toolCallCancellation?.ids)) for (const id of message.toolCallCancellation.ids) this.pending.delete(id)
    const calls: unknown = message.toolCall?.functionCalls
    if (Array.isArray(calls)) {
      this.waitingForAnswer = true
      this.answerStarted = false
      this.setStatus('thinking')
      for (const c of calls) {
        if (typeof c?.id !== 'string' || typeof c?.name !== 'string') continue
        const call: ToolCall = { id: c.id, name: c.name, args: c.args ?? {} }
        this.pending.add(call.id)
        void Promise.resolve().then(() => this.deps.executeTool(call)).catch((): ToolResult => ({ ok: false, value: null, source: 'AEOLIS CAPCOM', ageS: null, note: 'tool error' })).then((result) => {
          if (this.closed || generation !== this.generation || !this.pending.delete(call.id)) return
          this.emit('onToolCall', call, result)
          this.send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result } }] } })
        }).catch(() => { this.error('protocol') })
      }
    }
    const content = message.serverContent
    if (!content || typeof content !== 'object') return
    if (content.modelTurn || content.outputTranscription) this.answerStarted = true
    if (content.interrupted) {
      this.emit('onInterrupted')
      if (this.text.capcom) this.emit('onTranscript', { role: 'capcom', text: this.text.capcom, final: true })
      this.text.capcom = ''
      if (this.status !== 'listening') this.setStatus('ready')
    }
    for (const [role, key] of [['user', 'inputTranscription'], ['capcom', 'outputTranscription']] as const) {
      const piece = content[key]?.text
      if (typeof piece === 'string' && piece) { this.text[role] += piece; this.emit('onTranscript', { role, text: this.text[role], final: false }) }
    }
    if (Array.isArray(content.modelTurn?.parts)) for (const part of content.modelTurn.parts) {
      if (typeof part?.inlineData?.data === 'string') {
        try { this.setStatus('speaking'); this.emit('onAudio', decodePcm(part.inlineData.data)) } catch { this.error('protocol') }
      }
    }
    if (content.turnComplete) {
      if (this.waitingForAnswer && (!this.answerStarted || this.pending.size > 0)) return
      this.waitingForAnswer = false; this.answerStarted = false
      for (const role of ['user', 'capcom'] as const) if (this.text[role]) { this.emit('onTranscript', { role, text: this.text[role], final: true }); this.text[role] = '' }
      if (this.status !== 'listening') this.setStatus('ready')
    }
  }
  close() {
    if (this.closed) return
    this.closed = true; ++this.generation; this.pending.clear(); this.cancelSetup?.(); this.socket?.close(); this.socket = null; this.setStatus('closed')
  }
}
