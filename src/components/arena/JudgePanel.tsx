import { Activity, Gavel, Loader2, Trophy } from "lucide-react";
import { JUDGE_CRITERIA } from "@/lib/debate/judge";
import type { JudgeScorecard, JudgeSideScore, Side } from "@/lib/debate/types";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function SideCardSkeleton({ side }: { side: Side }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-2.5 w-36" />
        </div>
        <div className="space-y-2 text-right">
          <Skeleton className="ml-auto h-7 w-14" />
          <Skeleton className="ml-auto h-2.5 w-8" />
        </div>
      </div>
      <div className="space-y-3">
        {JUDGE_CRITERIA.map((c) => (
          <div key={`${side}-${c}`} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-2.5 w-6" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-2.5 w-4/5" />
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

function JudgeSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <SideCardSkeleton side="alpha" />
        <SideCardSkeleton side="beta" />
      </div>
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
        <Skeleton className="mb-2 h-3 w-52" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  reason,
  side,
  scale = 10,
  weight = 1,
}: {
  label: string;
  value: number;
  reason?: string;
  side: Side;
  scale?: number;
  weight?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        <span className="flex items-center gap-1.5">
          {label}
          {weight !== 1 && (
            <span
              className={cn(
                "rounded-sm border px-1 text-[9px]",
                weight === 0
                  ? "border-border/70 text-muted-foreground/70 line-through"
                  : "border-primary/50 text-primary",
              )}
            >
              x{weight}
            </span>
          )}
        </span>
        <span className={side === "alpha" ? "text-alpha" : "text-beta"}>{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            side === "alpha" ? "bg-alpha" : "bg-beta",
          )}
          style={{ width: `${Math.min(100, (value / (scale || 10)) * 100)}%` }}
        />
      </div>
      {reason && (
        <p className="text-[11px] leading-snug text-muted-foreground/90 italic">{reason}</p>
      )}
    </div>
  );
}


function SideCard({
  side,
  name,
  score,
  winner,
  scale,
  maxTotal,
  weights,
}: {
  side: Side;
  name: string;
  score: JudgeSideScore;
  winner: boolean;
  scale: number;
  maxTotal: number;
  weights?: Record<string, number>;
}) {
  const accent = side === "alpha" ? "text-alpha" : "text-beta";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 transition-colors",
        winner
          ? side === "alpha"
            ? "border-alpha/60 bg-alpha/5"
            : "border-beta/60 bg-beta/5"
          : "border-border/70 bg-muted/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("text-sm font-semibold", accent)}>{name}</p>
          <p className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {side === "alpha" ? "For the resolution" : "Against the resolution"}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("font-mono text-3xl leading-none font-bold", accent)}>
            {score.total.toFixed(1)}
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">/ {maxTotal}</p>
        </div>
      </div>

      <div className="space-y-2">
        {JUDGE_CRITERIA.map((c) => (
          <ScoreRow
            key={c}
            label={c}
            value={score.scores[c]}
            reason={score.reasons?.[c]}
            side={side}
            scale={scale}
            weight={weights?.[c] ?? 1}
          />

        ))}
      </div>

      {score.summary && (
        <p className="text-xs leading-relaxed text-muted-foreground">{score.summary}</p>
      )}
    </div>
  );
}

export function JudgePanel({
  scorecard,
  judging,
  names,
  onJudge,
  canJudge,
}: {
  scorecard: JudgeScorecard | null;
  judging: boolean;
  names: Record<Side, string>;
  onJudge: () => void;
  canJudge: boolean;
}) {
  return (
    <section className="arena-panel rounded-2xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gavel className="size-5 text-primary" />
          <h2 className="text-sm font-semibold tracking-[0.18em] uppercase">AI Judge Scorecard</h2>
          {scorecard?.interim && (
            <span className="flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-primary uppercase">
              <Activity className="size-3 animate-pulse" />
              Live · {scorecard.turnsScored} turns
            </span>
          )}
          {judging && scorecard && (
            <Loader2 className="size-3.5 animate-spin text-primary" aria-label="Updating score" />
          )}
          {scorecard?.simulated && (
            <span className="rounded-full border border-border/70 px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              Heuristic
            </span>
          )}
        </div>
        <button
          onClick={onJudge}
          disabled={!canJudge || judging}
          className="rounded-full border border-primary/50 px-4 py-1.5 font-mono text-xs tracking-[0.14em] text-primary uppercase transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {judging ? "Scoring…" : scorecard ? "Re-score" : "Score debate"}
        </button>
      </header>

      {judging && (
        <div
          className="mb-4 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin text-primary" />
          <p className="font-mono text-[11px] tracking-[0.14em] text-primary uppercase">
            Judge is updating…
          </p>
          <p className="text-xs text-muted-foreground">
            {scorecard
              ? "Re-reading the latest turns and adjusting each criterion."
              : "Reading the transcript and scoring both debaters."}
          </p>
        </div>
      )}

      {judging && !scorecard && <JudgeSkeleton />}

      {!judging && !scorecard && (
        <p className="py-6 text-sm text-muted-foreground">
          The judge scores Logic, Evidence, Rebuttal, Clarity and Persuasion for each side, updating
          live after every round and explaining each score.
        </p>
      )}

      {scorecard && (
        <div className={cn("space-y-4 transition-opacity", judging && "opacity-60")}>

          <div className="grid gap-3 md:grid-cols-2">
            <SideCard
              side="alpha"
              name={names.alpha}
              score={scorecard.alpha}
              winner={scorecard.winner === "alpha"}
              scale={scorecard.scale ?? 10}
              maxTotal={scorecard.maxTotal ?? 50}
              weights={scorecard.weights}
            />
            <SideCard
              side="beta"
              name={names.beta}
              score={scorecard.beta}
              winner={scorecard.winner === "beta"}
              scale={scorecard.scale ?? 10}
              maxTotal={scorecard.maxTotal ?? 50}
              weights={scorecard.weights}
            />
          </div>

          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="mb-1 flex items-center gap-2">
              <Trophy className="size-4 text-primary" />
              <p className="font-mono text-xs tracking-[0.18em] text-primary uppercase">
                {scorecard.winner === "tie"
                  ? scorecard.interim
                    ? "Running score — Level"
                    : "Verdict — Draw"
                  : `${scorecard.interim ? "Leading" : "Verdict"} — ${scorecard.winner === "alpha" ? names.alpha : names.beta}${scorecard.interim ? " ahead" : " wins"}`}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85">{scorecard.verdict}</p>
          </div>
        </div>
      )}


    </section>
  );
}
