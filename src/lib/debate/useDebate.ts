import { useCallback, useEffect, useRef, useState } from "react";
import { checkHealth, listModels, resolveModelName, streamChat } from "./ollamaClient";
import { simulateStream, simulatedTurnText } from "./simulation";
import { buildRequestBody } from "./ollamaClient";
import { runLiveJudge, simulateJudge } from "./judge";
import { THINKING_INSTRUCTION } from "./presets";

import type {
  ArenaSettings,
  ChatMessage,
  ConnectionState,
  DebateMessage,
  DebaterConfig,
  LogEntry,
  LogKind,
  JudgeScorecard,
  Side,

  SpeakerStatus,
  Telemetry,
} from "./types";

export type Phase = "idle" | "running" | "paused" | "finished";

/** A model slot in the arena: the two debaters and the judge. */
export type Slot = Side | "judge";

const uid = () => Math.random().toString(36).slice(2, 10);

function splitReasoning(raw: string) {
  const open = raw.indexOf("<think>");
  if (open === -1) return { reasoning: "", content: raw };
  const close = raw.indexOf("</think>");
  if (close === -1) {
    return { reasoning: raw.slice(open + 7), content: "" };
  }
  return {
    reasoning: raw.slice(open + 7, close).trim(),
    content: (raw.slice(0, open) + raw.slice(close + 8)).trim(),
  };
}

function systemFor(config: DebaterConfig, topic: string, side: Side) {
  const stance =
    side === "alpha"
      ? "You argue FOR the resolution."
      : "You argue AGAINST the resolution.";
  return [
    config.systemPrompt.trim(),
    `You are ${config.name} in a live two-model debate. ${stance}`,
    `Resolution: "${topic}"`,
    "Respond with one focused argument. Never role-play the opponent. Never use bullet lists.",
    THINKING_INSTRUCTION[Math.min(config.thinkingLevel, THINKING_INSTRUCTION.length - 1)],
  ]
    .filter(Boolean)
    .join("\n");
}

