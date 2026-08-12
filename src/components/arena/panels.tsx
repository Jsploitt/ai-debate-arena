/**
 * Instrumented arena panels, built in the reference design language.
 *
 * All presentational: they take plain engine values, never the hook itself.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Gavel, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JUDGE_CRITERIA } from "@/lib/debate/judge";
import { contentDir, revealedText } from "@/lib/debate/presentation";
import type {
  ConnectionState,
  DebateLanguage,
  DebateMessage,
  JudgeScorecard,
  LogEntry,
  Side,
  Telemetry,
} from "@/lib/debate/types";
import { cn } from "@/lib/utils";

export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[10px] tracking-[0.25em] text-muted-foreground uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section
      aria-labelledby={id}
      className={cn("arena-panel flex flex-col rounded-xl p-4", className)}
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <h2 id={id}>
          <Kicker>{title}</Kicker>
        </h2>
        {action}
      </div>
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ------------------------------- Transcript ------------------------------- */

function ReasoningBlock({
  reasoning,
  locale,
}: {
  reasoning: string;
  locale: { dir: "rtl" | "ltr"; lang: DebateLanguage };
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="font-display inline-flex items-center gap-1 text-[10px] tracking-[0.2em] text-muted-foreground uppercase transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
        Reasoning
      </button>
      {open && (
        <p
          {...locale}
          className="mt-1.5 border-l-2 border-border pl-3 text-[12px] leading-relaxed text-muted-foreground italic"
        >
          {reasoning}
        </p>
      )}
    </div>
  );
}

