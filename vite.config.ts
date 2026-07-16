import { defineConfig } from 'vite'
import type { Connect, ViteDevServer, PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// ---------------------------------------------------------------------------
// Single source of truth for the web app's version.
//
// The version is read from package.json at BUILD time and inlined into the
// bundle via `define`, so the running app always reports exactly the build it
// was compiled from. There is deliberately no second constant to keep in sync —
// bump package.json and nothing else.
// ---------------------------------------------------------------------------
const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version?: string }

// The web has no native build counter, so mint a monotonic one: the CI run
// number when available, otherwise the git commit count. Both only ever
// increase, which is all the backend's integer comparison requires. Falls back
// to 1 so a source-only build (no git, no CI) still produces a valid payload.
const resolveBuildNumber = (): number => {
  const fromEnv =
    process.env.VITE_BUILD_NUMBER ??
    process.env.BUILD_NUMBER ??
    process.env.GITHUB_RUN_NUMBER
  const parsedEnv = Number.parseInt(String(fromEnv ?? ''), 10)
  if (Number.isFinite(parsedEnv) && parsedEnv >= 1) return parsedEnv

  try {
    const count = execSync('git rev-list --count HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    const parsedGit = Number.parseInt(count, 10)
    if (Number.isFinite(parsedGit) && parsedGit >= 1) return parsedGit
  } catch {
    /* not a git checkout / git unavailable — fall through to the default */
  }
  return 1
}

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
  // Compile-time constants. Declared for TypeScript in src/vite-env.d.ts and
  // read ONLY by webDeviceService — never reference them directly elsewhere.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version ?? '0.0.0'),
    __APP_BUILD_NUMBER__: JSON.stringify(resolveBuildNumber()),
  },
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
