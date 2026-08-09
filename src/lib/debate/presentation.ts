/**
 * Pure view-model helpers derived from debate + speech state.
 *
 * These live outside the components on purpose. Every route needs the same
 * derivations, and keeping them free of React and the DOM means they can be
 * unit-tested without a renderer — see the testing milestone in
 * docs/frontend-migration-notes.md.
 *
 * Nothing here may import React, touch the DOM, or read browser globals.
 */

import type { DebateMessage, Side, SpeakerStatus } from "./types";
import type { Phase } from "./useDebate";

/** The slice of `useSpeech`'s return value these helpers depend on. */
export interface SpeechView {
  speakingId: string | null;
  revealFraction: number;
  revealedIds: Set<string>;
  syncActive: boolean;
}

/**
 * Reveal whole words only, never cutting mid-word, up to `fraction`.
 *
 * Uses Intl.Segmenter for grapheme-correct behaviour where available: Arabic
 * combining marks must not be split off from their base character, which a
 * naive index slice will happily do. Falls back to whitespace tokens, which is
 * already safe for the languages this app debates in.
 */
export function revealedText(text: string, fraction: number, locale = "en"): string {
  if (fraction >= 1) return text;
  if (fraction <= 0) return "";

  const tokens = text.split(/(\s+)/);
  const wordCount = tokens.filter((t) => t.trim()).length;
  if (wordCount === 0) return "";

  const targetWords = Math.floor(wordCount * fraction);
  let seen = 0;
  let out = "";
  for (const token of tokens) {
    if (token.trim()) {
      if (seen >= targetWords) break;
      seen++;
    }
    out += token;
  }

  // Guard against a partial trailing grapheme if the caller passed a text that
  // was already sliced upstream.
  if (typeof Intl !== "undefined" && "Segmenter" in Intl && out.length > 0) {
    const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
    const graphemes = [...segmenter.segment(out)];
    const last = graphemes[graphemes.length - 1];
    if (last && last.segment.length > 1 && !text.startsWith(out)) {
      out = out.slice(0, last.index);
    }
  }

  return out;
}

/**
 * Speaker status corrected for the generation/voice skew.
 *
 * With TTS on, the model generates and the judge scores far ahead of what has
 * actually been read aloud. Showing raw generation status makes the UI
 * contradict what the audience is hearing, so when voice sync is active the
 * status is derived from the voice queue instead.
 */
export function effectiveStatus(
  side: Side,
  status: Record<Side, SpeakerStatus>,
  messages: DebateMessage[],
  speech: SpeechView,
): SpeakerStatus {
  if (!speech.syncActive) return status[side];

  const sideMessages = messages.filter((m) => m.side === side);
  if (sideMessages.some((m) => m.id === speech.speakingId)) return "speaking";

  const hasPendingVoice = sideMessages.some(
    (m) =>
      !m.streaming &&
      m.content.trim() &&
      m.id !== speech.speakingId &&
      !speech.revealedIds.has(m.id),
  );

  return hasPendingVoice || status[side] !== "idle" ? "thinking" : "idle";
}

/** Round number derived from the raw turn counter. Two turns make a round. */
export function roundFromTurn(turnIndex: number): number {
  return Math.floor(turnIndex / 2) + 1;
}

/** Round number corrected for the generation/voice skew, as `effectiveStatus`. */
export function effectiveRound(
  turnIndex: number,
  messages: DebateMessage[],
  speech: SpeechView,
): number {
  if (!speech.syncActive) return roundFromTurn(turnIndex);

  const speaking = messages.find((m) => m.id === speech.speakingId);
  if (speaking) return speaking.round;

  const lastRevealed = [...messages].reverse().find((m) => speech.revealedIds.has(m.id));
  return lastRevealed?.round ?? 1;
}

/**
 * Which side, if either, is currently holding the floor. Drives the character
 * lighting and the spotlight on the stage.
 */
