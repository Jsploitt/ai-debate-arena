import { JUDGE_CRITERIA } from "@/lib/debate/judge";
import { CHARACTERS } from "@/lib/arena/characters";
import { cn } from "@/lib/utils";
import type { JudgeScorecard, Side } from "@/lib/debate/types";

/**
 * The judge as a banner across the top of the stage — no avatar, no third
 * character. It is the only warm-coloured element on screen, so it reads as
 * an authority above the two sides rather than a competitor between them.
 */
export function JudgeBanner({
  scorecard,
  judging,
  names,
  arabic = false,
  dormant = false,
}: {
  scorecard: JudgeScorecard | null;
  judging: boolean;
  names: Record<Side, string>;
  arabic?: boolean;
  /** Pre-selection: the mark rests quietly and no scores are shown. */
  dormant?: boolean;
}) {
  const scale = scorecard?.scale || 10;

  return (
    <div className="flex w-full items-center gap-8 rounded-2xl border border-hairline bg-surface-1/80 px-8 py-4 backdrop-blur">
      <div className="flex shrink-0 items-center gap-4">
        <JudgeMark active={judging || Boolean(scorecard)} />
        <div>
          <p className="arena-label text-judge">{arabic ? "الحكم" : "AI Judge"}</p>
          <p className="mt-0.5 text-data text-steel">
            {judging
              ? arabic
                ? "يقيّم الجولة"
                : "Scoring the round"
              : scorecard
                ? arabic
                  ? `${scorecard.turnsScored} مداخلات مُقيّمة`
                  : `${scorecard.turnsScored} ${scorecard.turnsScored === 1 ? "turn" : "turns"} scored`
                : arabic
                  ? "بانتظار الجولة الأولى"
                  : "Awaiting first round"}
          </p>
        </div>
      </div>

      {dormant || !scorecard ? (
        <p className={cn("flex-1 text-body text-steel/70", arabic && "text-right font-kufi")}>
          {arabic
            ? "يقيّم الحكم المنطق والأدلة والرد والوضوح والإقناع بعد كل جولة."
            : "Logic, Evidence, Rebuttal, Clarity and Persuasion — scored after every round."}
        </p>
      ) : (
        <div className="grid flex-1 grid-cols-5 gap-6">
          {JUDGE_CRITERIA.map((criterion) => {
            const a = scorecard.alpha.scores[criterion] ?? 0;
            const b = scorecard.beta.scores[criterion] ?? 0;
            const weight = scorecard.weights?.[criterion] ?? 1;
            return (
              // dir is pinned: the left number is always the character standing
              // on the left of the stage, whatever the debate language is.
              <div key={criterion} dir="ltr" className={cn(weight === 0 && "opacity-35")}>
                <p className={cn("arena-label text-steel/70", arabic && "text-right")}>
                  {criterion}
                </p>
                <div className="mt-1.5 flex items-baseline gap-2 font-mono text-body-l font-bold leading-none">
                  <span style={{ color: CHARACTERS.alpha.color }}>{a.toFixed(1)}</span>
                  <span className="text-steel/40">·</span>
                  <span style={{ color: CHARACTERS.beta.color }}>{b.toFixed(1)}</span>
                </div>
                <OpposedBar alpha={a / scale} beta={b / scale} />
              </div>
            );
          })}
        </div>
      )}

      {scorecard && !dormant && (
        <div className="shrink-0 border-l border-hairline pl-8 text-right">
          <p className="arena-label text-steel/70">
            {scorecard.interim ? (arabic ? "المتصدر" : "Leading") : arabic ? "الحكم" : "Verdict"}
          </p>
          <p
            className="mt-1 font-display text-title font-bold leading-none"
            style={{
              color:
                scorecard.winner === "alpha"
                  ? CHARACTERS.alpha.color
                  : scorecard.winner === "beta"
                    ? CHARACTERS.beta.color
                    : "var(--steel)",
            }}
          >
            {scorecard.winner === "tie" ? (arabic ? "تعادل" : "Level") : names[scorecard.winner]}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Two bars growing outward from a shared centre. Adjacent bars would read as
 * one continuous fill at distance, which is the opposite of the point.
 */
function OpposedBar({ alpha, beta }: { alpha: number; beta: number }) {
  return (
    <div className="mt-2 flex h-2 items-stretch gap-[3px]">
      <div className="flex flex-1 justify-end rounded-l-full bg-surface-2">
        <span
          className="h-full rounded-l-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.min(100, alpha * 100)}%`,
            backgroundColor: CHARACTERS.alpha.color,
          }}
        />
      </div>
      <div className="flex flex-1 rounded-r-full bg-surface-2">
        <span
          className="h-full rounded-r-full transition-[width] duration-700 ease-out"
          style={{
            width: `${Math.min(100, beta * 100)}%`,
            backgroundColor: CHARACTERS.beta.color,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The judge's mark: an abstract gold module built from the same square grid as
 * everything else. This is the deliberate fallback for the floating-bisht
 * idea — same choreography (it rests low pre-selection and rises into the
 * banner), a fraction of the failure surface, and it does not compete with the
 * Mizan rail for the visitor's memory.
 */
export function JudgeMark({ active, size = 48 }: { active: boolean; size?: number }) {
  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <span
        className={cn(
          "absolute inset-0 rotate-45 rounded-[22%] border-2 border-judge/50",
          active && "arena-judge-pulse",
        )}
      />
      <span
        className="absolute rotate-45 rounded-[22%] bg-judge"
        style={{ width: size * 0.42, height: size * 0.42, opacity: active ? 1 : 0.45 }}
      />
      {active && (
        <span
          className="absolute inset-0 rounded-full blur-lg"
          style={{ backgroundColor: "var(--judge-gold)", opacity: 0.35 }}
        />
      )}
    </span>
  );
}
