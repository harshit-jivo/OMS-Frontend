/**
 * The carousel's chrome, as on JI's wall boards: which slide is up, how long it
 * has left, and what a person standing at the screen might do about it.
 *
 * It takes no height from the board: it floats over the board's header, and
 * only its progress line (pinned to the top edge, never faded) says the screen
 * is a rotation when nobody is near it.
 */
import type { Ref } from "react";

import { DWELL_CHOICES } from "./rotation";

const Path = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);

export interface StripSlide {
  key: string;
  label: string;
}

export function CarouselStrip({
  slides,
  index,
  turn,
  remaining,
  paused,
  dwellSeconds,
  visible,
  rowRef,
  isFullscreen,
  canFullscreen,
  onGoTo,
  onPrevious,
  onNext,
  onTogglePaused,
  onDwellChange,
  onToggleFullscreen,
}: {
  slides: readonly StripSlide[];
  index: number;
  turn: string | null;
  remaining: number;
  paused: boolean;
  dwellSeconds: number;
  visible: boolean;
  rowRef: Ref<HTMLDivElement>;
  isFullscreen: boolean;
  canFullscreen: boolean;
  onGoTo: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePaused: () => void;
  onDwellChange: (seconds: number) => void;
  onToggleFullscreen: () => void;
}) {
  return (
    <div className="exb-strip" data-visible={visible ? "yes" : "no"}>
      <div className="exb-progress" data-paused={paused ? "yes" : "no"}>
        {turn !== null ? (
          <i
            key={turn}
            style={{ "--exb-dwell": `${dwellSeconds}s`, "--exb-steps": dwellSeconds } as React.CSSProperties}
          />
        ) : null}
      </div>

      <div className="exb-strip-row" ref={rowRef}>
        <div className="exb-state-pill" data-paused={paused ? "yes" : "no"}>
          <i />
          {paused ? "HELD" : "ROTATING"}
        </div>

        {/* One named dot per slide: a reader can tell what is coming without waiting for it. */}
        <div className="exb-dots" role="tablist" aria-label="Slides in this rotation">
          {slides.map((slide, position) => (
            <button
              key={slide.key}
              type="button"
              role="tab"
              aria-selected={position === index}
              className="exb-dot"
              onClick={() => onGoTo(position)}
              title={`Show ${slide.label} (${position + 1})`}
            >
              <span>{slide.label}</span>
            </button>
          ))}
        </div>

        <div className="exb-count" aria-live="off">
          {paused ? "held" : `${remaining}s`}
          <em>{paused ? "not rotating" : `of ${dwellSeconds}s`}</em>
        </div>

        <div className="exb-controls">
          <button type="button" className="exb-btn" onClick={onPrevious} aria-label="Previous slide" title="Previous slide (←)">
            <Path d="M15 5 8 12l7 7" />
          </button>
          <button
            type="button"
            className="exb-btn"
            onClick={onTogglePaused}
            aria-pressed={paused}
            aria-label={paused ? "Resume rotation" : "Hold this slide"}
            title={paused ? "Resume rotation (space)" : "Hold this slide (space)"}
          >
            <Path d={paused ? "M7 4v16l13-8z" : "M9 4v16M15 4v16"} />
          </button>
          <button type="button" className="exb-btn" onClick={onNext} aria-label="Next slide" title="Next slide (→)">
            <Path d="m9 5 7 7-7 7" />
          </button>
          <label>
            <span className="exb-sr">Seconds per slide</span>
            <select
              className="exb-select"
              value={dwellSeconds}
              onChange={(event) => onDwellChange(Number(event.target.value))}
              title="How long each slide holds the screen"
            >
              {DWELL_CHOICES.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds < 60 ? `${seconds}s` : `${seconds / 60} min`}
                </option>
              ))}
            </select>
          </label>
          {canFullscreen ? (
            <button
              type="button"
              className="exb-btn"
              onClick={onToggleFullscreen}
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Show fullscreen"}
              title={isFullscreen ? "Exit fullscreen (Esc)" : "Show fullscreen (F)"}
            >
              <Path d={isFullscreen ? "M9 3v6H3M15 3v6h6M15 21v-6h6M9 21v-6H3" : "M3 9V3h6M21 9V3h-6M21 15v6h-6M3 15v6h6"} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
