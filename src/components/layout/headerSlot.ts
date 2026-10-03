/**
 * The top bar's centre slot.
 *
 * `AppHeader` renders an empty flex region between the logo and the bell;
 * `Sidebar` (the shell) captures that element and provides it here. A page
 * that wants its title in the bar portals into it — today only the Control
 * Panel pages, which put their name, filters' period and Refresh there
 * instead of spending a card on them.
 *
 * A portal rather than a "set the title" store: the content stays part of the
 * page's React tree, so its buttons close over the page's live state and it
 * unmounts with the page. There is nothing to clear on navigation.
 *
 * `null` outside the shell (tests, the login screen); callers then render
 * their header inline.
 */
import { createContext, useContext } from "react";

export const HeaderSlotContext = createContext<HTMLElement | null>(null);

export function useHeaderSlot(): HTMLElement | null {
  return useContext(HeaderSlotContext);
}
