import { defineConfig, loadEnv } from 'vite'
import type { Connect, ViteDevServer, PreviewServer } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { ServerResponse } from 'node:http'

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
    res: ServerResponse,
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

// ---------------------------------------------------------------------------
// Which of OUR modules belong in the `shared` chunk (see build.rolldownOptions).
//
// `src/services/` as a whole is deliberately NOT the rule. That directory mixes
// two unlike things: the axios instance every request goes through, and one
// wrapper per feature — ordersService, schemeService, haisService and ten more.
// Matching the whole directory put 107 kB in front of the login form, and
// haisService is of no interest to anyone who never opens HAIS. Naming the core
// keeps the feature wrappers where they belong: in the chunk of whichever page
// imports them, which Vite already splits out on its own when several do.
//
// The test for membership is one question, checked against the imports rather
// than guessed: does BOTH the shell and at least one page import it?
//   * webDeviceService — Sidebar, main.tsx, Login AND Profile. In.
//   * webPushClient, notificationBus — the sidebar's notification code only.
//     Out: a shell-only module in here re-hashes every page chunk when it
//     changes, for pages that never imported it. notificationBus was in this
//     list on the assumption it was cross-cutting; the imports say otherwise.
// ---------------------------------------------------------------------------
const SERVICE_CORE =
  /[\\/]src[\\/]services[\\/](api|apiPaths|requestId|uiConfig|webDeviceService)\.ts$/