export function useDebate(settings: ArenaSettings) {
  const [topic, setTopic] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<DebateMessage[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<Record<Side, SpeakerStatus>>({
    alpha: "idle",
    beta: "idle",
  });
  const [health, setHealth] = useState<Record<Side, ConnectionState>>({
    alpha: "unknown",
    beta: "unknown",
  });
  const [usingSimulation, setUsingSimulation] = useState(settings.mode === "simulation");
  const [turnIndex, setTurnIndex] = useState(0);
  const [lastTelemetry, setLastTelemetry] = useState<Record<Side, Telemetry | null>>({
    alpha: null,
    beta: null,
  });
  const [contextTokens, setContextTokens] = useState(0);
  const [scorecard, setScorecard] = useState<JudgeScorecard | null>(null);
  const [judging, setJudging] = useState(false);
  // Model names as reported by the local runtimes actually serving each slot.
  const [resolvedModels, setResolvedModels] = useState<Record<Slot, string | null>>({
    alpha: null,
    beta: null,
    judge: null,
  });
  const [availableModels, setAvailableModels] = useState<Record<Slot, string[]>>({
    alpha: [],
    beta: [],
    judge: [],
  });
  const resolvedRef = useRef<Record<Slot, string | null>>({ alpha: null, beta: null, judge: null });
  const setResolved = useCallback((slot: Slot, model: string | null) => {
    if (!model || resolvedRef.current[slot] === model) return;
    resolvedRef.current = { ...resolvedRef.current, [slot]: model };
    setResolvedModels((prev) => ({ ...prev, [slot]: model }));
  }, []);




  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const topicRef = useRef("");
  const turnRef = useRef(0);
  const runningRef = useRef(false);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<Record<Side, ChatMessage[]>>({ alpha: [], beta: [] });

  const log = useCallback((kind: LogKind, side: Side | "system", text: string) => {
    setLogs((prev) => {
      const next = [...prev, { id: uid(), ts: Date.now(), kind, side, text }];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  }, []);

  const refreshHealth = useCallback(async () => {
    const s = settingsRef.current;
    setHealth((h) => ({
      alpha: h.alpha === "online" ? "online" : "checking",
      beta: h.beta === "online" ? "online" : "checking",
    }));
    const [a, b] = await Promise.all([
      checkHealth(s.alpha.endpoint),
      checkHealth(s.beta.endpoint),
    ]);
    setHealth({ alpha: a ? "online" : "offline", beta: b ? "online" : "offline" });
    return { alpha: a, beta: b };
  }, []);

  useEffect(() => {
    void refreshHealth();
    const id = setInterval(() => void refreshHealth(), 15000);
    return () => clearInterval(id);
  }, [refreshHealth]);

  const runTurn = useCallback(
    async (index: number) => {
      const s = settingsRef.current;
      const side: Side = index % 2 === 0 ? "alpha" : "beta";
      const config = side === "alpha" ? s.alpha : s.beta;
      const round = Math.floor(index / 2) + 1;
      const topicValue = topicRef.current;

      const opponentLast = [...historyRef.current[side]]
        .reverse()
        .find((m) => m.role === "user");
      if (!opponentLast) {
        historyRef.current[side].push({
          role: "user",
          content: `Open the debate on the resolution: "${topicValue}"`,
        });
      }

      const payload: ChatMessage[] = [
        { role: "system", content: systemFor(config, topicValue, side) },
        ...historyRef.current[side],
      ];

      const messageId = uid();
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          side,
          round,
          content: "",
          reasoning: "",
          streaming: true,
          telemetry: null,
        },
      ]);
      setStatus((prev) => ({ ...prev, [side]: "thinking" }));

      const live = !usingSimulationRef.current;
      log(
        "request",
        side,
        `POST ${live ? config.endpoint : "simulation://local"} \n` +
          JSON.stringify(
            { headers: { "Content-Type": "application/json" }, body: buildRequestBody(config, payload) },
            null,
            2,
          ),
      );

      const controller = new AbortController();
      abortRef.current = controller;

      const started = performance.now();
      let ttft = 0;
      let raw = "";
      let evalCount = 0;
      let promptTokens = 0;
      let chunkCount = 0;

      const iterator = live
        ? streamChat(config, payload, controller.signal)
        : simulateStream(
            simulatedTurnText(topicValue, side, index >> 1),
            config.model,
            controller.signal,
          );

      try {
        for await (const chunk of iterator) {
          if (controller.signal.aborted) break;
          if (chunk.content) {
            if (!ttft) {
              ttft = performance.now() - started;
              setStatus((prev) => ({ ...prev, [side]: "speaking" }));
            }
            raw += chunk.content;
            evalCount += 1;
            const parts = splitReasoning(raw);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId ? { ...m, content: parts.content, reasoning: parts.reasoning } : m,
              ),
            );
          }
          chunkCount += 1;
          if (chunkCount % 6 === 0 || chunk.done) {
            log("chunk", side, chunk.raw);
          }
          if (chunk.evalCount) evalCount = chunk.evalCount;
          if (chunk.promptEvalCount) promptTokens = chunk.promptEvalCount;
          if (chunk.done) break;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log("error", side, `${msg} — falling back to Simulation Mode. If this is a CORS error, restart Ollama with OLLAMA_ORIGINS="*".`);
        usingSimulationRef.current = true;
        setUsingSimulation(true);
        const fallback = simulatedTurnText(topicValue, side, index >> 1);
        for await (const chunk of simulateStream(fallback, config.model, controller.signal)) {
          if (controller.signal.aborted) break;
          if (chunk.content) {
            if (!ttft) {
              ttft = performance.now() - started;
              setStatus((prev) => ({ ...prev, [side]: "speaking" }));
            }
            raw += chunk.content;
            evalCount += 1;
            const parts = splitReasoning(raw);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId ? { ...m, content: parts.content, reasoning: parts.reasoning } : m,
              ),
            );
          }
          if (chunk.evalCount) evalCount = chunk.evalCount;
          if (chunk.promptEvalCount) promptTokens = chunk.promptEvalCount;
        }
      }

      const durationMs = performance.now() - started;
      const parts = splitReasoning(raw);
      const telemetry: Telemetry = {
        ttftMs: Math.round(ttft),
        tokensPerSec: durationMs > 0 ? +(evalCount / (durationMs / 1000)).toFixed(1) : 0,
        tokens: evalCount,
        promptTokens,
        durationMs: Math.round(durationMs),
      };

      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, streaming: false, content: parts.content || raw, reasoning: parts.reasoning, telemetry }
            : m,
        ),
      );
      setLastTelemetry((prev) => ({ ...prev, [side]: telemetry }));
      setContextTokens((prev) => prev + evalCount + (promptTokens || Math.round(raw.length / 4)));
      setStatus((prev) => ({ ...prev, [side]: "idle" }));

      const spoken = parts.content || raw;
      historyRef.current[side].push({ role: "assistant", content: spoken });
      const other: Side = side === "alpha" ? "beta" : "alpha";
      historyRef.current[other].push({
        role: "user",
        content: `${config.name} argued: ${spoken}\n\nRebut this directly.`,
      });

      turnRef.current = index + 1;
      setTurnIndex(index + 1);
    },
    [log],
  );

  const usingSimulationRef = useRef(usingSimulation);
  usingSimulationRef.current = usingSimulation;

  const messagesRef = useRef<DebateMessage[]>([]);
  messagesRef.current = messages;

  const judgeSeqRef = useRef(0);

  const judgeDebate = useCallback(
    async (interim = false) => {
      const s = settingsRef.current;
      const transcript = messagesRef.current.filter((m) => !m.streaming && m.content.trim());
      if (!s.judge.enabled || transcript.length < 2 || !topicRef.current) return;

      const seq = ++judgeSeqRef.current;
      const names: Record<Side, string> = { alpha: s.alpha.name, beta: s.beta.name };
      setJudging(true);
      // Keep the previous scorecard visible while a live update is computed.
      if (!interim) setScorecard(null);
      log(
        "info",
        "system",
        interim
          ? `AI Judge updating live score after ${transcript.length} turns…`
          : "AI Judge is scoring the debate…",
      );

      if (!usingSimulationRef.current) {
        try {
          log(
            "request",
            "system",
            `POST ${s.judge.endpoint} (AI Judge${interim ? " · live update" : ""})\nmodel=${s.judge.model} temperature=${s.judge.temperature}`,
          );
          const { scorecard: live, raw } = await runLiveJudge(
            s.judge,
            topicRef.current,
            transcript,
            names,
            undefined,
            undefined,
            interim,
          );
          if (seq !== judgeSeqRef.current) return;
          if (live) {
            setScorecard(live);
            log(
              "info",
              "system",
              `AI Judge ${interim ? "running leader" : "verdict"}: ${live.winner.toUpperCase()}.`,
            );
            setJudging(false);
            return;
          }
          log("error", "system", `Judge returned unparsable output, using heuristic scoring. Raw: ${raw.slice(0, 200)}`);
        } catch (error) {
          if (seq !== judgeSeqRef.current) return;
          const msg = error instanceof Error ? error.message : String(error);
          log("error", "system", `AI Judge request failed (${msg}) — using simulated scoring.`);
        }
      }

      if (seq !== judgeSeqRef.current) return;
      const simulated = simulateJudge(topicRef.current, transcript, names, interim);
      setScorecard(simulated);
      log(
        "info",
        "system",
        `AI Judge (simulated) ${interim ? "running leader" : "verdict"}: ${simulated.winner.toUpperCase()}.`,
      );
      setJudging(false);
    },
    [log],
  );

  const loop = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const total = settingsRef.current.rounds * 2;
    while (runningRef.current && turnRef.current < total) {
      await runTurn(turnRef.current);
      // Live scoring: refresh the scorecard whenever both sides have spoken.
      if (turnRef.current % 2 === 0 && turnRef.current < total) {
        void judgeDebate(true);
      }
    }
    busyRef.current = false;
    if (turnRef.current >= total) {
      runningRef.current = false;
      setPhase("finished");
      log("info", "system", "Debate complete.");
      void judgeDebate();
    }
  }, [runTurn, log, judgeDebate]);



  const resolveMode = useCallback(async () => {
    const s = settingsRef.current;
    if (s.mode === "simulation") {
      usingSimulationRef.current = true;
      setUsingSimulation(true);
      log("info", "system", "Simulation Mode forced by configuration.");
      return;
    }
    const result = await refreshHealth();
    const bothLive = result.alpha && result.beta;
    if (s.mode === "live") {
      usingSimulationRef.current = false;
      setUsingSimulation(false);
      log("info", "system", `Live Local API Mode forced. Health: alpha=${result.alpha}, beta=${result.beta}.`);
      return;
    }
    usingSimulationRef.current = !bothLive;
    setUsingSimulation(!bothLive);
    log(
      "info",
      "system",
      bothLive
        ? "Local endpoints reachable — running Live Local API Mode."
        : "Local endpoints unreachable — running Simulation Mode.",
    );
  }, [refreshHealth, log]);

  const start = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      abortRef.current?.abort();
      topicRef.current = trimmed;
      setTopic(trimmed);
      historyRef.current = { alpha: [], beta: [] };
      turnRef.current = 0;
      setTurnIndex(0);
      setMessages([]);
      setLogs([]);
      setContextTokens(0);
      setLastTelemetry({ alpha: null, beta: null });
      setScorecard(null);
      judgeSeqRef.current++;
      setJudging(false);

      log("info", "system", `Resolution accepted: "${trimmed}"`);
      await resolveMode();
      runningRef.current = true;
      setPhase("running");
      void loop();
    },
    [loop, resolveMode, log],
  );

  const pause = useCallback(() => {
    runningRef.current = false;
    setPhase("paused");
    log("info", "system", "Debate paused after the current turn completes.");
  }, [log]);

  const resume = useCallback(() => {
    if (!topicRef.current) return;
    runningRef.current = true;
    setPhase("running");
    void loop();
  }, [loop]);

  const nextTurn = useCallback(async () => {
    if (busyRef.current || !topicRef.current) return;
    const total = settingsRef.current.rounds * 2;
    if (turnRef.current >= total) return;
    runningRef.current = false;
    busyRef.current = true;
    setPhase("paused");
    await runTurn(turnRef.current);
    busyRef.current = false;
    if (turnRef.current >= total) {
      setPhase("finished");
      void judgeDebate();
    } else if (turnRef.current % 2 === 0) {
      void judgeDebate(true);
    }

  }, [runTurn, judgeDebate]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    runningRef.current = false;
    busyRef.current = false;
    turnRef.current = 0;
    topicRef.current = "";
    historyRef.current = { alpha: [], beta: [] };
    setTopic("");
    setTurnIndex(0);
    setMessages([]);
    setLogs([]);
    setPhase("idle");
    setStatus({ alpha: "idle", beta: "idle" });
    setLastTelemetry({ alpha: null, beta: null });
    setContextTokens(0);
    setScorecard(null);
    judgeSeqRef.current++;
    setJudging(false);
  }, []);

  return {
    topic,
    phase,
    messages,
    logs,
    status,
    health,
    usingSimulation,
    turnIndex,
    lastTelemetry,
    contextTokens,
    scorecard,
    judging,
    judgeDebate,
    start,
    pause,
    resume,
    nextTurn,
    reset,
    refreshHealth,
    setTopic,

  };
}
