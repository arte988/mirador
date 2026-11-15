import { create } from 'zustand'
import { LiveSession, type LiveErrorCode, type LiveStatus, type Transcript } from './liveClient.ts'
import { MicrophoneCapture, PcmPlayer } from './audio.ts'
import { associateEvidence, type EvidenceLine } from './evidence.ts'
import type { ToolLogEntry } from './toolLog.ts'

export type OutputItem = { type: 'audio'; samples: Int16Array } | { type: 'transcript'; transcript: Transcript }
export type OutputGate = (item: OutputItem, deliver: (item: OutputItem) => void) => void
export const immediateOutput: OutputGate = (item, deliver) => deliver(item)
export type TranscriptLine = EvidenceLine
interface CopilotState {
  status: LiveStatus
  transcript: TranscriptLine[]
  mode: 'voice' | 'text'
  muted: boolean
  lastError: LiveErrorCode | 'microphone' | null
  outputGate: OutputGate
  setOutputGate: (gate: OutputGate) => void
  setMuted: (muted: boolean) => void
  start: () => Promise<void>
  stop: () => void
  sendText: (text: string) => void
  pttDown: () => void
  pttUp: () => void
}

let session: LiveSession | null = null
let microphone: MicrophoneCapture | null = null
let player: PcmPlayer | null = null
let sessionGeneration = 0
let lineId = 0
let pendingEvidence: ToolLogEntry[] = []

export const useCopilot = create<CopilotState>((set, get) => ({
  status: 'idle', transcript: [], mode: 'text', muted: false, lastError: null, outputGate: immediateOutput,
  setOutputGate: (outputGate) => set({ outputGate }),
  setMuted: (muted) => { set({ muted }); if (muted) player?.flush() },
  start: async () => {
    if (session) return
    const generation = ++sessionGeneration
    const current = new LiveSession(); session = current
    pendingEvidence = []
    current.on('onStatus', (status) => { if (generation === sessionGeneration) set({ status }) })
    current.on('onError', (error) => { if (generation === sessionGeneration) set({ lastError: error.code }) })
    current.on('onInterrupted', () => { if (generation === sessionGeneration) player?.flush() })
    current.on('onToolCall', (call, result) => {
      if (generation === sessionGeneration) pendingEvidence.push({ id: call.id, at: Date.now(), name: call.name, args: call.args, result })
    })
    const deliver = (item: OutputItem) => {
      if (generation !== sessionGeneration) return
      if (item.type === 'audio') { if (!get().muted) { player ??= new PcmPlayer(); player.play(item.samples) }; return }
      const t = item.transcript
      set((state) => {
        const updated = associateEvidence(state.transcript, t, pendingEvidence, String(++lineId))
        pendingEvidence = updated.pending
        return { transcript: updated.lines }
      })
    }
    current.on('onAudio', (samples) => get().outputGate({ type: 'audio', samples }, deliver))
    current.on('onTranscript', (transcript) => get().outputGate({ type: 'transcript', transcript }, deliver))
    set({ lastError: null, mode: 'text' })
    try { await current.connect() } catch { if (session === current) { session = null; current.close() }; return }
    if (generation !== sessionGeneration) return
    const mic = new MicrophoneCapture(); microphone = mic
    try {
      await mic.open((pcm) => { if (generation === sessionGeneration && current.status === 'listening') current.sendAudioChunk(pcm) })
      if (generation !== sessionGeneration) { await mic.close(); return }
      set({ mode: 'voice' })
    } catch { if (generation === sessionGeneration) { microphone = null; set({ mode: 'text', lastError: 'microphone' }) } }
  },
  stop: () => { ++sessionGeneration; pendingEvidence = []; session?.close(); session = null; void microphone?.close(); microphone = null; void player?.close(); player = null; set({ status: 'closed' }) },
  sendText: (text) => {
    if (!text.trim() || !session) return
    pendingEvidence = []
    session.sendText(text)
    set((state) => ({ transcript: [...state.transcript, { id: String(++lineId), role: 'user', text, final: true, evidence: [] }] }))
  },
  pttDown: () => { if (session && microphone) { pendingEvidence = []; session.startTalking(); microphone.start() } },
  pttUp: () => { if (session && microphone) { microphone.stop(); session.stopTalking() } },
}))
