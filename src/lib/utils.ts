import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Join class names, letting a later Tailwind utility beat an earlier one.
 *
 * `clsx` handles the conditional forms (`{ active: isActive }`, arrays, nulls).
 * `twMerge` then resolves CONFLICTS between Tailwind utilities, which plain
 * concatenation cannot: `"px-2 px-4"` produces two rules of equal specificity,
 * and which one wins depends on the order Tailwind happened to emit them in,
 * not the order they were written. `cn` makes the later one win, which is what
 * every caller assumes.
 *
 * That is the whole reason a component takes a `className` prop at all — a
 * caller must be able to override a default. Without `twMerge` the override
 * silently loses about half the time.
 *
 * It only knows about Tailwind utilities. The app's own class names
 * (`si-btn`, `app-card`) pass through untouched, which is what makes it safe
 * to use while both systems coexist.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
