/**
 * Inner tabs of the Control Panel pages, driven from the OMS sidebar.
 *
 * Two production pages have tabs of their own: Oils Sale (Overview / Map /
 * Realise) and Inventory (its nine sections). The OMS sidebar lists them as
 * rows (`tab` in components/layout/navigation.ts) that open `?tab=<id>`, and
 * this file is the two-way bridge to the page in the frame:
 *
 *   apply  — switch the page to a tab, using the page's OWN mechanism (its
 *            tab button, its `goTo()`), so it does exactly what a click in the
 *            page does — loads the same data, sets the same state;
 *   watch  — report the tab when the user switches inside the page, so the
 *            URL (and the sidebar's highlight) follow.
 *
 * `apply` is a no-op when the tab is already showing, which is what keeps
 * watch -> URL -> apply from looping. The frame is same-origin (the pages are
 * served by OMS's own backend), so reaching into its window is allowed.
 */

export interface TabAdapter {
  /** Show `tab`. Returns false when the page does not have it. */
  apply(win: Window, tab: string): boolean;
  /** Call `onChange` when the user switches tab inside the page; returns an unsubscribe. */
  watch(win: Window, onChange: (tab: string) => void): () => void;
}

type InventoryWindow = Window & { goTo?: (section: string) => void };

/** Inventory: sections `#s-<id>`, switched by the page's global `goTo(id)`. */
export const INVENTORY_TABS: TabAdapter = {
  apply(win, tab) {
    const w = win as InventoryWindow;
    const doc = w.document;
    if (typeof w.goTo !== "function" || !doc.getElementById(`s-${tab}`)) return false;
    const current = (doc.querySelector(".ni.on") as HTMLElement | null)?.dataset.s;
    if (current !== tab) w.goTo(tab);
    return true;
  },
  watch(win, onChange) {
    const w = win as InventoryWindow;
    // Two ways the page switches section, so two listeners:
    //  * its nav items (`.ni`) switch by their own click handler, never via
    //    `goTo` — listen for those clicks;
    //  * its in-page links (KPI cards, "Trace" buttons) call the global
    //    `goTo` by name at click time — wrap it.
    const onNavClick = (event: Event) => {
      const item = (event.target as Element | null)?.closest?.(".ni[data-s]") as HTMLElement | null;
      if (item?.dataset.s) onChange(item.dataset.s);
    };
    w.document.addEventListener("click", onNavClick);
    const original = w.goTo;
    const wrapped =
      typeof original === "function"
        ? function (this: unknown, section: string) {
            const result = original.call(this, section);
            onChange(section);
            return result;
          }
        : undefined;
    if (wrapped) w.goTo = wrapped;
    return () => {
      w.document.removeEventListener("click", onNavClick);
      if (wrapped && w.goTo === wrapped) w.goTo = original;
    };
  },
};

/** Oils Sale: `.wb-tabs` buttons, `data-pane="wbOverview" | "wbMap" | "wbRealise"`. */
const OILS_PANES: Record<string, string> = { overview: "wbOverview", map: "wbMap", realise: "wbRealise" };
const OILS_TAB_OF: Record<string, string> = Object.fromEntries(
  Object.entries(OILS_PANES).map(([tab, pane]) => [pane, tab]),
);

export const OILS_SALE_TABS: TabAdapter = {
  apply(win, tab) {
    const pane = OILS_PANES[tab];
    const button = pane
      ? (win.document.querySelector(`.wb-tabs [data-pane="${pane}"]`) as HTMLButtonElement | null)
      : null;
    if (!button) return false;
    if (button.getAttribute("aria-selected") !== "true" && !button.classList.contains("on")) button.click();
    return true;
  },
  watch(win, onChange) {
    const onClick = (event: Event) => {
      const button = (event.target as Element | null)?.closest?.(".wb-tabs [data-pane]") as HTMLElement | null;
      const tab = button ? OILS_TAB_OF[button.dataset.pane ?? ""] : undefined;
      if (tab) onChange(tab);
    };
    win.document.addEventListener("click", onClick);
    return () => win.document.removeEventListener("click", onClick);
  },
};