export function speakingSide(
  status: Record<Side, SpeakerStatus>,
  messages: DebateMessage[],
  speech: SpeechView,
): Side | null {
  if (effectiveStatus("alpha", status, messages, speech) === "speaking") return "alpha";
  if (effectiveStatus("beta", status, messages, speech) === "speaking") return "beta";
  return null;
}

/**
 * The text to show in a side's speech cloud: its most recent turn, truncated
 * to whatever the voice has actually read aloud when sync is active.
 */
export function cloudText(
  side: Side,
  messages: DebateMessage[],
  speech: SpeechView,
  locale = "en",
): string | null {
  const visible = speech.syncActive
    ? messages.filter(
        (m) => m.side === side && (m.id === speech.speakingId || speech.revealedIds.has(m.id)),
      )
    : messages.filter((m) => m.side === side);

  const latest = visible[visible.length - 1];
  if (!latest) return null;

  if (speech.syncActive && latest.id === speech.speakingId && !speech.revealedIds.has(latest.id)) {
    return revealedText(latest.content, speech.revealFraction, locale) || null;
  }
  return latest.content || null;
}

/** Emotional state for a side's character art. Speaking always wins. */
export function agentMood(
  side: Side,
  speaking: Side | null,
  ownScore: number,
  otherScore: number,
): "speaking" | "pleased" | "tense" {
  if (speaking === side) return "speaking";
  return ownScore >= otherScore ? "pleased" : "tense";
}

/**
 * Position of the lean indicator, as a percentage from the PRO end.
 * Clamped away from the extremes so the dot never sits on the track's edge,
 * and centred when there is nothing to compare yet.
 */
export function leanPercent(pro: number, con: number): number {
  const total = pro + con;
  if (total <= 0) return 50;
  return Math.min(92, Math.max(8, (pro / total) * 100));
}

/**
 * A single label describing what the arena is doing right now. Every runtime
 * state maps to exactly one of these, so no state can render as a blank stage.
 */
export type RuntimeState =
  | "idle"
  | "checking"
  | "offline"
  | "starting"
  | "thinking"
  | "streaming"
  | "speaking"
  | "paused"
  | "judging"
  | "finished";

export function runtimeState(args: {
  phase: Phase;
  status: Record<Side, SpeakerStatus>;
  health: Record<Side, "unknown" | "checking" | "online" | "offline">;
  messages: DebateMessage[];
  judging: boolean;
  usingSimulation: boolean;
  speech: SpeechView;
}): RuntimeState {
  const { phase, status, health, messages, judging, usingSimulation, speech } = args;

  if (phase === "paused") return "paused";
  if (phase === "finished") return judging ? "judging" : "finished";

  if (phase === "idle") {
    if (health.alpha === "checking" || health.beta === "checking") return "checking";
    // Simulation is a working state, not an outage — only report offline when
    // we are not falling back to it.
    if (!usingSimulation && health.alpha === "offline" && health.beta === "offline") {
      return "offline";
    }
    return "idle";
  }

  // phase === "running"
  if (speakingSide(status, messages, speech)) return "speaking";
  if (messages.some((m) => m.streaming)) return "streaming";
  if (status.alpha === "thinking" || status.beta === "thinking") return "thinking";
  if (judging) return "judging";
  return messages.length === 0 ? "starting" : "thinking";
}

/** Human-readable status line for each runtime state. */
export function runtimeLabel(state: RuntimeState, simulation: boolean): string {
  const suffix = simulation ? " (simulation)" : "";
  switch (state) {
    case "checking":
      return "Checking local runtimes…";
    case "offline":
      return "Local runtimes unreachable — start the stack or switch to simulation";
    case "starting":
      return `The agents are preparing…${suffix}`;
    case "thinking":
      return `Thinking…${suffix}`;
    case "streaming":
      return `Responding…${suffix}`;
    case "speaking":
      return `Speaking…${suffix}`;
    case "paused":
      return "Paused";
    case "judging":
      return "The judge is scoring…";
    case "finished":
      return "Debate complete";
    case "idle":
    default:
      return "Awaiting the gavel";
  }
}
