import { create } from 'zustand'
import { LiveSession, type LiveErrorCode, type LiveStatus, type Transcript } from './liveClient.ts'
import { MicrophoneCapture, PcmPlayer } from './audio.ts'
import { associateEvidence, type EvidenceLine } from './evidence.ts'
import type { ToolLogEntry } from './toolLog.ts'
import { DelayGate } from './delayGate.ts'
import { oneWayDelayMinutes } from '../commsDelay.ts'
import { useMissionStore } from '../../stores/useMissionStore.ts'
import { useCopilotStore } from './proposal.ts'
import { useProposalVisibility } from './visibility.ts'
import { needsFallback, runFallback, type FallbackResults } from './fallback.ts'

export type OutputItem = { type: 'audio'; samples: Int16Array } | { type: 'transcript'; transcript: Transcript } | { type: 'evidence'; entry: ToolLogEntry }
export type OutputGate = (item: OutputItem, deliver: (item: OutputItem) => void) => void
export const immediateOutput: OutputGate = (item, deliver) => deliver(item)
export type TranscriptLine = EvidenceLine
interface CopilotState {
  status: LiveStatus
  transcript: TranscriptLine[]
  mode: 'voice' | 'text'
  muted: boolean
  lastError: LiveErrorCode | 'microphone' | null
  commsMode: 'earth' | 'onboard'
  delay: { deadline: number; realRttS: number } | null
  visibleCalls: ToolLogEntry[]
  fallback: FallbackResults | null
  fallbackLoading: boolean
  outputGate: OutputGate
  setOutputGate: (gate: OutputGate) => void
  setMuted: (muted: boolean) => void
  setCommsMode: (mode: 'earth' | 'onboard') => void
  checkFallback: () => Promise<void>
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
let recording = false
let recordingOutput: { item: OutputItem; deliver: (item: OutputItem) => void }[] = []
let fallbackVersion = 0
const gate = new DelayGate<OutputItem>({ now: Date.now, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (timer) => clearTimeout(timer) }, () => useCopilot.setState({ delay: null }))
const delayedOutput: OutputGate = (item, deliver) => gate.deliver(item, deliver)

function beginRequest(mode: CopilotState['commsMode']) {
  if (mode === 'onboard') return
  const st = useMissionStore.getState()
  const now = Date.now()
  const simTime = st.scenarioTimeMs === null ? now : st.scenarioTimeMs + st.elapsedS * 1000
  const realRttS = oneWayDelayMinutes(new Date(simTime)) * 120
  const deadline = gate.begin(realRttS * 1000 / 60)
  useCopilot.setState({ delay: { deadline, realRttS } })
}

export const useCopilot = create<CopilotState>((set, get) => ({
  status: 'idle', transcript: [], mode: 'text', muted: false, lastError: null, outputGate: immediateOutput,
  commsMode: 'onboard', delay: null, visibleCalls: [], fallback: null, fallbackLoading: false,
  setOutputGate: (outputGate) => set({ outputGate }),
  setCommsMode: (commsMode) => { if (!get().delay && !recording && !['thinking', 'speaking', 'connecting'].includes(get().status)) set({ commsMode, outputGate: commsMode === 'earth' ? delayedOutput : immediateOutput }) },
  checkFallback: async () => {
    const version = ++fallbackVersion
    set({ fallbackLoading: true })
    const fallback = await runFallback()
    if (version === fallbackVersion) set({ fallback, fallbackLoading: false })
  },
  setMuted: (muted) => { set({ muted }); if (muted) player?.flush() },
  start: async () => {
    if (session) return
    const generation = ++sessionGeneration
    const current = new LiveSession(); session = current
    pendingEvidence = []
    current.on('onStatus', (status) => { if (generation === sessionGeneration) set({ status }) })
    current.on('onError', (error) => {
      if (generation !== sessionGeneration) return
      gate.cancel(); recording = false; recordingOutput = []; pendingEvidence = []
      set({ lastError: error.code, delay: null })
      if (needsFallback(error.code)) void get().checkFallback()
    })
    current.on('onInterrupted', () => { if (generation === sessionGeneration) player?.flush() })
    const deliver = (item: OutputItem) => {
      if (generation !== sessionGeneration) return
      if (item.type === 'evidence') {
        pendingEvidence.push(item.entry)
        set((s) => ({ visibleCalls: [...s.visibleCalls, item.entry].slice(-50) }))
        if (item.entry.name === 'propose_abort' && item.entry.result.ok) useProposalVisibility.getState().reveal(useCopilotStore.getState().pendingAbort)
        return
      }
      if (item.type === 'audio') { if (!get().muted) { player ??= new PcmPlayer(); player.play(item.samples) }; return }
      const t = item.transcript
      set((state) => {
        const updated = associateEvidence(state.transcript, t, pendingEvidence, String(++lineId))
        pendingEvidence = updated.pending
        return { transcript: updated.lines }
      })
    }
    const enqueue = (item: OutputItem) => {
      if (recording && get().commsMode === 'earth') recordingOutput.push({ item, deliver })
      else get().outputGate(item, deliver)
    }
    current.on('onToolCall', (call, result) => enqueue({ type: 'evidence', entry: { id: call.id, at: Date.now(), name: call.name, args: call.args, result } }))
    current.on('onAudio', (samples) => enqueue({ type: 'audio', samples }))
    current.on('onTranscript', (transcript) => enqueue({ type: 'transcript', transcript }))
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
  stop: () => { ++sessionGeneration; gate.cancel(); recording = false; recordingOutput = []; pendingEvidence = []; session?.close(); session = null; void microphone?.close(); microphone = null; void player?.close(); player = null; set({ status: 'closed', delay: null }) },
  sendText: (text) => {
    if (!text.trim() || !session || get().delay || !['ready', 'speaking'].includes(get().status)) return
    pendingEvidence = []
    beginRequest(get().commsMode)
    session.sendText(text)
    set((state) => ({ transcript: [...state.transcript, { id: String(++lineId), role: 'user', text, final: true, evidence: [] }] }))
  },
  pttDown: () => { if (session && microphone && !get().delay && ['ready', 'speaking'].includes(get().status)) { pendingEvidence = []; recording = true; recordingOutput = []; session.startTalking(); microphone.start() } },
  pttUp: () => {
    if (!session || !microphone || !recording) return
    beginRequest(get().commsMode)
    recording = false
    for (const entry of recordingOutput) get().outputGate(entry.item, entry.deliver)
    recordingOutput = []
    microphone.stop(); session.stopTalking()
  },
}))
