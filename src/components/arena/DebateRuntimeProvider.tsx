import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useSettings } from "@/components/arena/SettingsProvider";
import { useDebate } from "@/lib/debate/useDebate";
import { useSpeech } from "@/lib/debate/useSpeech";

const CHANNEL_NAME = "ai-debate-arena-runtime-v1";

type DebateRuntime = ReturnType<typeof useDebate>;
type SpeechRuntime = ReturnType<typeof useSpeech>;

type DebateSnapshot = Pick<
  DebateRuntime,
  | "resolvedModels"
  | "availableModels"
  | "topic"
  | "phase"
  | "messages"
  | "logs"
  | "status"
  | "health"
  | "usingSimulation"
  | "turnIndex"
  | "lastTelemetry"
  | "contextTokens"
  | "scorecard"
  | "judging"
>;

type SpeechSnapshot = Omit<SpeechRuntime, "revealedIds" | "stop"> & {
  revealedIds: string[];
};

type RuntimeCommand =
  | { name: "start"; value: string }
  | { name: "pause" }
  | { name: "resume" }
  | { name: "nextTurn" }
  | { name: "reset" };

type RuntimeMessage =
  | { type: "claim"; ownerId: string }
  | { type: "release"; ownerId: string }
  | { type: "request-snapshot"; requesterId: string }
  | {
      type: "snapshot";
      ownerId: string;
      debate: DebateSnapshot;
      speech: SpeechSnapshot;
    }
  | { type: "command"; targetOwnerId: string; command: RuntimeCommand };

interface RuntimeContextValue {
  debate: DebateRuntime;
  speech: SpeechRuntime;
  isRuntimeOwner: boolean;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

function makeInstanceId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function snapshotDebate(debate: DebateRuntime): DebateSnapshot {
  return {
    resolvedModels: debate.resolvedModels,
    availableModels: debate.availableModels,
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
  };
}

function snapshotSpeech(speech: SpeechRuntime): SpeechSnapshot {
  return {
    speakingId: speech.speakingId,
    revealFraction: speech.revealFraction,
    revealedIds: [...speech.revealedIds],
    syncActive: speech.syncActive,
  };
}

export function DebateRuntimeProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const localDebate = useDebate(settings);
  const localSpeech = useSpeech(settings, localDebate.messages);

  const instanceIdRef = useRef<string>("");
  if (!instanceIdRef.current) instanceIdRef.current = makeInstanceId();
  const instanceId = instanceIdRef.current;

  const channelRef = useRef<BroadcastChannel | null>(null);
  const ownerIdRef = useRef<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [remoteDebate, setRemoteDebate] = useState<DebateSnapshot | null>(null);
  const [remoteSpeech, setRemoteSpeech] = useState<SpeechSnapshot | null>(null);

  const setOwner = useCallback((nextOwner: string | null) => {
    ownerIdRef.current = nextOwner;
    setOwnerId(nextOwner);
  }, []);

  const post = useCallback((message: RuntimeMessage) => {
    channelRef.current?.postMessage(message);
  }, []);

  const postSnapshot = useCallback(() => {
    if (ownerIdRef.current !== instanceId) return;
    post({
      type: "snapshot",
      ownerId: instanceId,
      debate: snapshotDebate(localDebate),
      speech: snapshotSpeech(localSpeech),
    });
  }, [instanceId, localDebate, localSpeech, post]);

