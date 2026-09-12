
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource/montserrat/700.css'
import '@fontsource/montserrat/900.css'
import './styles/index.css'
import './styles/staff.css'
import './styles/landingpage.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)