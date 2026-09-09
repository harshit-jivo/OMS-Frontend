/**
 * Sign in.
 *
 * Renders OUTSIDE the app shell, so it carries `tw-page` and `font-sans` by
 * hand — the shell, not `index.css`, is what puts Inter on everything else,
 * and `tw-page` is what stops `index.css`'s unlayered
 * `input, button { font: inherit }` rendering every control at the 18px root
 * size (DESIGN_SYSTEM §1.3). The standalone HAIS device page does the same.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE LAYOUT IS THE APP'S OWN TWO SURFACES
 * ─────────────────────────────────────────────────────────────────────────
 * A dark panel on the left and a light one on the right — which is exactly
 * what you see one second later: `--color-rail` is the navigation rail, and
 * the pale gradient is the page canvas. The sign-in screen is the first thing
 * anyone sees, and the cheapest way to look like a considered product is to
 * be the SAME product, so it borrows the app's one accent surface rather than
 * inventing a login look of its own.
 *
 * Everything else follows the rules the rest of the app follows: flat
 * surfaces, hairline edges, outline icons at 1.25 stroke, no gradient blobs
 * and no glass. The only gradient is the canvas one, below.
 *
 * The brand panel is `lg:` and up. Below that it would be a tall dark box
 * pushing the form off the fold, so it collapses to the compact logo the page
 * has always had.
 *
 * IT PAINTS ITS OWN BACKGROUND, and now paints the RIGHT one. `html, body`'s
 * canvas lives in `components/Sidebar.css`, which is loaded by the shell —
 * and the shell does not mount on this route, so the gradient the whole app
 * sits on was simply absent here and the page rendered on flat `bg-canvas`.
 * The values below are that rule, copied, so the two agree.
 */
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineChartBar,
  HiOutlineClipboardDocumentList,
  HiOutlineDocumentText,
  HiOutlineEye,
  HiOutlineEyeSlash,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card, Notice } from "@/components/ui/page";
import { landingPathFor } from "../config/pageAccess";
import { loginUser } from "../services/authService";
import { loadSession, saveTokens, useAuth } from "../auth";
import { resolveStartupSession } from "../services/api";
import { webDeviceService } from "../services/webDeviceService";
import { loadUILabels, loadUIFields } from "../services/uiConfig";

/**
 * The app's canvas, from `components/Sidebar.css`.
 *
 * Not a token, because it is one rule used in two places rather than a value
 * the design system offers; and not `bg-canvas`, which is the flat fallback.
 * If the `html, body` rule there changes, this changes with it.
 */
const CANVAS =
  "bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.14),transparent_24%),linear-gradient(180deg,#f4f7fb_0%,#eef3f8_100%)]";

/** What the product does, in the words the rail uses for its own sections. */
const HIGHLIGHTS = [
  { icon: HiOutlineClipboardDocumentList, label: "Orders, approvals and dispatch" },
  { icon: HiOutlineDocumentText, label: "Invoices, e-Invoice and e-Way Bill" },
  { icon: HiOutlineChartBar, label: "Stock, payments and reporting" },
];

