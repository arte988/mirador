# MIRADOR

A dark, English-first visor and habitat console that stacks NASA data on a hyperlocal Mars map to plan a safe
science EVA on lower Mount Sharp (Gale crater, boxwork unit). NASA Space Apps prototype.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (Vitest)
npm run build
```

## Defaults

- The UI is **English** and **dark** on first load. Spanish is an optional toggle (EN | ES) remembered in
  `localStorage["mirador.lang"]`.
- Every visible string goes through `t()` (`src/i18n/en.ts` is the source, `src/i18n/es.ts` is typed against it).

## Gale forecast (TimesFM 2.5)

`scripts/climate/` builds one daily series from the unofficial MSL weather feed and, when TimesFM 2.5 is installed, writes `public/forecasts/gale.json`. A variable is a prediction only if its one-step error beats persistence. Ridge A–E share that single rover series. Dust opacity is not in the feed and is not invented. See `scripts/climate/README.md`.

## Data sources

| Source | What MIRADOR uses it as | Credit | Honesty |
| --- | --- | --- | --- |
| JPL Mars Trek WMTS | Optical (Curiosity CTX, HiRISE), thermal (THEMIS day and night), MOLA color hillshade | NASA/JPL-Caltech, MSSS, UA, ASU | MOLA 8-bit PNG is a picture, never meters. Missing tiles mean no coverage. |
| USGS MSL Gale DEM mosaic, 4 m crop | Numeric elevation, slope, hillshade, line of sight, routing | USGS Astrogeology, NASA/JPL/UA | Only this local DTM is read as meters (`public/dtm/`). |
| USGS SIM 3292 geologic map (tiles) | Regional units around Gale (AHi, Htu at this scale) | Tanaka et al. 2014, USGS | Scale 1:20,000,000. Regional context only. |
| Unofficial MSL REMS web feed | Weather at Gale (sol, T, P, UV, opacity) | NASA / Centro de Astrobiología | Outreach feed. Age of the last sol is shown. |
| NASA DONKI (via serverless proxy) | SEP, CME and related notifications | NASA CCMC | Heliophysics list, not a surface dosimeter. `NASA_API_KEY` stays server-side. |
| `mars.nasa.gov/rss/api/?feed=raw_images` | Raw rover images by sol | NASA/JPL-Caltech (MSL: MSSS) | Unofficial. Not a photo of the map point. Empty sols stay empty. |
| MSL RAD published GCR rate | Dose *reference* 0.64 mSv/day | Hassler et al. 2014, *Science* | Not a live dosimeter. No suit shielding. SEP = abort, not "budget it". |
| JPL SSD Keplerian elements (Standish) | Earth–Mars light delay | JPL SSD | Approximate (~0.01 AU vs Horizons). |
| Mars24 solar geometry | LTST, Sun elevation/azimuth, useful EVA window | Allison & McEwen | Planning model, not a flight clock. |
| Open-Meteo (MDRS, Utah) | Earth analog weather, **only** in Analog mode | Open-Meteo | Labeled Earth analog, never presented as Mars. |

NASA Worldview is an Earth tool: UX inspiration for the layer manager only. No Earth tiles are shown as Mars.

The optional THEMIS night layer is the 100 m Mars Odyssey mosaic `THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018`,
off by default. Its [Mars Trek GetCapabilities](https://trek.nasa.gov/tiles/Mars/EQ/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018/1.0.0/WMTSCapabilities.xml)
advertises PNG tiles in `default028mm`, zoom levels 0–9, and a longitude/latitude bbox of
(-179.9999997, -65.0006576) to (179.9998849, 65.0007535). Coverage may have gaps within that bbox.

## Local DTM

`public/dtm/gale_aoi_4m.{bin,json}` is a 4 m crop of the USGS "MSL Gale DEM Mosaic 1 m v3". It was produced by
`scripts/make-dtm.mjs` (range requests against the remote GeoTIFF, no 3.9 GB download).

Everything numeric about elevation and slope (profile line, route cost, line of sight) comes from this crop.
The 8-bit MOLA PNG shown from Mars Trek is a picture only and is never read as meters.

- Cells are 4 m. Heights are meters above the Mars 2000 areoid as published by USGS, stored as Int16 in 0.1 m steps.
- Slope uses Horn's 3x3 method with an effective baseline of about 8 m (suit scale, not per-pixel noise).
- To rebuild or move the crop: `node scripts/make-dtm.mjs west east south north factor`
  (defaults cover the lower Mount Sharp area, factor 4). Commit the two output files in `public/dtm/`.
- If the files are missing, the app says **"No local DTM loaded"** in the profile panel and in the cursor readout,
  and it does not invent elevation or slope. Routing and line of sight are unavailable in that case.

### Elevation profile

In the Plan view use **Draw profile line**, click 2 or more points on the map (or **Add point at crosshair**), then
**Finish**. The chart shows elevation along the line, colors each step by slope (cyan, amber from the caution
limit, red from the no-go limit, which are planning assumptions) and marks the steepest step.

## Route planning

The Plan view computes three routes (Safest, Fastest, Science) on an 8 m cost grid derived from the local DTM, in a
Web Worker so the UI never blocks. Blocked cells are slopes above the no-go limit, no-data cells and any no-go polygon
you draw. Changing a required stop, a no-go area or a planning assumption re-plans automatically.

- The **walk-back envelope** layer shows best-case round-trip time from the habitat: hourly cyan contours and an
  amber outline where the trip stops fitting the usable suit time. Each route card also shows the tightest walk-back
  margin and, when it exists, the point of no return (marked PNR on the map).
- All limits (caution slope, no-go slope, walking speed, time per stop, suit capacity, reserve) are planning
  assumptions shown in the panel. They are **not** NASA flight rules. Oxygen and battery are simulated.
- Stop coordinates are prototype picks from the local DTM, not official waypoints.


## Safety panel and data feeds

The browser never talks to NASA's weather or DONKI endpoints with a secret. It calls our own proxy:

- `api/weather.ts` and `api/donki.ts` are Vercel serverless functions backed by `api/_nasa.ts` (15 minute in-memory
  cache plus CDN `s-maxage`). `vite dev` serves the same two routes through a small middleware, so local and deployed
  behavior match.
- Set `NASA_API_KEY` on the server (see `.env.example`). `DEMO_KEY` works but is heavily rate limited. The key is
  never part of the client bundle.
- Fallback order in the app: live proxy, then the last cached copy (labeled "not refreshed"), then the committed
  snapshot in `public/snapshots/` (labeled "snapshot, not live"). Regenerate snapshots with
  `node scripts/make-snapshots.mjs`.
- A snapshot or a stale cache never turns the light green: space weather that cannot be confirmed counts as unknown (amber).

The semaphore rules are listed in the panel and in `src/lib/safety.ts` (SEP within 24 h is red, within 72 h amber,
solar notifications within 48 h amber, weather older than 7 days amber, daylight versus route need, and scenario
flags). They are prototype planning assumptions, not NASA flight rules. DONKI is a heliophysics event list and
model-run feed, not a radiation measurement at Gale. The Mars-impact rule uses WSA-ENLIL model estimates (to verify).

The **scenario injector** (dust storm, SEP alert, O2 leak) exists because live data is usually calm. Everything it
does is labeled as a simulation in the panel and in the safety badge.

### Data modes for demos

The safety panel has a **Data source** selector. Live Mars data is the default and the only mode that describes
the real situation. The other two exist so a demo can show a green light without faking anything:

- **Earth analog site (MDRS, Utah):** real current weather from Open-Meteo for a human-mission analog site, labeled
  "Earth analog, not Mars" in the card, the badge and a permanent banner. Space weather stays real, so the light
  can still be amber when the Sun is active.
- **Rehearsal:** simulated calm weather and no solar activity, labeled as simulated everywhere. Works offline.

Both set the EVA start to 10:00 local time at Gale if the Sun is down. The mode is remembered, and the banner stays
visible while it is on. DONKI via `DEMO_KEY` is rate limited (about 30 requests per hour per IP); set `NASA_API_KEY`
for anything beyond a quick test.

### Checkpoint: vertical slice rehearsal

Run through this before adding more features (about two minutes, works offline once the tiles are cached):

1. Open `/plan`, safety tab, pick **Rehearsal**. The light is green, the start is 10:00 local at Gale, and a banner says the data is simulated.
2. Route tab: three route cards (Safest, Fastest, Science) with distance, time, max slope, O2/battery (simulated), tightest walk-back margin and point of no return. The cyan isochrone envelope on the map shows where the walk-back limit lies.
3. Back on the safety tab inject **Dust storm** (amber) and **Oxygen leak** (red). Both are labeled as simulation, and the plan is recomputed with the scenario: walking speed x0.7 for dust, 50% of oxygen and suit time for the leak.
4. The **Abort decision** card on the route tab names the nearest refuge (habitat or support rover) from the worst point of the selected route and whether it still fits the budget. An SEP alert leaves the route unchanged and only turns the light red.
5. **Clear scenarios** restores the original plan.

Scenario effects are rehearsal assumptions, not NASA procedures.

### Geologic map layer (regional only)

The geology layer is the USGS-NASA global geologic map of Mars (Tanaka et al. 2014, USGS SIM 3292, 1:20,000,000),
served as tiles from the USGS Astrogeology ArcGIS service. The tile grid is built from the service's own
`MapServer?f=json` -> `tileInfo` (GCS Mars 2000, WKID 104971, origin (-180, 180), level 0 resolution 1.40625 deg/px,
levels 1 to 6 cached) in `src/lib/geologyGrid.ts`, and a test pins Gale to the tile that exists on the server.
Because the service uses the same sphere as our CRS, tiles are shown without warping.

At this scale only two units exist around Gale (AHi and Htu), which is why the layer carries a permanent warning,
a map caption and a legend. The legend (`src/data/geologyLegend.json`) is generated by
`node scripts/make-geology-legend.mjs` from the USGS feature layer, using the layer's own colors. It is context for
the region and cannot tell what a ridge, a boxwork or a footstep is made of.

### POV images (raw images by sol)

The **Images** tab shows raw rover images for a chosen sol, through `/api/images?mission=msl|mars2020&sol=N`
(Vercel function in `api/images.ts`, same code in the Vite dev middleware). Upstream is the unofficial
`mars.nasa.gov/rss/api/?feed=raw_images` feed, which returns one sol per request, so the proxy keeps at most 4 images
per camera (32 in total) and caches them for 15 minutes.

- Default range is about sols 4451 to 4550, the approximate boxwork campaign (to verify against mission notes).
  A toggle switches to Perseverance (Jezero), shown only for comparison.
- The panel says the images are not a photo of the point you picked on the map and are not matched to your route.
- When a sol has no downlinked images the feed answers with its generic "latest images" list. The proxy keeps only
  images whose sol matches the request, so another sol's pictures are never shown under the wrong sol.
- Offline order: live, then the last saved copy, then built-in snapshots for sols 4451, 4500, 4550 and Perseverance
  sol 2031 (`public/snapshots/images-*.json`, capture again with `scripts/make-snapshots.mjs`).

### Sun, light delay, O2 and dose (planning assumptions)

- **Sun:** Mars24 solar geometry (Allison & McEwen) gives LTST, elevation, azimuth and the useful EVA window
  (Sun at or above a configurable elevation, default 10°). The local DTM hillshade is lit with that Sun.
- **Light delay:** approximate Earth–Mars distance from JPL SSD Keplerian elements (Standish table 1), labeled
  approximate. Tests pin a few dates to JPL Horizons within 0.01 AU.
- **O2 / battery:** Minetti walking cost, scaled for Mars gravity and a suit penalty, already on the route cards
  as simulated fractions. An injected O2 leak halves usable oxygen and suit time and re-plans.
- **Dose:** reference GCR surface rate from MSL RAD, about 0.64 mSv/day (Hassler et al. 2014, Science). Applied
  unchanged to EVA duration and compared with a configurable budget (default 0.1 mSv). Not a dosimeter, not medical
  advice, and an injected SEP means abort rather than "budget it".

### Shells (Habitat / Tablet / HUD)

- **Plan** (`/plan`) is the Habitat shell: left rail with route, safety, layers and images; the map and elevation
  profile stay in the center. Below `md` a bottom sheet opens the same panels (Tablet breakpoint).
- **Walk** (`/walk`) is the EVA rehearsal: start/pause/reset, abort to the nearest of habitat or rover, buddy
  (follower / safest route / rover), a pre-walk checklist labeled as rehearsal, QR handoff of the plan URL,
  BroadcastChannel to other tabs of this origin, GeoJSON download and a printable cue card.
- **HUD** (`/hud`) is a helmet overlay: large type, next waypoint, O2/battery (simulated), time left, abort.
  On a phone the top chrome hides so the visor fills the screen.

Handoff encodes only the serializable plan (`?plan=`). The receiving device recomputes routes. Line of sight
already exists as the comms overlay (3 m habitat antenna, 1.7 m walker, 2.2 km, planning assumption).

## Offline (PWA)

`vite-plugin-pwa` precaches the app shell, the local DTM and the JSON snapshots. Mars Trek tiles are cached at
runtime (Cache First). **Download mission area** (Layers panel on Plan, and Handoff on Walk) stores a pyramid of
tiles around the habitat (~3 km box, estimate shown first) in the same `mirador.trek` cache the service worker
reads, so airplane mode still draws the map.

The service worker is produced by `npm run build`. `npm run dev` does not register it. To rehearse offline:

```bash
npm run build
npm run preview   # then Download mission area, then toggle airplane mode
```

## Deploy (Vercel)

`vercel.json` rewrites the SPA to `index.html` and leaves `/api/*` to the serverless functions in `api/`
(`weather`, `donki`, `images`). Set `NASA_API_KEY` in the Vercel project (see `.env.example`). The key is never
bundled into the client.

```bash
npx vercel
```

## Planning assumptions (not NASA flight rules)

Shown in the UI as planning assumptions or simulated:

- Slope caution / no-go, flat walking speed, time per stop, suit capacity, reserve
- O2 and battery fractions (Minetti walking cost, Mars g, suit penalty)
- Dose budget (default 0.1 mSv) at the published RAD GCR rate; no suit shielding
- Useful Sun elevation (default 10°)
- Comms line of sight (3 m antenna, 1.7 m walker, 2.2 km)
- Dust storm: walking speed × 0.7. O2 leak: 50% of oxygen and suit time. SEP: abort, route unchanged
- Rehearsal mode: simulated calm weather and no solar activity
- Analog mode: real Earth weather at MDRS, Utah, labeled as Earth

## 3-minute demo

English, dark theme. Rehearsal mode keeps the light green without pretending live Mars weather is calm.

1. **Layers at Gale.** Open `/plan`. Optical (CTX / HiRISE), thermal (THEMIS) and topographic (MOLA picture + local
   DTM hillshade) layers. English, dark visor.
2. **Three routes.** Route tab: Safest / Fastest / Science. Pick one. Read walk-back margin, PNR, and the Sun window
   on the Safety tab.
3. **Green light and a boxwork-campaign photo.** Safety tab: Data source → Rehearsal. Light is green (simulated).
   Images tab: a Curiosity sol in ~4451–4550. The panel says it is not a photo of the map point.
4. **Inject a storm.** Safety tab: Dust storm. The plan recomputes (speed × 0.7) and the light goes amber. Route tab
   Abort card names the nearest refuge (habitat or support rover).
5. **HUD on another device, then airplane mode.** Walk tab: Download mission area (estimate first), scan the QR onto
   a phone (`/hud?plan=`). Toggle airplane mode: the cached map, DTM and snapshots still draw.

## Credits

NASA / JPL-Caltech, USGS Astrogeology, Arizona State University THEMIS, University of Arizona HiRISE, Malin Space
Science Systems, Centro de Astrobiología (REMS). Mars Trek tiles remain NASA tiles; this app only caches copies in
the browser. MIRADOR is a NASA Space Apps prototype, not an official NASA product, and not medical or flight
certification.
