import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { useSettings } from "@/components/arena/SettingsProvider";
import { useDebate } from "@/lib/debate/useDebate";
import { useSpeech } from "@/lib/debate/useSpeech";
import {
  LEASE_RENEW_MS,
  SNAPSHOT_LOG_LIMIT,
  SNAPSHOT_THROTTLE_MS,
  contestLease,
  newClientId,
  openSessionChannel,
  releaseLease,
} from "@/lib/debate/sessionChannel";
import type {
  ChannelMessage,
  SessionChannel,
  SessionCommand,
  SessionSnapshot,
} from "@/lib/debate/sessionChannel";
import type { SpeechView } from "@/lib/debate/presentation";
import type { Phase, Slot } from "@/lib/debate/useDebate";
import type {
  ConnectionState,
  DebateMessage,
  JudgeScorecard,
  LogEntry,
  Side,
  SpeakerStatus,
  Telemetry,
} from "@/lib/debate/types";

/**
 * The debate session, shared by every view of it.
 *
 * Two things used to be true and are no longer:
 *
 *  1. `/` and `/arena` each called `useDebate()` themselves, so they were two
 *     unrelated state machines. Navigating between them destroyed the debate,
 *     and the "Full scorecard" link landed on an empty page.
 *  2. Nothing was shared between browser tabs at all.
 *
 * Now there is exactly one session. Within a tab it lives here, above the
 * router outlet. Across tabs of the same profile, one tab holds a lease and
 * drives the models while the others mirror its snapshots and forward their
 * control actions to it — so any page, in any tab, can start, pause or reset
 * the same debate.
 */

/** Everything a view needs, identical in shape whether led or mirrored. */
interface DebateView {
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
  start: (topic: string) => Promise<void>;
  pause: () => void;
  resume: () => void;
  nextTurn: () => Promise<void>;
  reset: () => void;
  judgeDebate: () => Promise<void>;
}

interface DebateSessionValue {
  debate: DebateView;
  speech: SpeechView & { stop: () => void };
  /** The motion under consideration, shared by the `/` picker and `/arena` field. */
  motion: string;
  setMotion: (motion: string) => void;
  /** Starts the shared motion; a no-op when it is empty or already running. */
  startDebate: () => void;
  /** Clears the debate, the voice queue and the motion together. */
  resetAll: () => void;
  /** True when this tab is the one actually driving the models. */
  isDriving: boolean;
}

const DebateSessionContext = createContext<DebateSessionValue | null>(null);

