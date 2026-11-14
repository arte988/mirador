/**
 * Loads the NASA weather and DONKI feeds through our own proxy (/api/*), with this fallback order:
 *   1. live proxy response, 2. last cached copy in localStorage (flagged stale), 3. committed snapshot (flagged snapshot).
 * The UI always shows which of the three it is looking at.
 */
import type { WeatherPayload } from '../../api/_nasa.ts'
import { useMissionStore, type DataMode, type DataState, type WeatherFeed } from '../stores/useMissionStore.ts'
import { analogWeatherFromOpenMeteo, ANALOG_URL, simulatedSpace, simulatedWeather } from './demoData.ts'
import { fetchJSONCached } from './storage.ts'
import type { DonkiPayload } from './spaceWeather.ts'

const loading = <T>(prev: DataState<T>): DataState<T> =>
  prev ? { ...prev, loading: true } : { data: null, stale: false, savedAt: null, error: null, loading: true }

const modeIs = (m: DataMode) => useMissionStore.getState().dataMode === m

export async function refreshWeather(): Promise<void> {
  const st = useMissionStore.getState()
  st.setWeather(loading(st.weather))
  const res = await fetchJSONCached<WeatherFeed>('weather', ['/api/weather', '/snapshots/weather.json'], {
    transform: (raw) => {
      const p = raw as WeatherPayload
      if (!p || !Array.isArray(p.rows) || p.rows.length === 0) throw new Error('empty weather payload')
      return { rows: p.rows as unknown as WeatherFeed['rows'], source: p.source, fetchedAt: p.fetchedAt, disclaimer: p.disclaimer }
    },
  })
  if (!modeIs('live')) return // the user switched modes while this was loading
  useMissionStore.getState().setWeather({ ...res, loading: false })
}

/** Real current weather at an Earth analog site. Always labeled as Earth. */
export async function refreshAnalogWeather(): Promise<void> {
  const st = useMissionStore.getState()
  st.setWeather(loading(st.weather))
  const res = await fetchJSONCached<WeatherFeed>('analog-weather', [ANALOG_URL], { transform: (raw) => analogWeatherFromOpenMeteo(raw) })
  if (!modeIs('analog')) return
  useMissionStore.getState().setWeather({ ...res, loading: false })
}

export async function refreshSpace(): Promise<void> {
  const st = useMissionStore.getState()
  st.setSpace(loading(st.space))
  // Cache the raw payload (not the summary) so hours-since values stay correct when re-read later.
  const res = await fetchJSONCached<DonkiPayload>('donki', ['/api/donki', '/snapshots/donki.json'], {
    transform: (raw) => {
      const p = raw as DonkiPayload
      if (!p || !Array.isArray(p.notifications) || !Array.isArray(p.sep)) throw new Error('bad DONKI payload')
      return p
    },
  })
  if (modeIs('rehearsal')) return
  useMissionStore.getState().setSpace({ ...res, loading: false })
}

const done = <T>(data: T): DataState<T> => ({ data, stale: false, savedAt: Date.now(), error: null, loading: false })

/**
 * Refresh according to the data mode: live (real Mars weather + DONKI), analog (Earth weather at an analog
 * site + real DONKI) or rehearsal (everything simulated and calm).
 */
export async function refreshFeeds(): Promise<void> {
  const mode = useMissionStore.getState().dataMode
  if (mode === 'rehearsal') {
    const st = useMissionStore.getState()
    st.setWeather(done(simulatedWeather()))
    st.setSpace(done(simulatedSpace()))
    return
  }
  await Promise.all([mode === 'analog' ? refreshAnalogWeather() : refreshWeather(), refreshSpace()])
}

