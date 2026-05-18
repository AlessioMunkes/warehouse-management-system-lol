import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'   // ← added

let faviconURL = '/favicon.svg'

export default defineConfig({
  plugins: [
    tailwindcss(),                              // ← added (must be first)
    react(),
    VitePWA({
      includeAssets: [faviconURL],
      manifest: {
        theme_color: '#7A1A1A',                 // updated to match your brand
        icons: [
          { src: faviconURL, sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: faviconURL, sizes: '192x192',  type: 'image/svg+xml' }
        ]
      }
    }),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
