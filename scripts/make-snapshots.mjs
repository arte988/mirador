// Capture fallback snapshots of the NASA feeds for offline demos: public/snapshots/{weather,donki}.json
// Usage: NASA_API_KEY=... node scripts/make-snapshots.mjs   (DEMO_KEY is used when the variable is unset)
// Snapshots are labeled source:"snapshot" so the UI never presents them as live data.
import { mkdirSync, writeFileSync } from 'node:fs'
import { getDonki, getImages, getWeather } from '../api/_nasa.ts'

mkdirSync('public/snapshots', { recursive: true })
const weather = { ...(await getWeather()), source: 'snapshot' }
writeFileSync('public/snapshots/weather.json', JSON.stringify(weather, null, 1))
console.log('weather: latest sol', weather.rows[0].sol, weather.rows[0].terrestrial_date)
try {
  const donki = { ...(await getDonki()), source: 'snapshot' }
  writeFileSync('public/snapshots/donki.json', JSON.stringify(donki, null, 1))
  console.log('donki: sep', donki.sep.length, 'notifications', donki.notifications.length, 'mars impacts', donki.marsImpacts.length)
} catch (e) {
  console.error('donki snapshot failed:', e instanceof Error ? e.message : e)
  process.exitCode = 1
}

// One image sol from each of phases 1, 3 and 4: https://science.nasa.gov/blog/curiosity-blog-sols-4804-4811-kicking-off-the-final-phase-of-boxwork-exploration/
for (const [mission, sol] of [['msl', 4550], ['msl', 4700], ['msl', 4820], ['mars2020', 2031]]) {
  try {
    const img = { ...(await getImages(mission, sol)), source: 'snapshot' }
    writeFileSync(`public/snapshots/images-${mission}-${sol}.json`, JSON.stringify(img))
    console.log(`images ${mission} sol ${sol}:`, img.images.length, 'of', img.total)
  } catch (e) {
    console.error(`images ${mission} ${sol} failed:`, e instanceof Error ? e.message : e)
    process.exitCode = 1
  }
}
