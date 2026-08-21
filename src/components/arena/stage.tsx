/**
 * Stage primitives ported from the reference design.
 *
 * Shared by `/` and `/arena` so the two routes cannot drift apart visually.
 * These are presentational only — they take plain values, never the debate
 * hook, so they stay trivially renderable in a test.
 */

import { FAHAD_ART, KHALID_ART } from "@/lib/agent-art";

/**
 * Default side-keyed art, used when a slot has no character selected.
 * The images themselves now live in `lib/agent-art.ts`.
 */
export const AGENT_ART = {
  alpha: FAHAD_ART,
  beta: KHALID_ART,
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
              className="shrink-0 rounded-xl border border-border bg-background/60 px-7 py-3.5 text-center text-lg whitespace-nowrap text-foreground/85 backdrop-blur transition-colors hover:border-primary hover:bg-primary/15 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 sm:text-xl"
            >
              {topic}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One constant type size for every turn.
 *
 * An earlier version scaled the type to the text length, which meant a turn
 * started huge and shrank as it streamed in — distracting on a stage. The size
 * is fixed per viewport instead: a clamp tuned so a full 50-word turn (the
 * engine's hard limit) still fits two-up in the column, while the text reads
 * from the back of a booth crowd rather than only at arm's length.
 */
const BUBBLE_TEXT = "text-[clamp(1.4rem,3.1vh,2.25rem)]";

export function CloudBubble({
  side,
  active,
  prominent,
  text,
  dir = "ltr",
}: {
  side: "alpha" | "beta";
  active: boolean;
  /**
   * Gets the larger type. Distinct from `active` so the last turn spoken still
   * reads as the focus during the gap between turns, when nobody is speaking.
   */
  prominent?: boolean;
  text: string;
  dir?: "ltr" | "rtl";
}) {
  // The last turn spoken keeps full contrast during the gap between speakers
  // (`prominent`); only a turn that has actually been replaced recedes. Words
  // on a stage never drop below ~70% opacity — a half-faded argument is
  // unreadable from the room.
  const emphasis = active
    ? "scale-100 opacity-100"
    : prominent
      ? "scale-[0.98] opacity-100"
      : "scale-95 opacity-70";
  return (
    <div
      className={`bubble-pop cloud-bubble px-7 py-5 transition-all duration-500 ${
        side === "alpha" ? "cloud-tail-left self-start" : "cloud-tail-right self-end"
      } ${emphasis}`}
    >
      <p dir={dir} className={`leading-snug font-medium ${BUBBLE_TEXT}`}>
        {text}
      </p>
    </div>
  );
}

export function LeanBar({
  pro,
  con,
  percent,
  compact,
}: {
  pro: number;
  con: number;
  percent: number;
  /** The small original bar, kept for the /arena band. */
  compact?: boolean;
}) {
  return (
    <div
      className={`relative mx-auto rounded-full bg-gradient-to-r from-pro/70 via-muted to-con/70 ${
        compact
          ? "mt-2.5 h-1 w-56"
          : "mt-4 h-4 w-[32rem] max-w-[70vw] shadow-[inset_0_1px_3px_oklch(0.1_0.02_250/0.6)] ring-1 ring-border/70"
      }`}
      role="meter"
      aria-label="Which side is ahead"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={`Alpha ${pro.toFixed(1)}, Beta ${con.toFixed(1)}`}
    >
      <span
        className={`absolute top-1/2 left-1/2 w-px -translate-y-1/2 bg-border ${
          compact ? "h-3" : "h-8"
        }`}
      />
      {/* The knob travels inside a rail inset by its own radius, so at 0% and
          100% it stops flush with the ends instead of hanging over them. */}
      <span className={`absolute inset-y-0 ${compact ? "inset-x-[7px]" : "inset-x-[18px]"}`}>
        <span
          style={{ left: `${percent}%` }}
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary transition-[left] duration-700 ease-out ${
            compact
              ? "size-3.5 shadow-[0_0_14px_2px_var(--primary)]"
              : "size-9 shadow-[0_0_30px_6px_var(--primary)] ring-4 ring-background/80"
          }`}
        />
      </span>
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
  // On the presentation stage the beam overshoots the top of the section by
  // 50vh so it visibly starts at the top of the *screen* — the section begins
  // below the header, and a beam that materialised mid-air read as a glitch.
  // The /arena band shares its viewport with panels above it, so its compact
  // beam stays confined to the band.
  const beamSpan = compact ? "inset-y-0" : "-top-[50vh] bottom-0";
  const beamWidth = compact ? "w-[200px] sm:w-[260px]" : "w-[240px] sm:w-[370px]";
  return (
    // Spans the full height of the stage section so the beam can start at the
    // very top of it; the figure is pinned to the bottom by `justify-end`.
    <div
      className={`pointer-events-none absolute inset-y-0 flex flex-col justify-end ${
        position === "left"
          ? compact
            ? "left-0"
            : "left-[1.5vw]"
          : compact
            ? "right-0"
            : "right-[1.5vw]"
      }`}
    >
      <div
        className={`pointer-events-none absolute ${beamSpan} left-1/2 ${beamWidth} -translate-x-1/2 transition-opacity duration-700 ${
          lit ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="spotlight-beam h-full w-full" />
      </div>
      {!compact && (
        <div
          aria-hidden="true"
          className={`stage-floor pointer-events-none absolute bottom-0 left-1/2 h-[9vh] w-[130%] -translate-x-1/2 transition-opacity duration-700 ${
            lit ? "opacity-90" : "opacity-0"
          }`}
        />
      )}
      <img
        src={img}
        alt=""
        aria-hidden="true"
        // Matches the real asset dimensions, so the browser reserves the right
        // aspect ratio and the figure does not jump on load.
        width={405}
        height={786}
        // Transitions filter and opacity only. `transition-all` also animated
        // `transform`, so mirroring a character into the other slot played as
        // a spin rather than simply being the way they face.
        className={`relative ${height} w-auto object-contain transition-[filter,opacity] duration-700 ${
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

/**
 * The identity card at each debater's feet: who they are, which side they
 * hold, and the model actually speaking for them.
 *
 * This is the single home for identity on the presentation stage — the score
 * banner deliberately shows sides and numbers only, so the same fact is never
 * printed twice on one screen.
 */
export function Nameplate({
  name,
  title,
  side,
  model,
  lit,
  position,
}: {
  name: string;
  /** The character's archetype line; omitted when no character is cast. */
  title?: string;
  side: "alpha" | "beta";
  /** The model serving this slot, as resolved by the runtime. */
  model?: string | null;
  lit: boolean;
  position: "left" | "right";
}) {
  const sideLabel = side === "alpha" ? "For the motion" : "Against the motion";
  const accent = side === "alpha" ? "text-pro" : "text-con";
  return (
    <div
      className={`arena-panel absolute bottom-3 z-10 rounded-xl px-5 py-3 transition-all duration-500 ${
        position === "left" ? "left-3 sm:left-6" : "right-3 text-right sm:right-6"
      } ${lit ? "border-primary/70 shadow-[0_0_36px_-8px_var(--primary)]" : ""}`}
    >
      <div className={`font-display text-sm font-medium tracking-[0.12em] uppercase ${accent}`}>
        {sideLabel}
      </div>
      <div className="font-display text-3xl font-bold sm:text-4xl">{name}</div>
      {(title || model) && (
        <div className="mt-0.5 text-base text-muted-foreground">
          {title}
          {title && model && <span aria-hidden="true"> · </span>}
          {model && <span className="text-muted-foreground/80">{model}</span>}
        </div>
      )}
    </div>
  );
}

export function ScoreSide({
  label,
  name,
  score,
  color,
  align = "left",
  compact,
}: {
  label: string;
  /** Shown after the label on /arena; the presentation stage omits it — the nameplates carry names. */
  name?: string;
  score: number;
  color: string;
  align?: "left" | "right";
  compact?: boolean;
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div
        className={`font-display uppercase ${color} ${
          compact ? "text-[10px] tracking-[0.3em]" : "text-base tracking-[0.14em] sm:text-lg"
        }`}
      >
        {label}
        {name ? ` · ${name}` : ""}
      </div>
      <div className={`font-display font-bold ${compact ? "text-2xl" : "text-5xl sm:text-6xl"}`}>
        {score.toFixed(1)}
      </div>
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
  compact,
}: {
  /**
   * Omitted on the presentation stage, where the nameplates own identity and
   * the banner shows sides and numbers only. /arena passes names.
   */
  names?: { alpha: string; beta: string };
  proTotal: number;
  conTotal: number;
  round: number;
  totalRounds: number;
  /** Omitted on the presentation stage — the judge chip in the footer owns it there. */
  personaTitle?: string;
  leanPercent: number;
  provisional?: boolean;
  /** The tighter original scale, for the /arena stage band. */
  compact?: boolean;
}) {
  const current = Math.min(Math.max(round, 1), totalRounds);
  return (
    <div
      className={`arena-panel mx-auto mt-2 flex items-center justify-between rounded-xl ${
        compact ? "max-w-4xl px-5 py-2" : "max-w-6xl gap-6 px-8 py-2.5"
      }`}
    >
      <ScoreSide
        label={names ? "Agent Pro" : "For"}
        name={names?.alpha}
        score={proTotal}
        color="text-pro"
        compact={compact}
      />
      <div className="text-center">
        <div
          className={`font-display text-muted-foreground uppercase ${
            compact ? "text-[10px] tracking-[0.25em]" : "text-xl tracking-[0.08em] sm:text-2xl"
          }`}
        >
          Round {current} / {totalRounds}
          {personaTitle ? ` · ${personaTitle} judging` : ""}
          {provisional ? " · provisional" : ""}
        </div>
        <div className={`flex justify-center ${compact ? "mt-1 gap-1.5" : "mt-2.5 gap-2.5"}`}>
          {/* The round in progress is lit, not just the completed ones —
              otherwise round 1 shows a row of dead pips at exactly the moment
              the audience is orienting themselves. */}
          {Array.from({ length: totalRounds }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={`rounded-full ${compact ? "h-1.5 w-10" : "h-3 w-20"} ${
                n < current
                  ? "bg-primary/70"
                  : n === current
                    ? "bg-primary shadow-[0_0_12px_2px_var(--primary)]"
                    : "bg-muted"
              }`}
            />
          ))}
        </div>
        <LeanBar pro={proTotal} con={conTotal} percent={leanPercent} compact={compact} />
      </div>
      <ScoreSide
        label={names ? "Agent Con" : "Against"}
        name={names?.beta}
        score={conTotal}
        color="text-con"
        align="right"
        compact={compact}
      />
    </div>
  );
}
