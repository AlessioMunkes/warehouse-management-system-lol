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
        // The main bundle is ~2.1 MB, just over Workbox's 2 MiB default.
        // Past that limit the build fails outright, and the app shell
        // would not be cached for offline use. 4 MiB leaves headroom;
        // code-splitting the routes is the longer-term fix.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // The navigation fallback serves index.html for every page
        // load. /api must be exempt: the Gmail OAuth callback is a
        // full-page navigation to /api/gmail/..., and an installed app
        // would otherwise swallow it.
        navigateFallbackDenylist: [/^\/api\//],
      },
      includeAssets: [FAVICON_ASSET, 'icons/apple-touch-icon.png'],
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
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Android wants real PNGs at 192 and 512 to offer "Install".
        // The maskable icon is padded so the launcher's circular crop
        // does not cut the ladle. iOS ignores these entirely and uses
        // the apple-touch-icon link in index.html.
        icons: [
          { src: '/icons/pwa-192.png',      sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png',      sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: FAVICON_URL,               sizes: 'any',     type: 'image/svg+xml', purpose: 'any' },
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
        // 127.0.0.1 rather than localhost: Node resolves localhost to
        // both ::1 and 127.0.0.1 and tries each in turn.
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        // While Express is booting, or node --watch is restarting it,
        // nothing listens on :5000 and Vite answers a bare 502 that the
        // login form shows as "REQUEST FAILED (502)". Answer 503 with a
        // message instead. This runs before Vite's own error handler,
        // which then skips because the response is already sent.
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (!res || !('req' in res) || res.headersSent || res.writableEnded) return;
            res.writeHead(503, {
              'Content-Type': 'application/json',
              'X-WMS-Starting': '1',
            });
            res.end(JSON.stringify({
              message: 'The server is starting up. Please try again in a moment.',
            }));
          });
        },
      },
    },
  },
})