const sharedAppModule = (id: string): boolean =>
  // auth, config, lib and the ui primitives are shared by definition: the shell
  // and the pages both import them, which is exactly what pinned all 34 page
  // chunks to the entry chunk's hash.
  /[\\/]src[\\/](auth|config|lib|components[\\/]ui)[\\/]/.test(id) ||
  SERVICE_CORE.test(id)

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
    // Dev server runs over plain HTTP so it matches the http:// API origin and
    // there is no mixed-content blocking (an HTTPS page calling an http:// API
    // is refused by the browser, which broke login). Trade-off: a phone on the
    // LAN cannot use the browser camera over HTTP — re-enable basicSsl() below
    // only if that is needed. Not added for `build`, so production is unchanged.
    plugins: [
      react(),
      tailwindcss(),
      serviceWorkerNoCache(),
    ],
    // `@/` -> src. Declared in components.json, so every component pasted
    // from the shadcn registry imports `@/lib/utils` and resolves without
    // hand-editing. Mirrored in tsconfig.app.json and vitest.config.ts.
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      rolldownOptions: {
        output: {
          /*
           * Phase 5.4 — split the libraries out of the entry chunk.
           *
           * ───────────────────────────────────────────────────────────────
           * THE PROBLEM THIS SOLVES IS CACHING, NOT SIZE
           * ───────────────────────────────────────────────────────────────
           * Phase 5.1 made every page lazy, which fixed the first-load size.
           * What it did not fix is that the entry chunk still mixed two
           * things with completely different lifetimes:
           *
           *   react-dom + react-router + radix + query   ~330 kB, changes
           *     only when a dependency is upgraded — a few times a year.
           *   App.tsx, Sidebar, Login, auth, services     ~55 kB, changes
           *     with almost every deploy.
           *
           * One chunk means one hash, so a one-line Sidebar edit invalidated
           * all 385 kB and every returning user re-downloaded React. Splitting
           * on that seam means a normal deploy busts only the small half.
           *
           * ───────────────────────────────────────────────────────────────
           * WHY THE GROUPS ARE NAMED PACKAGES AND NOT `/node_modules/`
           * ───────────────────────────────────────────────────────────────
           * The obvious rule — one `vendor` group testing /node_modules/ —
           * is actively harmful here. It would pull exceljs (930 kB), xlsx
           * (425 kB), html5-qrcode (370 kB) and recharts (303 kB) into a
           * single chunk, and because the entry needs React from that same
           * chunk, EVERY user would download all four before the login form
           * rendered. Those four are already isolated behind dynamic imports
           * and must stay that way, so each group below names only libraries
           * the app shell genuinely loads on startup.
           *
           * react-icons is deliberately absent for the same reason: Sidebar
           * imports the `hi2` set, and grouping all of react-icons would drag
           * `fa`, `md` and `bs` — used only by lazy pages — onto the critical
           * path. Vite already splits those per icon set.
           *
           * `[\\/]` rather than `/` in every test: these run against absolute
           * module ids, which are backslashed on Windows.
           */
          codeSplitting: {
            groups: [
              {
                // React itself. Largest single thing on the critical path and
                // the least likely to change; worth its own hash alone.
                name: 'react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              {
                name: 'router',
                test: /node_modules[\\/]react-router(-dom)?[\\/]/,
                priority: 20,
              },
              {
                // Radix and the scroll/focus helpers it pulls in. Eager because
                // the notification permission modal is part of the shell, and
                // shared by all 48 converted dialogs besides.
                name: 'overlay',
                test: /node_modules[\\/](@radix-ui[\\/]|react-remove-scroll|react-remove-scroll-bar|aria-hidden|use-sidecar|use-callback-ref|get-nonce|detect-node-es)/,
                priority: 20,
              },
              {
                /*
                 * Only the two icon sets the SHELL itself imports. Sidebar
                 * uses 32 icons from `hi2` and the dialog primitive uses one
                 * from `lu`, so both are on the critical path already — but
                 * they were sitting inside the entry chunk, where a Sidebar
                 * edit re-hashed 67 kB of unchanged SVG paths along with it.
                 *
                 * NOT `react-icons` wholesale. `fi` is imported only by the
                 * Dashboard, and a blanket rule would put any future set —
                 * including a large one added to a single lazy page — in front
                 * of the login form for every user.
                 */
                name: 'icons',
                test: /node_modules[\\/]react-icons[\\/](hi2|lu)[\\/]/,
                priority: 20,
              },
              {
                // cn(): clsx + tailwind-merge + cva. Every primitive calls it,
                // so it loads eagerly; on its own it was three separate
                // requests for 27 kB that never changes.
                name: 'styleutils',
                test: /node_modules[\\/](clsx|tailwind-merge|class-variance-authority)[\\/]/,
                priority: 20,
              },
              {
                /*
                 * The app's own shared infrastructure — the axios instance,
                 * the session, the permission tables, `cn()`.
                 *
                 * This group exists because of a measured cascade, not a
                 * theory. Every lazy page chunk imports these modules, and
                 * they were living in the ENTRY chunk because the shell
                 * imports them too. That made the entry a dependency of all
                 * 34 page chunks, so changing one string in Sidebar.tsx
                 * rewrote the entry's hash, rewrote the `from "./index-xxx.js"`
                 * specifier inside all 34, and re-hashed every one of them —
                 * a routine deploy invalidated the whole app's cache no matter
                 * how small the change.
                 *
                 * Pulling them into their own chunk cuts the edge: pages now
                 * import `shared-<hash>.js`, which changes only when the shared
                 * code itself changes. Verified by rebuilding after a one-line
                 * Sidebar edit and diffing the emitted filenames.
                 *
                 * `components/ui` is in here for the same reason and not for
                 * tidiness: the shell's logout confirmation uses `Dialog`, so
                 * dialog.tsx sat in the entry too and kept 26 of the 34 page
                 * chunks pinned to it even after the services moved out. The
                 * other seven primitives come along because they are 0.7-2.2 kB
                 * each and were costing every page a separate request.
                 *
                 * `pages/` is NOT in the test. Those are what lazy loading is
                 * for, and a page in here would be downloaded by everyone.
                 */
                name: 'shared',
                test: sharedAppModule,
                priority: 10,
              },
              {
                // TanStack Query + axios: the data layer, shared by every page.
                name: 'data',
                test: /node_modules[\\/](@tanstack[\\/]|axios[\\/])/,
                priority: 20,
              },
            ],
          },
        },
      },
    },
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
