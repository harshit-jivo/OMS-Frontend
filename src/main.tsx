import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { webDeviceService } from './services/webDeviceService'

// Wire device/version metadata into the axios layer once, before anything
// renders, so every request (including login) carries it and the post-refresh
// registration retry is armed. Synchronous and idempotent.
webDeviceService.init()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
