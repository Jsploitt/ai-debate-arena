import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CHARACTERS } from "@/lib/arena/characters";
import type { JudgeScorecard, Side } from "@/lib/debate/types";

/**
 * The Mīzān rail — the signature element.
 *
 * One weighted marker on one horizon line, carrying the entire debate state in
 * a single shape that reads from across the aisle with no text at all. The
 * marker moves once per scored turn with an overshoot-and-settle, the way a
 * balance beam finds equilibrium; it does not tween linearly like a progress
 * bar. The rail's fill bleeds toward whoever leads, so the screen's horizon
 * itself tilts blue or green.
 */

/** Signed lean in [-1, 1]: negative favours alpha (left), positive beta (right). */
export function leanFromScorecard(scorecard: JudgeScorecard | null): number {
  if (!scorecard) return 0;
  const total = scorecard.alpha.total + scorecard.beta.total;
  if (total <= 0) return 0;
  const raw = (scorecard.beta.total - scorecard.alpha.total) / total;
  // Amplify: real judges rarely produce lopsided totals, and a marker that
  // never leaves the middle communicates nothing at booth distance.
  return Math.max(-1, Math.min(1, raw * 2.6));
}

export function LeanRail({
  scorecard,
  settled,
  arabic = false,
}: {
  scorecard: JudgeScorecard | null;
  /** True once the debate is over — the marker locks and starts pulsing. */
  settled: boolean;
  arabic?: boolean;
}) {
  const lean = leanFromScorecard(scorecard);
  const percent = 50 + lean * 44;
  const leader: Side | "tie" = Math.abs(lean) < 0.04 ? "tie" : lean < 0 ? "alpha" : "beta";
  const leaderColor =
    leader === "alpha" ? "var(--faisal)" : leader === "beta" ? "var(--majed)" : "var(--steel)";

  // Secondary wobble, replayed on each move so the marker feels weighted.
  const [moveKey, setMoveKey] = useState(0);
  const lastLean = useRef(lean);
  useEffect(() => {
    if (Math.abs(lean - lastLean.current) > 0.005) {
      lastLean.current = lean;
      setMoveKey((k) => k + 1);
    }
  }, [lean]);

  return (
    <div className="relative w-full select-none" aria-hidden={false}>
      <div className="mb-3 flex items-end justify-between">
        <RailEnd side="alpha" leading={leader === "alpha"} arabic={arabic} />
        <RailEnd side="beta" leading={leader === "beta"} arabic={arabic} />
      </div>

      <div className="relative h-[18px] w-full">
        {/* track */}
        <div className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full bg-surface-2 ring-1 ring-hairline" />

        {/* the horizon tilts toward the leader */}
        <div
          className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-full transition-all duration-[900ms] ease-out"
          style={{
            background:
              lean === 0
                ? "linear-gradient(90deg, transparent, rgb(147 167 196 / .35), transparent)"
                : lean < 0
                  ? `linear-gradient(90deg, var(--faisal) 0%, color-mix(in oklab, var(--faisal) 40%, transparent) ${percent}%, transparent ${percent + 6}%)`
                  : `linear-gradient(270deg, var(--majed) 0%, color-mix(in oklab, var(--majed) 40%, transparent) ${100 - percent}%, transparent ${106 - percent}%)`,
          }}
        />

        {/* module ticks, on the same 1/8 grid as the kufic lattice */}
        <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-[3%]">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "block w-[2px] rounded-full bg-hairline",
                i === 4 ? "h-[18px] bg-steel/70" : "h-[9px]",
              )}
            />
          ))}
        </div>

        {/* the marker */}
        <div
          className="absolute top-1/2 transition-[left] duration-[900ms]"
          style={{
            left: `${percent}%`,
            transitionTimingFunction: "cubic-bezier(0.34, 1.42, 0.5, 1)",
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            key={moveKey}
            className={cn("relative grid place-items-center", !settled && "arena-wobble")}
          >
            <span
              className={cn(
                "absolute size-16 rounded-full blur-xl transition-colors duration-700",
                settled && "arena-halo",
              )}
              style={{ backgroundColor: leaderColor, opacity: 0.5 }}
            />
            {/* kufic module: a square on its corner, not a dot */}
            <span
              className="relative block size-[26px] rotate-45 rounded-[5px] border-2 transition-colors duration-700"
              style={{
                backgroundColor: leaderColor,
                borderColor: "rgb(255 255 255 / 0.85)",
                boxShadow: `0 0 34px -4px ${leaderColor}`,
              }}
            />
            {settled && (
              <span
                className="absolute size-[46px] rotate-45 rounded-[10px] border-2 arena-halo"
                style={{ borderColor: leaderColor }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RailEnd({ side, leading, arabic }: { side: Side; leading: boolean; arabic: boolean }) {
  const character = CHARACTERS[side];
  // Stance only: the characters carry their own names a few pixels above, and
  // repeating them here just adds text to a element whose whole point is being
  // readable without any.
  return (
    <span
      className={cn("arena-label transition-opacity duration-500", side === "beta" && "text-right")}
      style={{ color: character.color, opacity: leading ? 1 : 0.5 }}
    >
      {arabic ? character.stanceAr : character.stance}
    </span>
  );
}
