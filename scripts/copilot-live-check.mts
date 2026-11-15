// Optional manual smoke test. Supply the key in the process environment; never print credentials.
import { mintLiveToken } from '../api/_copilot.ts'
import { LiveSession } from '../src/lib/copilot/liveClient.ts'

const key = process.env.GEMINI_API_KEY
if (!key) throw new Error('Set the server key before running this manual check')
let issuedToken = ''
const redact = (s: string) => s.split(key).join('[redacted]').split(issuedToken || '\u0000').join('[redacted]').replace(/auth_tokens\/[\w-]+/g, '[redacted]')
const session = new LiveSession({
  fetchToken: async () => {
    const result = await mintLiveToken({ GEMINI_API_KEY: key })
    if (result.status !== 200) throw new Error('token minting failed')
    issuedToken = result.body.token
    return result.body
  },
  executeTool: async () => ({ ok: false, value: null, source: 'Manual test stub', ageS: null, note: 'Data unavailable in this test.' }),
})
session.on('onStatus', (s) => console.log('status:', s))
session.on('onToolCall', (call) => console.log('tool:', redact(call.name)))
session.on('onTranscript', (t) => { if (t.final) console.log('transcript:', redact(t.text)) })
try {
  await session.connect()
  session.sendText('What is the current safety status? Use your tools.')
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 60000)
    session.on('onTranscript', (t) => { if (t.role === 'capcom' && t.final) { clearTimeout(timeout); resolve() } })
  })
} finally { session.close() }
