import { perspectiveScores } from "@/lib/arena/perspectives";
import { CHARACTERS } from "@/lib/arena/characters";
import { cn } from "@/lib/utils";
import type { JudgeScorecard } from "@/lib/debate/types";

/**
 * The four judging perspectives. These render into the slot the topic scroller
 * vacates — same region, different state, never a new screen.
 */
export function PerspectiveCards({
  scorecard,
  arabic = false,
  entering = false,
}: {
  scorecard: JudgeScorecard | null;
  arabic?: boolean;
  entering?: boolean;
}) {
  const readings = perspectiveScores(scorecard);
  const scored = Boolean(scorecard);

  return (
    <div className="grid h-full w-full grid-cols-4 items-stretch gap-5">
      {readings.map((reading, index) => {
        const { perspective, alpha, beta, leader } = reading;
        const leaderColor =
          leader === "alpha"
            ? CHARACTERS.alpha.color
            : leader === "beta"
              ? CHARACTERS.beta.color
              : "var(--steel)";

        return (
          <div
            key={perspective.id}
            className={cn(
              "flex flex-col justify-center gap-4 rounded-2xl border border-hairline bg-surface-1 px-6 py-5",
              entering && "arena-rise",
            )}
            style={entering ? { animationDelay: `${index * 60}ms` } : undefined}
            dir={arabic ? "rtl" : "ltr"}
          >
            <div>
              <p className="arena-label" style={{ color: leaderColor }}>
                {arabic ? perspective.labelAr : perspective.label}
              </p>
              <p className={cn("mt-1 text-data leading-snug text-steel", arabic && "font-kufi")}>
                {arabic ? perspective.blurbAr : perspective.blurb}
              </p>
            </div>

            {/* Opposed bars sharing a centre line: which side owns this lens is
                readable as a shape before any number is read. */}
            {/* Pinned to LTR even in Arabic: Faisal stands on the left of the
                stage in every language, so his number and bar must too. */}
            <div dir="ltr">
              <div className="flex items-end justify-between font-mono text-title font-bold leading-none">
                {/* A row of zeroes before the first score reads as a result;
                    an em-dash reads as "not yet", which is the truth. */}
                <span style={{ color: CHARACTERS.alpha.color, opacity: scored ? 1 : 0.35 }}>
                  {scored ? alpha : "—"}
                </span>
                <span style={{ color: CHARACTERS.beta.color, opacity: scored ? 1 : 0.35 }}>
                  {scored ? beta : "—"}
                </span>
              </div>
              {/* Opposed from a shared centre, so the winner of this lens is a
                  shape before it is a number. */}
              <div className="mt-2 flex h-3 items-stretch gap-[3px]">
                <div className="flex flex-1 justify-end rounded-l-full bg-surface-2">
                  <span
                    className="h-full rounded-l-full transition-[width] duration-700 ease-out"
                    style={{ width: `${alpha}%`, backgroundColor: CHARACTERS.alpha.color }}
                  />
                </div>
                <div className="flex flex-1 rounded-r-full bg-surface-2">
                  <span
                    className="h-full rounded-r-full transition-[width] duration-700 ease-out"
                    style={{ width: `${beta}%`, backgroundColor: CHARACTERS.beta.color }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