export function TranscriptPanel({
  messages,
  names,
  topic,
  language,
  speakingId,
  revealFraction,
  revealedIds,
  syncActive,
  autoFollow,
  onAutoFollowChange,
}: {
  messages: DebateMessage[];
  names: Record<Side, string>;
  topic: string;
  language: DebateLanguage;
  speakingId: string | null;
  revealFraction: number;
  revealedIds: Set<string>;
  syncActive: boolean;
  autoFollow: boolean;
  onAutoFollowChange: (value: boolean) => void;
}) {
  const dir = contentDir(language);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = syncActive
    ? messages.filter((m) => m.id === speakingId || revealedIds.has(m.id))
    : messages;

  useEffect(() => {
    if (!autoFollow) return;
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [visible.length, revealFraction, autoFollow]);

  return (
    <Panel
      title="Transcript"
      className="h-[52vh] min-h-[380px] overflow-hidden"
      bodyClassName="flex flex-col"
      action={
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={autoFollow}
            onChange={(e) => onAutoFollowChange(e.target.checked)}
            className="size-3.5 accent-[var(--primary)]"
          />
          <Kicker>Auto-follow</Kicker>
        </label>
      }
    >
      {topic && (
        <p {...dir} className="mb-3 shrink-0 text-sm text-foreground/80">
          <Kicker className="me-2">Motion</Kicker>
          {topic}
        </p>
      )}

      <div
        ref={scrollRef}
        className="arena-scroll min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pe-1"
        aria-live="polite"
        aria-relevant="additions"
      >
        {visible.length === 0 && (
          <p className="py-8 text-center text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
            No turns yet
          </p>
        )}

        {visible.map((message) => {
          const isAlpha = message.side === "alpha";
          const revealing = syncActive && message.id === speakingId && !revealedIds.has(message.id);
          const content = revealing
            ? revealedText(message.content, revealFraction, language)
            : message.content;

          return (
            <article
              key={message.id}
              className={cn(
                "rounded-xl border p-3",
                isAlpha ? "border-pro/30 bg-pro/5" : "border-con/30 bg-con/5",
              )}
            >
              <header className="mb-1.5 flex items-baseline justify-between gap-2">
                <Kicker className={isAlpha ? "text-pro" : "text-con"}>
                  Round {message.round} · {names[message.side]}
                </Kicker>
                {message.telemetry && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {message.telemetry.ttftMs}ms · {message.telemetry.tokensPerSec} tok/s
                  </span>
                )}
              </header>

              <p {...dir} className="text-sm leading-relaxed whitespace-pre-wrap">
                {content}
                {(message.streaming || revealing) && (
                  <span className="ms-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-middle" />
                )}
              </p>

              {message.reasoning && <ReasoningBlock reasoning={message.reasoning} locale={dir} />}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

/* ------------------------------- Scorecard -------------------------------- */

function ScoreRow({
  criterion,
  alpha,
  beta,
  alphaReason,
  betaReason,
  scale,
  weight,
  dir,
}: {
  criterion: string;
  alpha: number;
  beta: number;
  alphaReason?: string;
  betaReason?: string;
  scale: number;
  weight: number;
  dir: { dir: "rtl" | "ltr"; lang: DebateLanguage };
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Kicker>
          {criterion} {weight !== 1 && <span className="text-foreground/60">×{weight}</span>}
        </Kicker>
        <span className="font-display text-[11px]">
          <span className="text-pro">{alpha.toFixed(1)}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-con">{beta.toFixed(1)}</span>
        </span>
      </div>
      <div className="flex h-1.5 gap-0.5" aria-hidden="true">
        <div className="flex flex-1 justify-end overflow-hidden rounded-s-full bg-muted">
          <div className="h-full bg-pro" style={{ width: `${(alpha / scale) * 100}%` }} />
        </div>
        <div className="flex flex-1 overflow-hidden rounded-e-full bg-muted">
          <div className="h-full bg-con" style={{ width: `${(beta / scale) * 100}%` }} />
        </div>
      </div>
      {(alphaReason || betaReason) && (
        <dl {...dir} className="space-y-0.5 text-[11px] leading-snug text-muted-foreground">
          {alphaReason && (
            <div>
              <dt className="sr-only">Alpha reason</dt>
              <dd className="border-s-2 border-pro/40 ps-2">{alphaReason}</dd>
            </div>
          )}
          {betaReason && (
            <div>
              <dt className="sr-only">Beta reason</dt>
              <dd className="border-s-2 border-con/40 ps-2">{betaReason}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

export function ScorecardPanel({
  scorecard,
  judging,
  names,
  language,
  canJudge,
  judgeEnabled,
  onJudge,
}: {
  scorecard: JudgeScorecard | null;
  judging: boolean;
  names: Record<Side, string>;
  language: DebateLanguage;
  canJudge: boolean;
  judgeEnabled: boolean;
  onJudge: () => void;
}) {
  const dir = contentDir(language);

  return (
    <Panel
      title="Judge scorecard"
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onJudge}
          disabled={!canJudge || judging || !judgeEnabled}
        >
          {judging ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Gavel className="size-3.5" aria-hidden="true" />
          )}
          {scorecard ? "Re-judge" : "Judge now"}
        </Button>
      }
    >
      <div aria-live="polite">
        {!judgeEnabled && (
          <p className="py-6 text-center text-[11px] text-muted-foreground">
            The AI judge is disabled in configuration.
          </p>
        )}

        {judgeEnabled && !scorecard && (
          <p className="py-6 text-center text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
            {judging ? "Scoring…" : "Not yet scored"}
          </p>
        )}

        {judgeEnabled && scorecard && (
          <div className="space-y-4">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="font-display text-lg font-bold">
                  {scorecard.winner === "tie"
                    ? "Draw"
                    : scorecard.winner === "alpha"
                      ? names.alpha
                      : names.beta}
                </div>
                <Kicker>
                  {scorecard.alpha.total.toFixed(1)} vs {scorecard.beta.total.toFixed(1)} of{" "}
                  {scorecard.maxTotal}
                </Kicker>
              </div>
              <div className="text-end">
                {scorecard.interim && <Kicker className="block text-primary">Provisional</Kicker>}
                {scorecard.simulated && <Kicker className="block">Heuristic</Kicker>}
                <Kicker className="block">
                  {scorecard.turnsScored} turn{scorecard.turnsScored === 1 ? "" : "s"} scored
                </Kicker>
              </div>
            </div>

            <div className="space-y-3">
              {JUDGE_CRITERIA.map((c) => (
                <ScoreRow
                  key={c}
                  criterion={c}
                  alpha={scorecard.alpha.scores[c] ?? 0}
                  beta={scorecard.beta.scores[c] ?? 0}
                  alphaReason={scorecard.alpha.reasons?.[c]}
                  betaReason={scorecard.beta.reasons?.[c]}
                  scale={scorecard.scale}
                  weight={scorecard.weights?.[c] ?? 1}
                  dir={dir}
                />
              ))}
            </div>

            <p {...dir} className="text-sm leading-relaxed text-foreground/90">
              {scorecard.verdict}
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

/* ------------------------- Telemetry + HTTP monitor ----------------------- */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Kicker>{label}</Kicker>
      <div className="font-display text-lg font-bold">{value}</div>
    </div>
  );
}

export function TelemetryPanel({
  telemetry,
  names,
  contextTokens,
  contextWindow,
}: {
  telemetry: Record<Side, Telemetry | null>;
  names: Record<Side, string>;
  contextTokens: number;
  contextWindow: number;
}) {
  const usage = contextWindow > 0 ? Math.min(100, (contextTokens / contextWindow) * 100) : 0;

  return (
    <Panel title="Telemetry">
      <div className="space-y-4">
        {(["alpha", "beta"] as Side[]).map((side) => {
          const t = telemetry[side];
          return (
            <div key={side}>
              <Kicker className={side === "alpha" ? "text-pro" : "text-con"}>{names[side]}</Kicker>
              <div className="mt-1.5 grid grid-cols-4 gap-2">
                <Stat label="TTFT" value={t ? `${t.ttftMs}ms` : "—"} />
                <Stat label="Tok/s" value={t ? t.tokensPerSec.toFixed(1) : "—"} />
                <Stat label="Tokens" value={t ? String(t.tokens) : "—"} />
                <Stat label="Duration" value={t ? `${(t.durationMs / 1000).toFixed(1)}s` : "—"} />
              </div>
            </div>
          );
        })}

        <div>
          <div className="flex items-baseline justify-between">
            <Kicker>Context used</Kicker>
            <span className="font-mono text-[11px] text-muted-foreground">
              {contextTokens.toLocaleString()} / {contextWindow.toLocaleString()}
            </span>
          </div>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="Context window used"
            aria-valuemin={0}
            aria-valuemax={contextWindow}
            aria-valuenow={contextTokens}
          >
            <div
              className={cn(
                "h-full transition-[width]",
                usage > 90 ? "bg-destructive" : "bg-primary",
              )}
              style={{ width: `${usage}%` }}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

const LOG_COLOURS: Record<LogEntry["kind"], string> = {
  request: "text-primary",
  chunk: "text-muted-foreground",
  info: "text-foreground/70",
  error: "text-destructive",
};

export function HttpMonitor({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [logs.length]);

  return (
    <Panel
      title="Live HTTP monitor"
      className="h-[40vh] min-h-[260px] overflow-hidden"
      bodyClassName="flex flex-col"
    >
      <div
        ref={scrollRef}
        className="arena-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain font-mono text-[11px] leading-relaxed"
      >
        {logs.length === 0 && (
          <p className="py-8 text-center tracking-[0.3em] text-muted-foreground uppercase">
            No traffic yet
          </p>
        )}
        {logs.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground/60">
              {new Date(entry.ts).toLocaleTimeString()}
            </span>
            <span className="shrink-0 text-muted-foreground/60">
              [{entry.side === "system" ? "sys" : entry.side}]
            </span>
            <span className={cn("break-all", LOG_COLOURS[entry.kind])}>{entry.text}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ------------------------------- Status rail ------------------------------ */

const HEALTH_TEXT: Record<ConnectionState, string> = {
  unknown: "Unknown",
  checking: "Checking…",
  online: "Online",
  offline: "Offline",
};

const HEALTH_DOT: Record<ConnectionState, string> = {
  unknown: "bg-muted-foreground",
  checking: "bg-primary animate-pulse",
  online: "bg-pro",
  offline: "bg-destructive",
};

export function StatusRail({
  health,
  resolvedModels,
  names,
  simulation,
  judgeEnabled,
  statusLabel,
}: {
  health: Record<Side, ConnectionState>;
  resolvedModels: Record<Side | "judge", string | null>;
  names: Record<Side, string>;
  simulation: boolean;
  judgeEnabled: boolean;
  statusLabel: string;
}) {
  const slots: Array<{ key: Side | "judge"; label: string; state?: ConnectionState }> = [
    { key: "alpha", label: names.alpha, state: health.alpha },
    { key: "beta", label: names.beta, state: health.beta },
    ...(judgeEnabled ? [{ key: "judge" as const, label: "Judge" }] : []),
  ];

  return (
    <div className="arena-panel flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl px-4 py-2.5">
      {slots.map((slot) => (
        <div key={slot.key} className="flex items-center gap-2">
          {slot.state && (
            <span
              className={cn("size-1.5 shrink-0 rounded-full", HEALTH_DOT[slot.state])}
              aria-hidden="true"
            />
          )}
          <Kicker
            className={
              slot.key === "alpha" ? "text-pro" : slot.key === "beta" ? "text-con" : "text-primary"
            }
          >
            {slot.label}
          </Kicker>
          <span className="font-mono text-[10px] text-muted-foreground">
            {resolvedModels[slot.key] ?? "unresolved"}
            {slot.state ? ` · ${HEALTH_TEXT[slot.state]}` : ""}
          </span>
        </div>
      ))}

      <div className="ms-auto flex items-center gap-3">
        {simulation && (
          <span className="rounded-md border border-con/50 bg-con/10 px-2 py-0.5">
            <Kicker className="text-con">Simulation</Kicker>
          </span>
        )}
        <span className="font-display text-[11px] text-foreground/80" aria-live="polite">
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
