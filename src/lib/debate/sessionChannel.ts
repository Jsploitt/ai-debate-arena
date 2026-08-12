/**
 * Cross-tab transport for the single shared debate session.
 *
 * The debate runs entirely in the browser — there is no server-side session to
 * be the source of truth — so when more than one tab of the app is open, one of
 * them has to actually drive the model calls and the others have to mirror it.
 * That is what this module provides:
 *
 *   - a `BroadcastChannel` carrying snapshots (leader → followers) and commands
 *     (followers → leader);
 *   - a `localStorage` lease that elects exactly one leader and hands leadership
 *     over when that tab closes or stops renewing.
 *
 * Scope, deliberately: `BroadcastChannel` and `localStorage` are partitioned per
 * origin AND per browser profile. Tabs of the same profile sync; separate
 * browser contexts, incognito windows and other machines do not. Syncing those
 * would require a server relay, which this app does not have.
 *
 * Nothing here may run during render — every entry point is SSR-guarded.
 */

import type {
  ConnectionState,
  DebateMessage,
  JudgeScorecard,
  LogEntry,
  Side,
  SpeakerStatus,
  Telemetry,
} from "./types";
import type { Phase, Slot } from "./useDebate";

export const CHANNEL_NAME = "debate-arena-session-v1";
export const LEADER_KEY = "debate-arena-leader-v1";

/** How often the leader renews its lease. */
const RENEW_MS = 1_000;
/** A lease older than this is considered abandoned and may be claimed. */
export const LEASE_TTL_MS = 3_000;
/**
 * Two tabs can write the lease in the same instant. Both then read it back
 * after this delay and see the same winner, so exactly one ends up leading.
 */
const CLAIM_SETTLE_MS = 150;
/**
 * Turn text arrives token by token. Mirroring every token would flood the
 * channel, so snapshots are coalesced onto this interval instead.
 */
export const SNAPSHOT_THROTTLE_MS = 80;
/** Only the tail of the HTTP monitor is mirrored; the full log can be huge. */
export const SNAPSHOT_LOG_LIMIT = 150;

/** The mirrored debate session, in a structured-clone-safe shape. */
export interface SessionSnapshot {
  motion: string;
  topic: string;
  phase: Phase;
  messages: DebateMessage[];
  logs: LogEntry[];
  status: Record<Side, SpeakerStatus>;
  health: Record<Side, ConnectionState>;
  usingSimulation: boolean;
  turnIndex: number;
  lastTelemetry: Record<Side, Telemetry | null>;
  contextTokens: number;
  scorecard: JudgeScorecard | null;
  judging: boolean;
  resolvedModels: Record<Slot, string | null>;
  availableModels: Record<Slot, string[]>;
  /** `Set` survives structured clone, but an array keeps the wire shape plain. */
  speech: {
    speakingId: string | null;
    revealFraction: number;
    revealedIds: string[];
    syncActive: boolean;
  };
}

export type SessionCommand =
  | { action: "start"; topic: string }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "nextTurn" }
  | { action: "reset" }
  | { action: "judge" }
  | { action: "setMotion"; motion: string };

export type ChannelMessage =
  | { type: "snapshot"; from: string; seq: number; snapshot: SessionSnapshot }
  | { type: "request-snapshot"; from: string }
  | { type: "command"; from: string; command: SessionCommand }
  | { type: "leader-bye"; from: string };

export const newClientId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------- transport -------------------------------- */

export interface SessionChannel {
  post: (message: ChannelMessage) => void;
  close: () => void;
}

/**
 * Opens the channel, or returns a no-op when BroadcastChannel is unavailable
 * (SSR, or an old browser). Callers never need to branch on support: without a
 * channel every tab simply behaves as a standalone leader, which is exactly the
 * old single-tab behaviour.
 */
export function openSessionChannel(onMessage: (message: ChannelMessage) => void): SessionChannel {
  if (typeof BroadcastChannel === "undefined") {
    return { post: () => {}, close: () => {} };
  }
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<ChannelMessage>) => onMessage(event.data);
  return {
    post: (message) => {
      try {
        channel.postMessage(message);
      } catch {
        // A closed channel (tab tearing down) must never throw into React.
      }
    },
    close: () => channel.close(),
  };
}

/* ----------------------------- leader lease ------------------------------- */

interface Lease {
  id: string;
  ts: number;
}

function readLease(): Lease | null {
  try {
    const raw = window.localStorage.getItem(LEADER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Lease>;
    if (typeof parsed.id !== "string" || typeof parsed.ts !== "number") return null;
    return { id: parsed.id, ts: parsed.ts };
  } catch {
    return null;
  }
}

function writeLease(id: string) {
  try {
    window.localStorage.setItem(LEADER_KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch {
    /* private mode / quota — the tab just never becomes leader */
  }
}

export function releaseLease(id: string) {
  if (typeof window === "undefined") return;
  if (readLease()?.id === id) {
    try {
      window.localStorage.removeItem(LEADER_KEY);
    } catch {
      /* ignore */
    }
  }
}

/** True when the lease is free, expired, or already ours. */
function claimable(lease: Lease | null, id: string) {
  return !lease || lease.id === id || Date.now() - lease.ts > LEASE_TTL_MS;
}

/**
 * Whether some tab is currently holding a live lease.
 *
 * Callers use this before handing a command to the channel: if the driver has
 * gone and no successor has been elected yet, there is nobody to receive it and
 * posting would silently drop the user's click.
 */
export function leaseIsFresh(): boolean {
  if (typeof window === "undefined") return false;
  const lease = readLease();
  return !!lease && Date.now() - lease.ts <= LEASE_TTL_MS;
}

/**
 * Runs one election round. Writes the lease if it looks claimable, then reads
 * it back after a settle delay so simultaneous claimants converge on one winner.
 */
export async function contestLease(id: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const lease = readLease();
  if (!claimable(lease, id)) return false;
  // Renewing a lease we already hold needs no settle delay.
  if (lease?.id === id) {
    writeLease(id);
    return true;
  }
  writeLease(id);
  await new Promise((resolve) => setTimeout(resolve, CLAIM_SETTLE_MS));
  return readLease()?.id === id;
}

export const LEASE_RENEW_MS = RENEW_MS;
