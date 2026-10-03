/**
 * One Control Panel page.
 *
 * The page itself is C_Panel's production page, now part of the OMS backend
 * (`OMS-Backend/cpanel/`): its own template, styles and scripts, exactly as
 * production renders them, reading the same SAP data. It is shown in a frame
 * because those styles and scripts are global — loaded into this app's
 * document they would restyle OMS and OMS's would restyle them. The frame's
 * origin is OMS's own (nginx serves both), so it is one site, one login.
 *
 * OMS decides who may open which page (its permission keys) and opens it with
 * a single-use ticket link (`services/controlPanelService.ts`). The page's own
 * top bar and sidebar are hidden; its title and Reload sit in the OMS top bar.
 *
 * States: signing in (skeleton), the page loading in the frame (a thin bar),
 * and failure ("no access", or the backend unreachable), each with Retry.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  HiOutlineArrowPath,
  HiOutlineArrowsPointingIn,
  HiOutlineArrowsPointingOut,
  HiOutlineArrowTopRightOnSquare,
} from "react-icons/hi2";

import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  controlPanelError,
  getSsoLink,
  type ControlPanelPageId,
} from "../../services/controlPanelService";
import { ControlPanelPage } from "./shared/components/ControlPanelPage";
import type { TabAdapter } from "./tabs";
import { useFullscreen } from "./useFullscreen";

export function EmbeddedControlPanel({
  page,
  title,
  description,
  tabs,
}: {
  page: ControlPanelPageId;
  title: string;
  description?: string;
  /** The page's inner tabs, opened from the sidebar as `?tab=` (tabs.ts). */
  tabs?: TabAdapter;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(true);
  const [frameLoading, setFrameLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  // A request that finishes after the user has moved to another page (or
  // asked again) must not overwrite the newer one.
  const latest = useRef(0);
  // The frame region: sized edge to edge by `[data-slot="cp-frame"]` in
  // styles/tailwind.css, and the element that goes full screen.
  const frameRef = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(frameRef);

  // Inner tabs: `?tab=` -> the page (on load, and whenever the sidebar picks
  // another tab of this same page), and the page -> `?tab=` when the user
  // switches inside it, so the sidebar highlight follows.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab");
  const frameWin = useRef<Window | null>(null);
  const stopWatching = useRef<() => void>(() => {});
  useEffect(() => {
    if (tabs && tab && frameWin.current) tabs.apply(frameWin.current, tab);
  }, [tabs, tab]);
  useEffect(() => () => stopWatching.current(), []);
  const connectTabs = (win: Window | null) => {
    stopWatching.current();
    frameWin.current = win;
    if (!tabs || !win) return;
    try {
      if (tab) tabs.apply(win, tab);
      stopWatching.current = tabs.watch(win, (next) => {
        setSearchParams(
          (params) => {
            if (params.get("tab") === next) return params;
            const updated = new URLSearchParams(params);
            updated.set("tab", next);
            return updated;
          },
          { replace: true },
        );
      });
    } catch {
      // A page that is not (yet) what the adapter expects: tabs simply stay
      // in the page's own hands.
      stopWatching.current = () => {};
    }
  };
  const [showExitHint, setShowExitHint] = useState(false);
  useEffect(() => {
    if (!fullscreen.isFullscreen) return;
    setShowExitHint(true);
    const timer = window.setTimeout(() => setShowExitHint(false), 2500);
    return () => window.clearTimeout(timer);
  }, [fullscreen.isFullscreen]);

  const signIn = useCallback(async () => {
    const id = ++latest.current;
    setSigningIn(true);
    setError(null);
    try {
      const link = await getSsoLink(page);
      if (id !== latest.current) return;
      setFrameLoading(true);
      setSrc(link.url);
    } catch (err) {
      if (id !== latest.current) return;
      setSrc(null);
      setError(controlPanelError(err));
    } finally {
      if (id === latest.current) setSigningIn(false);
    }
  }, [page]);

  useEffect(() => {
    void signIn();
  }, [signIn]);

  // A link is single-use, so the new tab gets a fresh one of its own.
  const openInNewTab = async () => {
    setOpening(true);
    try {
      const link = await getSsoLink(page);
      window.open(link.url, "_blank", "noopener");
    } catch (err) {
      setError(controlPanelError(err));
    } finally {
      setOpening(false);
    }
  };

  const busy = signingIn || (Boolean(src) && frameLoading);

  return (
    <ControlPanelPage
      title={title}
      description={description}
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => void openInNewTab()}
            disabled={opening || Boolean(error)}
            aria-label="Open in a new tab"
            title="Open this page in a new tab"
          >
            <HiOutlineArrowTopRightOnSquare aria-hidden="true" />
            <span className="hidden md:inline">New tab</span>
          </Button>
          <Button
            variant="ghost"
            onClick={() => void signIn()}
            disabled={signingIn}
            aria-label="Reload"
            title="Reload this page"
          >
            <HiOutlineArrowPath
              aria-hidden="true"
              className={busy ? "motion-safe:animate-spin" : undefined}
            />
            <span className="hidden sm:inline">Reload</span>
          </Button>
          {fullscreen.supported ? (
            <Button
              variant="ghost"
              onClick={fullscreen.toggle}
              disabled={Boolean(error)}
              aria-label={fullscreen.isFullscreen ? "Exit full screen" : "Full screen"}
              aria-pressed={fullscreen.isFullscreen}
              title="Full screen (F or F11)"
            >
              {fullscreen.isFullscreen ? (
                <HiOutlineArrowsPointingIn aria-hidden="true" />
              ) : (
                <HiOutlineArrowsPointingOut aria-hidden="true" />
              )}
              <span className="hidden lg:inline">Full screen</span>
            </Button>
          ) : null}
        </>
      }
    >
      {error ? (
        <div data-slot="cp-frame" className="overflow-auto p-3 sm:p-4 md:p-6">
          <Card>
            <Notice tone="bad" title="Control Panel unavailable">
              {error}
            </Notice>
            <div className="mt-3">
              <Button variant="primary" onClick={() => void signIn()}>
                <HiOutlineArrowPath aria-hidden="true" /> Retry
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <div ref={frameRef} data-slot="cp-frame" className="relative w-full">
          {showExitHint ? (
            <div
              role="status"
              className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-ink/80 px-4 py-2 text-[13px] font-medium text-white shadow-panel"
            >
              Press <kbd className="font-semibold">Esc</kbd> or <kbd className="font-semibold">F</kbd> to exit full screen
            </div>
          ) : null}
          {busy ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-brand-soft"
            >
              <span className="sr-only">Loading {title}</span>
              <span className="block h-full w-1/3 animate-pulse bg-brand" />
            </div>
          ) : null}
          {src ? (
            <iframe
              // A new link is a new document: remount rather than navigate, so
              // the frame's history never holds a spent sign-in link.
              key={src}
              src={src}
              title={title}
              onLoad={(e) => {
                setFrameLoading(false);
                // So F / F11 work while the page inside has focus too.
                fullscreen.listenOn(e.currentTarget.contentWindow);
                connectTabs(e.currentTarget.contentWindow);
              }}
              className="block h-full w-full border-0 bg-white"
              // Downloads (Excel exports) and pop-ups C_Panel opens itself.
              allow="clipboard-write"
            />
          ) : (
            <div className="space-y-3 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-[60vh] w-full" />
            </div>
          )}
        </div>
      )}
    </ControlPanelPage>
  );
}
