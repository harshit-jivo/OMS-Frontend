import { defineConfig } from 'vite'
import type { Connect, ViteDevServer, PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'

// Ensure ONLY the service worker is served with `Cache-Control: no-cache`, so
// browsers always revalidate it and pick up new versions immediately. All other
// assets (hashed JS/CSS/images/fonts) keep their normal long-lived caching.
//
// This covers the Vite-controlled servers (dev + `vite preview`). In production
// the built `dist/` is served by a reverse proxy / static host — configure the
// same header there (see docs/notification.md → Service Worker Cache Headers).
const serviceWorkerNoCache = () => {
  const middleware = (
    req: Connect.IncomingMessage,
    res: any,
    next: Connect.NextFunction,
  ) => {
    if (req.url && req.url.split('?')[0] === '/service-worker.js') {
      res.setHeader('Cache-Control', 'no-cache')
    }
    next()
  }
  return {
    name: 'service-worker-no-cache',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerNoCache()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
