import type { ArenaSettings, DebateMessage, JudgeScorecard, Side, SpeakerStatus } from "@/lib/debate/types";
import type { Phase } from "@/lib/debate/useDebate";

/**
 * Two windows, one machine.
 *
 * The public display owns the debate engine; the staff control view sends
 * commands and mirrors a snapshot. BroadcastChannel is the transport, with a
 * localStorage-event fallback for the (unlikely) case it is unavailable — no
 * sockets, no server, nothing that can fail when booth wifi does.
 */

export type ArenaCommand =
  | { kind: "start"; topic: string }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "nextTurn" }
  | { kind: "reset" }
  | { kind: "judge" }
  | { kind: "settings"; patch: Partial<ArenaSettings> }
  | { kind: "showExport" }
  | { kind: "dismissExport" };

export interface ArenaSnapshot {
  phase: Phase;
  topic: string;
  round: number;
  totalRounds: number;
  turnIndex: number;
  messages: DebateMessage[];
  status: Record<Side, SpeakerStatus>;
  scorecard: JudgeScorecard | null;
  judging: boolean;
  usingSimulation: boolean;
  health: Record<Side, string>;
  settings: ArenaSettings;
  exportVisible: boolean;
  /** Wall-clock time the snapshot was produced, used for the staleness pill. */
  ts: number;
}

export type ArenaMessage =
  | { type: "command"; command: ArenaCommand }
  | { type: "snapshot"; snapshot: ArenaSnapshot }
  | { type: "requestSnapshot" }
  | { type: "displayGone" };

const CHANNEL_NAME = "debate-arena-link-v1";
const FALLBACK_KEY = "debate-arena-link-v1-bus";

export interface ArenaLink {
  post: (message: ArenaMessage) => void;
  close: () => void;
}

/**
 * Open the link. `onMessage` never receives this window's own posts.
 */
export function openArenaLink(onMessage: (message: ArenaMessage) => void): ArenaLink {
  if (typeof window === "undefined") {
    return { post: () => {}, close: () => {} };
  }

  const win: Window & typeof globalThis = window;

  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<ArenaMessage>) => onMessage(event.data);
    return {
      post: (message) => channel.postMessage(message),
      close: () => channel.close(),
    };
  }

  // Fallback: storage events fire in every *other* window of the origin, which
  // is exactly the delivery semantics we want.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== FALLBACK_KEY || !event.newValue) return;
    try {
      onMessage(JSON.parse(event.newValue).payload as ArenaMessage);
    } catch {
      /* a torn write is not worth crashing the booth over */
    }
  };
  win.addEventListener("storage", onStorage);
  return {
    post: (message) => {
      try {
        win.localStorage.setItem(
          FALLBACK_KEY,
          JSON.stringify({ nonce: Math.random(), payload: message }),
        );
      } catch {
        /* quota — drop the frame, the next snapshot supersedes it anyway */
      }
    },
    close: () => win.removeEventListener("storage", onStorage),
  };
}

/** Snapshots are posted at most this often, so a fast token stream can't flood the link. */
export const SNAPSHOT_THROTTLE_MS = 220;

/** A control view older than this shows a "display disconnected" state. */
export const SNAPSHOT_STALE_MS = 4000;
