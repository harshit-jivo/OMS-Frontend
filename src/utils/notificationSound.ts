/**
 * Short notification chime using the Web Audio API (Phase 3, Task 7).
 *
 * - No audio asset needed (synthesised tone).
 * - Respects browser autoplay policy: nothing plays until the user has
 *   interacted with the page at least once (we unlock on first input).
 * - Debounced so a burst of rapid notifications never stacks overlapping
 *   sounds.
 */

let audioContext: AudioContext | null = null;
let userHasInteracted = false;
let lastPlayedAt = 0;

const MIN_INTERVAL_MS = 1500;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  return audioContext;
};

const markInteracted = () => {
  userHasInteracted = true;
  // Resume a context that may have started in a suspended state.
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => undefined);
  }
};

/** Attach one-time listeners so the first user gesture unlocks audio. */
export const initNotificationSound = () => {
  if (typeof window === "undefined") return;
  const opts = { once: false, passive: true } as AddEventListenerOptions;
  window.addEventListener("pointerdown", markInteracted, opts);
  window.addEventListener("keydown", markInteracted, opts);
  window.addEventListener("touchstart", markInteracted, opts);
};

/** Play the chime, honouring autoplay policy and debouncing. */
export const playNotificationSound = () => {
  if (!userHasInteracted) return; // autoplay not permitted yet

  const now = Date.now();
  if (now - lastPlayedAt < MIN_INTERVAL_MS) return; // debounce bursts
  lastPlayedAt = now;

  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);

  try {
    const now2 = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, now2);
    gain.gain.exponentialRampToValueAtTime(0.15, now2 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now2 + 0.35);

    // Two quick tones — a pleasant "ding".
    [880, 1174.66].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now2 + index * 0.12);
      oscillator.connect(gain);
      oscillator.start(now2 + index * 0.12);
      oscillator.stop(now2 + index * 0.12 + 0.18);
    });
  } catch {
    /* ignore audio errors */
  }
};
