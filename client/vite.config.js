import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path';
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'   // ← added

// Two forms of the same file, because the two consumers want
// different things:
//   FAVICON_ASSET — a path relative to publicDir, for the workbox
//                   glob in includeAssets.
//   FAVICON_URL   — a root-absolute URL, for manifest icon src, which
//                   the browser resolves against the site root rather
//                   than against the manifest's own location.
// Both point into icons/ because that is where ba3f2f8 put the file.
const FAVICON_ASSET = 'icons/favicon.svg'
const FAVICON_URL   = '/icons/favicon.svg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    tailwindcss(),                              // ← added (must be first)
    react(),
    VitePWA({
      // SheetJS is dynamically imported by the spreadsheet charting
      // feature. Workbox precaches every asset by default, which would
      // download ~400 kB on install for users who never drop a file.
      workbox: {
        globIgnores: ['**/xlsx-*.js'],
      },
      includeAssets: [FAVICON_ASSET],
      manifest: {
        // name and short_name were both the repo slug, so an installed
        // shortcut would have read "warehouse-management-system-lol"
        // on someone's home screen. short_name is what a launcher
        // shows under the icon, where there is room for about twelve
        // characters.
        name: 'Ladles of Love Warehouse Management',
        short_name: 'LoL WMS',
        description: 'Stock, receiving, packing and dispatch for the Ladles of Love warehouse.',
        theme_color: '#7A1A1A',                 // updated to match your brand
        icons: [
          { src: FAVICON_URL, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: FAVICON_URL, sizes: '192x192', type: 'image/svg+xml' }
        ]
      }
    }),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias :{
      "@" : path.resolve(__dirname , "./src"),
    },
  },
  server: {
    // Dev-only proxy: /api/* from the Vite client forwards to the Express
    // backend so httpOnly cookie auth (wms_token) works same-origin during
    // development without CORS/credentials gymnastics.
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
