/**
 * Stage primitives ported from the reference design.
 *
 * Shared by `/` and `/arena` so the two routes cannot drift apart visually.
 * These are presentational only — they take plain values, never the debate
 * hook, so they stay trivially renderable in a test.
 */

import { PRO_ART, CON_ART } from "@/lib/agent-art";

/**
 * Default side-keyed art, used when a slot has no character selected.
 * The images themselves now live in `lib/agent-art.ts`.
 */
export const AGENT_ART = {
  alpha: PRO_ART,
  beta: CON_ART,
} as const;

export function TopicRail({
  topics,
  onPick,
  reverse,
  disabled,
}: {
  topics: string[];
  onPick: (topic: string) => void;
  reverse?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden py-1.5">
      <ul
        // Pauses on hover (as the reference does) and additionally on
        // focus-within, so a keyboard user can actually reach a pill that would
        // otherwise slide out from under them.
        className={`flex w-max list-none gap-3 group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused] ${
          reverse ? "topic-marquee-rev" : "topic-marquee"
        }`}
      >
        {/* Duplicated so the marquee can loop seamlessly; the copy is hidden
            from assistive tech so topics are not announced twice. */}
        {[...topics, ...topics].map((topic, i) => (
          <li key={`${topic}-${i}`} aria-hidden={i >= topics.length || undefined}>
            <button
              type="button"
              disabled={disabled}
              tabIndex={i >= topics.length ? -1 : undefined}
              onClick={() => onPick(topic)}
              className="shrink-0 rounded-lg border border-border bg-background/60 px-5 py-2.5 text-center text-sm whitespace-nowrap text-foreground/85 backdrop-blur transition-colors hover:border-primary hover:bg-primary/15 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              {topic}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CloudBubble({
  side,
  active,
  text,
  dir = "ltr",
}: {
  side: "alpha" | "beta";
  active: boolean;
  text: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div
      className={`bubble-pop cloud-bubble px-6 py-4 transition-all duration-500 ${
        side === "alpha" ? "cloud-tail-left self-start" : "cloud-tail-right self-end"
      } ${active ? "scale-100 opacity-100" : "scale-95 opacity-45"}`}
    >
      <p dir={dir} className="text-sm leading-relaxed font-medium">
        {text}
      </p>
    </div>
  );
}

export function LeanBar({ pro, con, percent }: { pro: number; con: number; percent: number }) {
  return (
    <div
      className="relative mx-auto mt-2.5 h-1 w-56 rounded-full bg-gradient-to-r from-pro/70 via-muted to-con/70"
      role="meter"
      aria-label="Which side is ahead"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={`Alpha ${pro.toFixed(1)}, Beta ${con.toFixed(1)}`}
    >
      <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-y-1/2 bg-border" />
      <span
        style={{ left: `${percent}%` }}
        className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_14px_2px_var(--primary)] transition-[left] duration-700 ease-out"
      />
    </div>
  );
}

export function AgentStage({
  label,
  img,
  lit,
  dim,
  position,
  compact,
  flip,
}: {
  label: string;
  img: string;
  lit: boolean;
  dim: boolean;
  position: "left" | "right";
  /** Shorter art for the /arena band, which shares the viewport with panels. */
  compact?: boolean;
  /**
   * Mirror the art horizontally, so a character drawn for one side still faces
   * into the stage when placed on the other. Safe to do here because nothing
   * else on the stage is directional: the spotlight beam is centred on the
   * figure and the lit glow has no offset.
   */
  flip?: boolean;
}) {
  const height = compact ? "h-[22vh] sm:h-[30vh]" : "h-[46vh] sm:h-[60vh]";
  return (
    <div
      className={`pointer-events-none absolute bottom-0 ${position === "left" ? "left-0" : "right-0"}`}
    >
      <div
        className={`pointer-events-none absolute -top-6 left-1/2 h-[105%] w-[240px] -translate-x-1/2 transition-opacity duration-700 sm:w-[320px] ${
          lit ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="spotlight-beam h-full w-full" />
      </div>
      <img
        src={img}
        alt=""
        aria-hidden="true"
        width={768}
        height={1024}
        className={`relative ${height} w-auto object-contain transition-all duration-700 ${
          flip ? "scale-x-[-1]" : ""
        } ${
          lit
            ? "brightness-125 drop-shadow-[0_0_45px_oklch(0.7_0.13_240/0.6)]"
            : dim
              ? "opacity-60 brightness-50"
              : "brightness-90"
        }`}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ScoreSide({
  label,
  name,
  score,
  color,
  align = "left",
}: {
  label: string;
  name: string;
  score: number;
  color: string;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={`font-display text-[10px] tracking-[0.3em] uppercase ${color}`}>
        {label} · {name}
      </div>
      <div className="font-display text-2xl font-bold">{score.toFixed(1)}</div>
    </div>
  );
}

/** The broadcast scoreboard: both totals, round progress, and the lean bar. */
export function ScoreBanner({
  names,
  proTotal,
  conTotal,
  round,
  totalRounds,
  personaTitle,
  leanPercent,
  provisional,
}: {
  names: { alpha: string; beta: string };
  proTotal: number;
  conTotal: number;
  round: number;
  totalRounds: number;
  personaTitle: string;
  leanPercent: number;
  provisional?: boolean;
}) {
  return (
    <div className="arena-panel mx-auto mt-2 flex max-w-4xl items-center justify-between rounded-xl px-5 py-2">
      <ScoreSide label="Agent Pro" name={names.alpha} score={proTotal} color="text-pro" />
      <div className="text-center">
        <div className="font-display text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          Round {Math.min(Math.max(round, 1), totalRounds)} / {totalRounds} · {personaTitle} judging
          {provisional ? " · provisional" : ""}
        </div>
        <div className="mt-1 flex justify-center gap-1.5">
          {Array.from({ length: totalRounds }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={`h-1.5 w-10 rounded-full ${round > n ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        <LeanBar pro={proTotal} con={conTotal} percent={leanPercent} />
      </div>
      <ScoreSide
        label="Agent Con"
        name={names.beta}
        score={conTotal}
        color="text-con"
        align="right"
      />
    </div>
  );
}