export default function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  /* The build, on the sign-in screen for the same reason `ProfileDialog`
     carries it: support asks "what version are you on?" and the answer should
     not require getting in first. Read once — it does not change. */
  const [appVersion] = useState(() => {
    try {
      return webDeviceService.getSummary().app_version;
    } catch {
      return "";
    }
  });

  // If a valid session already exists (or an expired access token can be
  // silently refreshed), skip the Login screen and go straight into the app.
  // We NEVER clear tokens here — opening Login must not affect any tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const outcome = await resolveStartupSession();
      if (cancelled || outcome !== "authenticated") return;
      // Same landing rule as a fresh login (see handleLogin) — one shared helper,
      // so a restored session can never land somewhere a new login wouldn't.
      // Read through `loadSession` rather than reaching for the raw "role"
      // key: same value, but one loader owns the storage layout, so a change
      // to it cannot leave this line silently landing everyone on /Dashboard.
      const landing = landingPathFor(loadSession()?.role ?? null);
      // Preserve any notification deep-link params (openOrderId / notificationId)
      // that a service-worker "openWindow" put on the "/" URL, so the Sidebar's
      // openOrderId effect on the landing route can open the exact Sales Order
      // instead of dropping it on the redirect.
      navigate(landing + window.location.search, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  /*
   * Feedback is an inline notice, not a toast.
   *
   * This page had its OWN third toast implementation — a component, a 3.5s
   * timer and a fixed-position card — because `lib/toastStore`'s toaster is
   * mounted inside the app shell, which the login route does not render. An
   * inline notice needs none of that AND is the better answer here: the
   * message is about the form immediately below it, so it belongs beside the
   * form rather than floating in a corner.
   */
  const [notice, setNotice] = useState<{ message: string; type: "error" | "success" } | null>(
    null,
  );

  // Surface the "session expired" message set by the API layer when a refresh
  // fails and the user is bounced back to login (Task 5).
  useEffect(() => {
    const expiredMessage = sessionStorage.getItem("session_expired");
    if (expiredMessage) {
      sessionStorage.removeItem("session_expired");
      setNotice({ message: expiredMessage, type: "error" });
    }
  }, []);

  const handleLogin = async () => {
    if (!username || !password) {
      setNotice({ message: "Enter both a username and a password.", type: "error" });
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const data = await loginUser(username, password);
      const user = data.data.user;
      const tokens = data.data.tokens;

      // Tokens first: `signIn` persists the rest of the session, and the api
      // interceptor needs the token in place before anything else fires.
      saveTokens(tokens.access, tokens.refresh);

      // One call writes the WHOLE session — including `extra_pages` and
      // `extra_roles`, which this function never used to store at all. That gap
      // is what made route guards unusable: they read grants that nothing had
      // written until the Sidebar mounted, long after routing had decided.
      // Going through the auth module means login and the profile refresh
      // populate the session identically, so the two cannot drift again.
      signIn(user);

      // Register this browser with the backend. Fire-and-forget: best-effort
      // telemetry that must never block, delay or fail login. Retries by itself
      // on the next authenticated session if it fails now.
      void webDeviceService.onAuthenticated("login");

      // Fetch dynamic UI labels once for this session and cache them. Same
      // fire-and-forget contract: never blocks login, and any screen falls back
      // to hardcoded text until it resolves.
      void loadUILabels(true);
      void loadUIFields(true);

      setNotice({ message: "Signed in. Taking you through…", type: "success" });

      // Landing: tracker users go to their first tracker page (they have no
      // Dashboard); legal reviewers to their workspace; everyone else Dashboard.
      const landingPath = landingPathFor(user.role);
      // Carry any notification deep-link params (openOrderId / notificationId) so
      // a notification tapped while logged out still opens the exact order after
      // login instead of dropping the user on the dashboard.
      const deepLink = window.location.search;
      setTimeout(() => navigate(landingPath + deepLink), 1000);
    } catch (error) {
      console.error(error);
      setNotice({ message: "Invalid username or password.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    /*
     * Viewport-locked: the sign-in screen never scrolls the page.
     *
     * `h-svh` + `overflow-hidden` rather than `min-h-svh`, which only sets a
     * floor and lets the document grow past the fold. `svh` is the SMALL
     * viewport height, so on a phone the browser chrome is already accounted
     * for and the lock does not fight the address bar collapsing.
     *
     * The FORM COLUMN keeps its own `overflow-y-auto`. On a 360x480 screen the
     * card is taller than the viewport, and a page that cannot scroll AND
     * clips its own submit button is worse than one that scrolls: this way the
     * page stays put and only the column moves, so there is never a body
     * scrollbar but the button is always reachable.
     */
    <div className={`tw-page h-svh overflow-hidden font-sans ${CANVAS}`}>
      <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)]">
        {/* ── The brand panel: the navigation rail, before you have one ──── */}
        <aside className="relative hidden h-full flex-col justify-between overflow-hidden bg-rail p-10 xl:p-14 lg:flex">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center overflow-hidden rounded-md bg-white/95">
              <img src="/logo.png" alt="" className="size-7 object-contain" />
            </span>
            <span className="text-[15px] font-bold uppercase tracking-[0.22em] text-white">
              JIVO OMS
            </span>
          </div>

          <div className="max-w-[420px]">
            <h2 className="m-0 text-[30px] font-bold leading-tight tracking-tight text-white">
              Order Management System
            </h2>
            <p className="m-0 mt-3 text-[14.5px] leading-relaxed text-rail-text">
              One place for the whole order — raised, approved, invoiced and
              tracked to dispatch.
            </p>

            <ul className="m-0 mt-8 flex list-none flex-col gap-3.5 p-0">
              {HIGHLIGHTS.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 text-[13.5px] text-rail-text">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-rail-line bg-white/[0.06]">
                    <Icon aria-hidden="true" className="size-4 [stroke-width:1.25] text-white" />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <p className="m-0 text-[11.5px] text-rail-muted">
            {appVersion ? `Version ${appVersion} · ` : ""}Jivo Wellness © {new Date().getFullYear()}. All rights reserved.
          </p>
        </aside>

        {/* ── The form ──────────────────────────────────────────────────── */}
        <main className="flex h-full items-center justify-center overflow-y-auto px-4 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">
            {/* The compact mark, for the widths where the panel is not shown. */}
            <div className="mb-6 flex flex-col items-center gap-2.5 lg:hidden">
              <span className="flex size-12 items-center justify-center overflow-hidden rounded-md border border-line bg-card">
                <img src="/logo.png" alt="" className="size-full object-contain" />
              </span>
              <span className="text-[14px] font-bold uppercase tracking-[0.22em] text-ink">
                JIVO OMS
              </span>
            </div>

            <Card className="p-6 shadow-panel sm:p-7">
              <h1 className="m-0 text-[20px] font-bold tracking-tight text-ink">
                Sign in to your account
              </h1>
              <p className="m-0 mt-1.5 mb-7 text-[13.5px] text-subtle">
                Enter your credentials to continue.
              </p>

              {/*
               * A real <form>, which the div this replaces was not. That is what
               * gives Enter-to-submit without a keydown handler on each input, and
               * what lets a password manager recognise the pair and offer to fill
               * and save them.
               */}
              <form
                className="space-y-5"
                onSubmit={(e: React.FormEvent) => {
                  e.preventDefault();
                  void handleLogin();
                }}
              >
                <Field label="Username" required>
                  {(control) => (
                    <Input
                      {...control}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      placeholder="username"
                      autoFocus
                    />
                  )}
                </Field>

                <Field label="Password" required>
                  {(control) => (
                    <span className="relative block">
                      <Input
                        {...control}
                        type={showPass ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        aria-label={showPass ? "Hide password" : "Show password"}
                        onClick={() => setShowPass((prev) => !prev)}
                      >
                        {showPass ? <HiOutlineEyeSlash /> : <HiOutlineEye />}
                      </Button>
                    </span>
                  )}
                </Field>

                {notice && (
                  <Notice
                    tone={notice.type === "error" ? "bad" : "ok"}
                    title={notice.type === "error" ? "Could not sign in" : undefined}
                  >
                    {notice.message}
                  </Notice>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  className="mt-2 h-11 w-full text-[14px]"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-3.5 rounded-full border-2 border-white/40 border-t-white motion-safe:animate-spin"
                      />
                      Signing in…
                    </>
                  ) : (
                    "Log in"
                  )}
                </Button>
              </form>
            </Card>

            <p className="m-0 mt-5 text-center text-[12px] text-subtle">
              Trouble signing in? Contact your system administrator.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
