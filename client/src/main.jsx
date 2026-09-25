
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/900.css'
// Bundled rather than from jsDelivr, so the icons are precached and
// still draw offline. Script 49.
import '@tabler/icons-webfont/dist/tabler-icons.min.css'
import { applyTheme, readStoredTheme } from './lib/theme'
import './styles/index.css'
import './styles/staff.css'
import './styles/landingpage.css'
import App from './App.jsx'
import { installReadCache } from './services/readCache'
import { installWarehouseFetch } from './services/warehouse'

// Before the first frame, not in an effect — see lib/theme.js.
applyTheme(readStoredTheme())

// Both before the first render, so the very first /api call is
// covered. Order matters: the warehouse header is added first, and
// the read cache wraps that, so a live read always goes to the
// chosen warehouse. The cache keeps entries per warehouse through
// its scope (AuthContext's scopeOf). See services/warehouse.js and
// services/readCache.js.
installWarehouseFetch()
installReadCache(window)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
