import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tailwind FIRST: its utilities sit in a cascade layer, and every existing
// stylesheet is unlayered — unlayered wins regardless of order, so this is
// about import determinism rather than precedence. See styles/tailwind.css.
import './styles/tailwind.css'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { createQueryClient } from './lib/queryClient'
import { webDeviceService } from './services/webDeviceService'

// Wire device/version metadata into the axios layer once, before anything
// renders, so every request (including login) carries it and the post-refresh
// registration retry is armed. Synchronous and idempotent.
webDeviceService.init()

// One client for the app. Created here rather than at module scope inside
// lib/queryClient so tests can make their own isolated one — a shared cache
// between test files is a cross-test dependency that only shows up as a
// mysterious pass.
const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
