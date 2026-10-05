/**
 * Links inside a Control Panel page that lead to ANOTHER Control Panel page.
 *
 * The pages link to each other with their own paths ("Update Targets" on Oils
 * Sale is `<a href="/realise/targets/">`). Followed inside the frame, the
 * frame would change page while OMS's header, sidebar and URL stayed on the
 * old one. So clicks on those links are taken over and opened as OMS routes —
 * the header, the sidebar and the browser's Back all follow, and the new page
 * learns where it came from (its breadcrumb's parent).
 *
 * Only plain left clicks on same-origin links to a known page; anything else
 * (a new-tab click, an export, a link to a page OMS does not show) is left to
 * the browser.
 */

/** C_Panel page path -> the OMS route that shows it. Mirrors backend control_panel/permissions.PAGES. */
export const OMS_ROUTE_FOR_PATH: Record<string, string> = {
  "/realise/": "/Control_Panel/Realise",
  "/realise/sales-channel/": "/Control_Panel/Sales_Channel",
  "/realise/beverages/": "/Control_Panel/Beverages",
  "/realise/realise-dashboard/": "/Control_Panel/Realise_Dashboard",
  "/realise/targets/": "/Control_Panel/Realise/Targets",
  "/sales/": "/Control_Panel/Sales",
  "/inventory/": "/Control_Panel/Inventory",
  "/expenses/": "/Control_Panel/Expenses",
  "/salaries/": "/Control_Panel/Salaries",
};

/** The OMS route an `href` inside the frame leads to, or null. */
export function omsRouteFor(href: string, origin: string): string | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    return OMS_ROUTE_FOR_PATH[url.pathname] ?? null;
  } catch {
    return null;
  }
}

/** Take over clicks on page links inside `win`; returns the unsubscribe. */
export function interceptPageLinks(win: Window, onNavigate: (route: string) => void): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || link.hasAttribute("download") || link.target === "_blank") return;
    const route = omsRouteFor(link.getAttribute("href") ?? "", win.location.origin);
    if (!route) return;
    event.preventDefault();
    onNavigate(route);
  };
  win.document.addEventListener("click", onClick);
  return () => win.document.removeEventListener("click", onClick);
}
