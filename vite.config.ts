/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { getDonki, getImages, getWeather, isMission, respond, type FnResponse } from './api/_nasa.ts'
import { createLiveTokenHandler } from './api/live-token.ts'

/** Serves /api/weather, /api/donki and /api/images in `vite dev` with the same code the Vercel functions run. */
function devApi(mode: string): Plugin {
  const routes: Record<string, (q: URLSearchParams) => Promise<unknown>> = {
    '/api/weather': () => getWeather(),
    '/api/donki': () => getDonki(),
    '/api/images': (q) => {
      const mission = q.get('mission') ?? 'msl'
      return isMission(mission) ? getImages(mission, Number(q.get('sol'))) : Promise.reject(new Error('bad mission'))
    },
  }
  return {
    name: 'mirador-dev-api',
    configureServer(server) {
      const tokenHandler = createLiveTokenHandler({ GEMINI_API_KEY: process.env.GEMINI_API_KEY || loadEnv(mode, process.cwd(), '').GEMINI_API_KEY })
      server.middlewares.use((req, res, next) => {
        const [path, qs = ''] = (req.url ?? '').split('?')
        const load = routes[path]
        if (!load && path !== '/api/live-token') return next()
        const fn: FnResponse = {
          status(code) {
            res.statusCode = code
            return fn
          },
          setHeader(name, value) {
            res.setHeader(name, value)
          },
          json(body) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(body))
          },
        }
        if (path === '/api/live-token') void tokenHandler(req, fn)
        else void respond(fn, () => load(new URLSearchParams(qs)))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    devApi(mode),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'dtm/gale_aoi_4m.bin', 'dtm/gale_aoi_4m.json'],
      manifest: {
        name: 'MIRADOR · Mars EVA planner',
        short_name: 'MIRADOR',
        description: 'Hyperlocal Mars map to plan a safe science EVA on lower Mount Sharp.',
        theme_color: '#05070a',
        background_color: '#05070a',
        display: 'standalone',
        start_url: '/plan',
        lang: 'en',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json,bin}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/trek\.nasa\.gov\/tiles\/Mars\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mirador.trek',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/tiles\.arcgis\.com\/tiles\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mirador.usgs',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/(weather|donki|images)/,
            handler: 'NetworkFirst',
            options: { cacheName: 'mirador.api', networkTimeoutSeconds: 8 },
          },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}))