export function DebateProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  // "electing" renders this tab's own (empty) state, exactly as a lone tab
  // behaves, until the lease resolves a few hundred milliseconds after mount.
  const [role, setRole] = useState<"electing" | "leader" | "follower">("electing");
  const isLeader = role === "leader";

  const debate = useDebate(settings, { active: isLeader });
  const speech = useSpeech(settings, debate.messages, { active: isLeader });

  const [ownMotion, setOwnMotion] = useState("");
  const [mirror, setMirror] = useState<SessionSnapshot | null>(null);
  /** Follower-side optimistic motion, so typing is not a channel round-trip. */
  const [motionDraft, setMotionDraft] = useState<string | null>(null);

  const clientIdRef = useRef<string | null>(null);
  const channelRef = useRef<SessionChannel | null>(null);
  const seqRef = useRef(0);
  const mirrorRef = useRef<SessionSnapshot | null>(null);
  mirrorRef.current = mirror;

  /* ------------------------------ snapshots ------------------------------- */

  // The publisher reads through a ref so the throttle timer never captures a
  // stale session, and so the effect below does not re-subscribe every render.
  const snapshotRef = useRef<SessionSnapshot | null>(null);
  snapshotRef.current = {
    motion: ownMotion,
    topic: debate.topic,
    phase: debate.phase,
    messages: debate.messages,
    logs: debate.logs.slice(-SNAPSHOT_LOG_LIMIT),
    status: debate.status,
    health: debate.health,
    usingSimulation: debate.usingSimulation,
    turnIndex: debate.turnIndex,
    lastTelemetry: debate.lastTelemetry,
    contextTokens: debate.contextTokens,
    scorecard: debate.scorecard,
    judging: debate.judging,
    resolvedModels: debate.resolvedModels,
    availableModels: debate.availableModels,
    speech: {
      speakingId: speech.speakingId,
      revealFraction: speech.revealFraction,
      revealedIds: [...speech.revealedIds],
      syncActive: speech.syncActive,
    },
  };

  const publish = useCallback(() => {
    const id = clientIdRef.current;
    const snapshot = snapshotRef.current;
    if (!id || !snapshot) return;
    channelRef.current?.post({ type: "snapshot", from: id, seq: ++seqRef.current, snapshot });
  }, []);

  /* ------------------------------- commands ------------------------------- */

  // Commands arrive asynchronously from other tabs, so the executor reads the
  // current handlers through a ref rather than closing over one render's copy.
  const handlersRef = useRef({
    start: debate.start,
    pause: debate.pause,
    resume: debate.resume,
    nextTurn: debate.nextTurn,
    reset: debate.reset,
    judgeDebate: debate.judgeDebate,
    stopSpeech: speech.stop,
  });
  handlersRef.current = {
    start: debate.start,
    pause: debate.pause,
    resume: debate.resume,
    nextTurn: debate.nextTurn,
    reset: debate.reset,
    judgeDebate: debate.judgeDebate,
    stopSpeech: speech.stop,
  };

  const roleRef = useRef(role);
  roleRef.current = role;

  const runCommand = useCallback((command: SessionCommand) => {
    const h = handlersRef.current;
    switch (command.action) {
      case "setMotion":
        setOwnMotion(command.motion);
        break;
      case "start":
        setOwnMotion(command.topic);
        // Clear the voice queue first: without this a restart inherited the
        // previous debate's spoken/revealed ids and suppressed the new turns.
        h.stopSpeech();
        void h.start(command.topic).catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : "The arena could not start.");
        });
        break;
      case "pause":
        h.pause();
        break;
      case "resume":
        h.resume();
        break;
      case "nextTurn":
        void h.nextTurn();
        break;
      case "reset":
        h.reset();
        h.stopSpeech();
        setOwnMotion("");
        break;
      case "judge":
        void h.judgeDebate();
        break;
    }
  }, []);

  const dispatch = useCallback(
    (command: SessionCommand, leader: boolean) => {
      const id = clientIdRef.current;
      if (leader || !id || !channelRef.current) {
        // We are the driver (or there is no channel at all): apply locally.
        runCommand(command);
        return;
      }
      channelRef.current.post({ type: "command", from: id, command });
    },
    [runCommand],
  );

  // A click can land in the ~150ms before the lease settles. Holding those
  // commands until the role is known keeps them from being applied to the wrong
  // tab — or posted to a channel where no leader is listening yet.
  const pendingRef = useRef<SessionCommand[]>([]);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  const send = useCallback(
    (command: SessionCommand) => {
      if (roleRef.current === "electing") {
        pendingRef.current.push(command);
        return;
      }
      dispatch(command, roleRef.current === "leader");
    },
    [dispatch],
  );

  useEffect(() => {
    if (role === "electing" || pendingRef.current.length === 0) return;
    const queued = pendingRef.current;
    pendingRef.current = [];
    for (const command of queued) dispatchRef.current(command, role === "leader");
  }, [role]);

  /* -------------------------- channel + election -------------------------- */

  const publishRef = useRef(publish);
  publishRef.current = publish;
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;
  const adoptRef = useRef(debate.adoptSession);
  adoptRef.current = debate.adoptSession;

  useEffect(() => {
    const id = newClientId();
    clientIdRef.current = id;

    const channel = openSessionChannel((message: ChannelMessage) => {
      if (message.from === id) return;
      switch (message.type) {
        case "snapshot":
          // A snapshot from a peer is proof someone else is driving. Mirror it;
          // the election below will have this tab settle as a follower.
          if (roleRef.current !== "leader") {
            setMirror(message.snapshot);
            setMotionDraft((draft) => (draft === message.snapshot.motion ? null : draft));
          }
          break;
        case "request-snapshot":
          if (roleRef.current === "leader") publishRef.current();
          break;
        case "command":
          if (roleRef.current === "leader") runCommandRef.current(message.command);
          break;
        case "leader-bye":
          // Claim immediately rather than waiting out the lease TTL.
          void contestLease(id).then((won) => setRole(won ? "leader" : "follower"));
          break;
      }
    });
    channelRef.current = channel;
    channel.post({ type: "request-snapshot", from: id });

    let cancelled = false;
    const elect = async () => {
      const won = await contestLease(id);
      if (cancelled) return;
      setRole(won ? "leader" : "follower");
      if (won) publishRef.current();
    };
    void elect();
    const timer = setInterval(() => void elect(), LEASE_RENEW_MS);

    const handoff = () => {
      if (roleRef.current === "leader") {
        releaseLease(id);
        channel.post({ type: "leader-bye", from: id });
      }
    };
    window.addEventListener("pagehide", handoff);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", handoff);
      handoff();
      channel.close();
      channelRef.current = null;
    };
  }, []);

  /**
   * Promotion: the tab that was driving has gone. Take its last snapshot into
   * this tab's own state machine so the transcript, score and history survive
   * the handover instead of resetting to an empty arena.
   */
  const wasLeaderRef = useRef(false);
  useEffect(() => {
    if (isLeader && !wasLeaderRef.current) {
      const snapshot = mirrorRef.current;
      if (snapshot) {
        adoptRef.current(snapshot);
        setOwnMotion(snapshot.motion);
        setMirror(null);
      }
    }
    wasLeaderRef.current = isLeader;
  }, [isLeader]);

  /**
   * Leader: mirror state outward on every render, rate-limited.
   *
   * This is a throttle, not a debounce: a turn streams a token every few tens of
   * milliseconds, and a debounce would simply never fire until generation
   * stopped — followers would sit frozen for the whole turn.
   */
  const lastPublishRef = useRef(0);
  useEffect(() => {
    if (!isLeader) return;
    const elapsed = Date.now() - lastPublishRef.current;
    if (elapsed >= SNAPSHOT_THROTTLE_MS) {
      lastPublishRef.current = Date.now();
      publish();
      return;
    }
    const timer = setTimeout(() => {
      lastPublishRef.current = Date.now();
      publish();
    }, SNAPSHOT_THROTTLE_MS - elapsed);
    return () => clearTimeout(timer);
  });

  /* ------------------------------- the value ------------------------------ */

  const mirrored = !isLeader && mirror ? mirror : null;

  const motion = motionDraft ?? mirrored?.motion ?? ownMotion;

  const setMotion = useCallback(
    (value: string) => {
      if (isLeader) setOwnMotion(value);
      else setMotionDraft(value);
      send({ action: "setMotion", motion: value });
    },
    [isLeader, send],
  );

  const startDebate = useCallback(() => {
    const trimmed = motion.trim();
    if (!trimmed) return;
    send({ action: "start", topic: trimmed });
  }, [motion, send]);

  const resetAll = useCallback(() => {
    setMotionDraft(null);
    send({ action: "reset" });
  }, [send]);

  const speechView = useMemo(
    () =>
      mirrored
        ? {
            speakingId: mirrored.speech.speakingId,
            revealFraction: mirrored.speech.revealFraction,
            revealedIds: new Set(mirrored.speech.revealedIds),
            syncActive: mirrored.speech.syncActive,
            // A mirroring tab produces no sound, so there is nothing local to
            // stop — and it must not reach across and silence the driving tab.
            stop: () => {},
          }
        : speech,
    [mirrored, speech],
  );

  const debateView = useMemo<DebateView>(() => {
    const base = mirrored ?? {
      topic: debate.topic,
      phase: debate.phase,
      messages: debate.messages,
      logs: debate.logs,
      status: debate.status,
      health: debate.health,
      usingSimulation: debate.usingSimulation,
      turnIndex: debate.turnIndex,
      lastTelemetry: debate.lastTelemetry,
      contextTokens: debate.contextTokens,
      scorecard: debate.scorecard,
      judging: debate.judging,
      resolvedModels: debate.resolvedModels,
      availableModels: debate.availableModels,
    };
    return {
      topic: base.topic,
      phase: base.phase,
      messages: base.messages,
      logs: base.logs,
      status: base.status,
      health: base.health,
      usingSimulation: base.usingSimulation,
      turnIndex: base.turnIndex,
      lastTelemetry: base.lastTelemetry,
      contextTokens: base.contextTokens,
      scorecard: base.scorecard,
      judging: base.judging,
      resolvedModels: base.resolvedModels,
      availableModels: base.availableModels,
      start: async (topic: string) => send({ action: "start", topic }),
      pause: () => send({ action: "pause" }),
      resume: () => send({ action: "resume" }),
      nextTurn: async () => send({ action: "nextTurn" }),
      reset: () => resetAll(),
      judgeDebate: async () => send({ action: "judge" }),
    };
  }, [mirrored, debate, send, resetAll]);

  const value = useMemo<DebateSessionValue>(
    () => ({
      debate: debateView,
      speech: speechView,
      motion,
      setMotion,
      startDebate,
      resetAll,
      isDriving: isLeader,
    }),
    [debateView, speechView, motion, setMotion, startDebate, resetAll, isLeader],
  );

  return <DebateSessionContext.Provider value={value}>{children}</DebateSessionContext.Provider>;
}

export function useDebateSession(): DebateSessionValue {
  const context = useContext(DebateSessionContext);
  if (!context) {
    throw new Error("useDebateSession must be used inside a DebateProvider");
  }
  return context;
}