  const executeLocalCommand = useCallback(
    (command: RuntimeCommand) => {
      switch (command.name) {
        case "start":
          void localDebate.start(command.value);
          break;
        case "pause":
          localDebate.pause();
          break;
        case "resume":
          localDebate.resume();
          break;
        case "nextTurn":
          void localDebate.nextTurn();
          break;
        case "reset":
          localDebate.reset();
          localSpeech.stop();
          break;
      }
    },
    [localDebate, localSpeech],
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = channel;

    channel.onmessage = (event: MessageEvent<RuntimeMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;

      switch (message.type) {
        case "claim": {
          if (message.ownerId === instanceId) return;
          // An existing owner wins. This prevents two already-open views from
          // both generating a debate if Start is clicked on the mirror.
          if (ownerIdRef.current === instanceId) {
            postSnapshot();
            return;
          }
          setOwner(message.ownerId);
          localSpeech.stop();
          break;
        }
        case "release": {
          if (ownerIdRef.current === message.ownerId) {
            setOwner(null);
            setRemoteDebate(null);
            setRemoteSpeech(null);
          }
          break;
        }
        case "request-snapshot": {
          if (ownerIdRef.current === instanceId) postSnapshot();
          break;
        }
        case "snapshot": {
          if (message.ownerId === instanceId) return;
          setOwner(message.ownerId);
          setRemoteDebate(message.debate);
          setRemoteSpeech(message.speech);
          break;
        }
        case "command": {
          if (message.targetOwnerId !== instanceId || ownerIdRef.current !== instanceId) return;
          executeLocalCommand(message.command);
          break;
        }
      }
    };

    post({ type: "request-snapshot", requesterId: instanceId });

    const release = () => {
      if (ownerIdRef.current === instanceId) {
        channel.postMessage({ type: "release", ownerId: instanceId } satisfies RuntimeMessage);
      }
    };
    window.addEventListener("beforeunload", release);

    return () => {
      release();
      window.removeEventListener("beforeunload", release);
      channel.close();
      channelRef.current = null;
    };
  }, [executeLocalCommand, instanceId, localSpeech, post, postSnapshot, setOwner]);

  useEffect(() => {
    if (ownerId !== instanceId) return;
    postSnapshot();
  }, [ownerId, instanceId, postSnapshot]);

  const runCommand = useCallback(
    (command: RuntimeCommand) => {
      const currentOwner = ownerIdRef.current;
      if (!currentOwner) {
        setOwner(instanceId);
        post({ type: "claim", ownerId: instanceId });
        executeLocalCommand(command);
        return;
      }
      if (currentOwner === instanceId) {
        executeLocalCommand(command);
        return;
      }
      post({ type: "command", targetOwnerId: currentOwner, command });
    },
    [executeLocalCommand, instanceId, post, setOwner],
  );

  const mirrored = ownerId !== null && ownerId !== instanceId && remoteDebate && remoteSpeech;

  const debate = useMemo<DebateRuntime>(() => {
    const state = mirrored ? remoteDebate : snapshotDebate(localDebate);
    return {
      ...localDebate,
      ...state,
      start: async (value: string) => {
        runCommand({ name: "start", value });
      },
      pause: () => runCommand({ name: "pause" }),
      resume: () => runCommand({ name: "resume" }),
      nextTurn: async () => runCommand({ name: "nextTurn" }),
      reset: () => runCommand({ name: "reset" }),
    };
  }, [localDebate, mirrored, remoteDebate, runCommand]);

  const speech = useMemo<SpeechRuntime>(() => {
    if (!mirrored) return localSpeech;
    return {
      ...localSpeech,
      speakingId: remoteSpeech.speakingId,
      revealFraction: remoteSpeech.revealFraction,
      revealedIds: new Set(remoteSpeech.revealedIds),
      syncActive: remoteSpeech.syncActive,
      // Only the runtime owner owns audio. A mirror's stop request is expressed
      // through Reset/Voice settings rather than manipulating another tab's Audio.
      stop: () => undefined,
    };
  }, [localSpeech, mirrored, remoteSpeech]);

  const value = useMemo(
    () => ({ debate, speech, isRuntimeOwner: ownerId === instanceId }),
    [debate, speech, ownerId, instanceId],
  );

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useDebateRuntime(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error("useDebateRuntime must be used inside a DebateRuntimeProvider");
  }
  return context;
}
