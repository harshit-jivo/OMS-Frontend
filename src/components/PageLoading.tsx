import { cn } from "../lib/utils";

/**
 * What fills the content area while a lazily-loaded page arrives.
 *
 * ALSO the Phase 1 proving ground — the first thing in the app styled with
 * Tailwind rather than a stylesheet. It was chosen because it is the safest
 * possible first case: it is new, so no existing CSS competes with it. That
 * matters more than it sounds. Every other stylesheet in this app is
 * UNLAYERED, and unlayered CSS beats a layered Tailwind utility regardless of
 * specificity — so converting a page that still has its own stylesheet would
 * produce utilities that quietly lose. Migration has to remove the old rules,
 * not just add classes beside them.
 *
 * It replaces an inline `style={{…}}` object and an injected `<style>` tag,
 * which is a fair sample of what the other 815 inline styles look like.
 *
 * Deliberately quiet. Route chunks are small and same-origin, so this is
 * usually on screen for a few dozen milliseconds — long enough for a spinner
 * to flash and be more distracting than the wait it describes. It announces
 * itself to a screen reader, which cannot see that the page is mid-navigation,
 * and only becomes VISIBLE if the load is genuinely slow: the fade starts at
 * zero opacity and holds there for the first 40% of its duration, so a fast
 * load shows nothing at all.
 *
 * `role="status"` with `aria-live="polite"` rather than `alert`: a page
 * loading is not an interruption, and should be announced at a natural pause.
 */
export default function PageLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[40vh] items-center justify-center",
        "text-sm text-subtle",
        // Held back so a fast load shows nothing. `motion-safe:` is the
        // Tailwind idiom for respecting `prefers-reduced-motion`, and it is
        // the right way round: the animation is opt-IN for users who accept
        // motion, rather than something switched off afterwards.
        "opacity-0 motion-safe:animate-[oms-page-loading-fade_1.2s_ease-in_forwards]",
        // Someone who has asked for reduced motion sees the text immediately
        // rather than never — without this they would get a permanently
        // invisible loading state.
        "motion-reduce:opacity-100",
        className,
      )}
    >
      Loading…
    </div>
  );
}
