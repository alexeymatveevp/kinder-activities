import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Normalise VITE_BASE_PATH: strip leading/trailing slashes, then wrap with
  // both. Empty / unset means the app is served at the domain root.
  const rawBase = (env.VITE_BASE_PATH || '').trim().replace(/^\/+|\/+$/g, '')
  const base = rawBase ? `/${rawBase}/` : '/'
  const apiPrefix = `${base}api` // e.g. "/api" or "/kinder-activities/api"

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'Kinder Activities',
          short_name: 'KinderAct',
          description: 'Discover fun activities for kids and families in Munich',
          theme_color: '#ff6b6b',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: base,
          start_url: base,
          icons: [
            {
              src: `${base}pwa-192x192.png`,
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: `${base}pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: `${base}pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          runtimeCaching: [
            {
              // Regex (not a function) — Workbox serialises the SW source and
              // closure variables would not survive, but the regex is inlined.
              urlPattern: new RegExp(`${apiPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
          ],
        },
      }),
    ],
    server: {
      host: true,
      port: 5174,
      strictPort: false,
      // Always proxy /api so dev with the default base path works. When a
      // custom base is configured, also proxy <base>api and strip the prefix
      // so the backend (which always exposes /api) sees the same path.
      proxy: {
        '/api': {
          target: 'http://localhost:3002',
          changeOrigin: true,
        },
        ...(base !== '/'
          ? {
              [apiPrefix]: {
                target: 'http://localhost:3002',
                changeOrigin: true,
                rewrite: (p) => p.replace(new RegExp(`^${base}api`), '/api'),
              },
            }
          : {}),
      },
    },
  }
})
