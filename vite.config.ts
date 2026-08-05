import { defineConfig, loadEnv } from 'vite'
import type { Connect, ViteDevServer, PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { readFileSync } from 'node:fs'

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

const BUILD_NUMBER_VAR = 'VITE_BUILD_NUMBER'

// ---------------------------------------------------------------------------
// Single source of truth for the web app's build number: VITE_BUILD_NUMBER,
// read from the env file for the current mode (`.env.production` for
// `npm run build`) via Vite's loadEnv.
//
// loadEnv is what makes the env FILE work here. Vite only injects .env values
// into `import.meta.env` for *client* code — it never populates `process.env`
// inside this config. Reading `process.env.VITE_BUILD_NUMBER` (as this file
// used to) therefore ignored the .env file entirely and silently fell through
// to the git commit count, which is why edits to .env appeared to do nothing.
//
// There is deliberately NO fallback. A release's build number is a fact about
// the release, and a guessed one is worse than no build at all: the backend
// compares build numbers as integers to decide who must upgrade, so a wrong
// value silently mis-targets every client. If it is not stated, the build stops.
// ---------------------------------------------------------------------------
const resolveBuildNumber = (
  raw: string | undefined,
  command: 'build' | 'serve',
): number => {
  const value = (raw ?? '').trim()

  // Strict: parseInt('12abc') is 12, which would let a typo through as a
  // plausible-looking number. Only a bare positive integer is accepted.
  const parsed = /^\d+$/.test(value) ? Number.parseInt(value, 10) : Number.NaN

  if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed

  if (command === 'build') {
    const problem = value
      ? `is not a positive whole number (got "${value}")`
      : 'is not set'
    throw new Error(
      `\n\n  Build stopped: ${BUILD_NUMBER_VAR} ${problem}.\n\n` +
        `  Set it in "OMS Frontend-web/.env.production", then rebuild:\n\n` +
        `      ${BUILD_NUMBER_VAR}=42\n\n` +
        `  It must be a whole number >= 1 and must increase with every\n` +
        `  release — the backend compares build numbers to decide which\n` +
        `  clients are outdated.\n\n` +
        `  See "OMS Backend/docs/RELEASE.md" -> "React web release process".\n`,
    )
  }

  // Dev server only. A dev session is not a release, so it must not require a
  // release number — but report 0 rather than inventing a plausible one, so a
  // number that leaks into a screenshot or a device row is obviously not real.
  console.warn(
    `[vite] ${BUILD_NUMBER_VAR} is not set — using 0 for this dev session. ` +
      `Production builds require it in .env.production.`,
  )
  return 0
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
export default defineConfig(({ mode, command }) => {
  // Loads .env, .env.local, .env.<mode>, .env.<mode>.local from the project
  // root. `npm run build` runs in mode "production", so .env.production is the
  // file that supplies the release build number.
  //
  // The empty prefix loads every key, not just VITE_-prefixed ones. Nothing is
  // exposed to the client by doing so: only the two constants below are
  // inlined, and client-side access is still governed by Vite's own envPrefix.
  const env = loadEnv(mode, process.cwd(), '')

  const version = pkg.version ?? '0.0.0'
  const buildNumber = resolveBuildNumber(env[BUILD_NUMBER_VAR], command)

  // Print what is about to be baked in. loadEnv lets a real OS/CI environment
  // variable outrank the env file, so state the resolved value rather than
  // leaving anyone to infer it from the file they happened to edit.
  if (command === 'build') {
    const overridden = process.env[BUILD_NUMBER_VAR] !== undefined
    console.log(
      `[vite] building version ${version}, build ${buildNumber} ` +
        `(${BUILD_NUMBER_VAR} from ${overridden ? 'the environment — overriding .env.production' : `.env.${mode}`})`,
    )
  }

  return {
    // Compile-time constants. Declared for TypeScript in src/vite-env.d.ts and
    // read ONLY by webDeviceService — never reference them directly elsewhere.
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_BUILD_NUMBER__: JSON.stringify(buildNumber),
    },
    // basicSsl only affects the dev server (serves over self-signed HTTPS) so a
    // phone on the LAN can use the camera, which browsers block on plain HTTP.
    // It is not added for `build`, so production output is unchanged.
    plugins: [
      react(),
      serviceWorkerNoCache(),
      ...(command === 'serve' ? [basicSsl()] : []),
    ],
    server: {
      // Listen on all interfaces so the phone can reach it by the PC's LAN IP.
      host: true,
      proxy: {
        // The app calls /api (see .env.local), which is proxied to the backend —
        // so the phone talks to ONE https origin and there is no mixed content.
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
