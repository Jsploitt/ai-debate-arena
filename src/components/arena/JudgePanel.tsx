import { Activity, Gavel, Loader2, Trophy } from "lucide-react";
import { JUDGE_CRITERIA } from "@/lib/debate/judge";
import type { JudgeScorecard, JudgeSideScore, Side } from "@/lib/debate/types";
import { cn } from "@/lib/utils";

function ScoreRow({
  label,
  value,
  reason,
  side,
}: {
  label: string;
  value: number;
  reason?: string;
  side: Side;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
        <span>{label}</span>
        <span className={side === "alpha" ? "text-alpha" : "text-beta"}>{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700",
            side === "alpha" ? "bg-alpha" : "bg-beta",
          )}
          style={{ width: `${(value / 10) * 100}%` }}
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
}: {
  side: Side;
  name: string;
  score: JudgeSideScore;
  winner: boolean;
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
          <p className="font-mono text-[10px] text-muted-foreground">/ 50</p>
        </div>
      </div>

      <div className="space-y-2">
        {JUDGE_CRITERIA.map((c) => (
          <ScoreRow key={c} label={c} value={score.scores[c]} side={side} />
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

      {judging && !scorecard && (
        <div className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-primary" />
          The AI Judge is reading the transcript and scoring both debaters…
        </div>
      )}

      {!judging && !scorecard && (
        <p className="py-6 text-sm text-muted-foreground">
          The judge scores Logic, Evidence, Rebuttal, Clarity and Persuasion for each side once the
          debate finishes.
        </p>
      )}

      {scorecard && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <SideCard
              side="alpha"
              name={names.alpha}
              score={scorecard.alpha}
              winner={scorecard.winner === "alpha"}
            />
            <SideCard
              side="beta"
              name={names.beta}
              score={scorecard.beta}
              winner={scorecard.winner === "beta"}
            />
          </div>

          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="mb-1 flex items-center gap-2">
              <Trophy className="size-4 text-primary" />
              <p className="font-mono text-xs tracking-[0.18em] text-primary uppercase">
                {scorecard.winner === "tie"
                  ? "Verdict — Draw"
                  : `Verdict — ${scorecard.winner === "alpha" ? names.alpha : names.beta} wins`}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85">{scorecard.verdict}</p>
          </div>
        </div>
      )}
    </section>
  );
}
