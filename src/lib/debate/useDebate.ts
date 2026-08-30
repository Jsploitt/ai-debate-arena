import { useCallback, useEffect, useRef, useState } from "react";
import { checkHealth, listModels, resolveModelName, streamChat } from "./ollamaClient";
import { simulateStream, simulatedTurnText } from "./simulation";
import { buildRequestBody } from "./ollamaClient";
import { runLiveJudge, simulateJudge } from "./judge";
import { TURN_SCHEMA, spokenText } from "./spokenText";
import { LANGUAGE_INSTRUCTION, THINKING_INSTRUCTION } from "./presets";

import type {
  ArenaSettings,
  ChatMessage,
  ConnectionState,
  DebateMessage,
  DebateLanguage,
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

/**
 * The hard per-turn word budget, enforced by the engine rather than trusted to
 * the prompt. Local models routinely blow through a "keep it under N words"
 * instruction, so the stream is stopped once the sentence that crosses this
 * budget completes — see `clipAtSentenceEnd`.
 */
export const TURN_WORD_LIMIT = 50;

/**
 * How far past the budget a turn may run while waiting for the current
 * sentence to end. A model that stops punctuating entirely would otherwise
 * stream forever; at this ceiling the turn is cut at the last whitespace,
 * which is the one case where a clean sentence end is not on offer.
 */
const TURN_WORD_CEILING = TURN_WORD_LIMIT * 2;

const wordCount = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * Clip a streaming turn at the end of the sentence that crosses the word
 * budget.
 *
 * Returns `null` while the text is still within budget, or over budget but
 * mid-sentence — the caller keeps streaming. Once the crossing sentence ends
 * (`. ! ? ؟ …`, Latin or Arabic), the clipped text is returned and the caller
 * stops the stream. The turn therefore never cuts mid-word or mid-sentence;
 * it simply doesn't get to start another sentence.
 */
export function clipAtSentenceEnd(text: string, limit = TURN_WORD_LIMIT): string | null {
  if (wordCount(text) <= limit) return null;

  const boundary = /[.!?؟…]+["'”»)]*(?=\s|$)/g;
  let match: RegExpExecArray | null;
  while ((match = boundary.exec(text)) !== null) {
    const prefix = text.slice(0, match.index + match[0].length);
    if (wordCount(prefix) >= limit) return prefix.trim();
  }

  // No sentence end since the budget was crossed. Give the sentence room, but
  // not forever: at the ceiling, fall back to the last whole word.
  if (wordCount(text) >= TURN_WORD_CEILING) {
    const words = text.trim().split(/\s+/).slice(0, TURN_WORD_CEILING);
    return words.join(" ");
  }
  return null;
}

/**
 * Separate a model's private reasoning from what it actually says on stage.
 *
 * Matching only a literal `<think>`…`</think>` pair is not enough. Models
 * reliably produce three other shapes, and every one of them has reached the
 * stage, the voice queue and the judge transcript, because all three read
 * `message.content`:
 *
 *   - a bare `[Thinking: …]` / `Assumptions: … Rebuttal:` preamble in prose;
 *   - `<think>` closed with a stray `>` instead of `</think>`;
 *   - `<think>` never closed at all.
 *
 * The unterminated cases are resolved by looking for where the reasoning stops
 * sounding like notes — a blank line, or the closing bracket — and treating
 * everything after it as speech.
 */
function splitReasoning(raw: string) {
  let text = raw;
  const reasoning: string[] = [];

  // Well-formed pairs first.
  text = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_m, inner: string) => {
    reasoning.push(inner.trim());
    return "";
  });

  // `<think>` opened but not yet closed — the normal state of every chunk while
  // a reasoning model streams, since `</think>` only arrives once it starts
  // answering.
  //
  // Everything after the tag is reasoning until a close appears. A stray `>`
  // counts as a close, because some models emit that instead of `</think>`.
  //
  // A blank line does NOT count, and treating it as one was a real leak:
  // qwen3's reasoning is paragraphed prose, so the first `\n\n` split its
  // scratchpad in half and put the remainder on stage mid-turn. It vanished
  // the moment `</think>` arrived, which is why it never showed up in
  // end-of-turn checks — it only flashed while the turn was generating.
  const open = text.search(/<think>/i);
  if (open !== -1) {
    const rest = text.slice(open + 7);
    const stop = rest.search(/(?<![-<])>\s/);
    if (stop === -1) {
      reasoning.push(rest.trim());
      text = text.slice(0, open);
    } else {
      reasoning.push(rest.slice(0, stop).trim());
      text = text.slice(0, open) + rest.slice(stop).replace(/^>\s/, "");
    }
  }

  // A bracketed prose preamble: `[Thinking: … ]`.
  text = text.replace(/\[\s*(?:thinking|thought|reasoning)\s*:[\s\S]*?\]/gi, (m) => {
    reasoning.push(m.trim());
    return "";
  });

  // An unbracketed notes preamble, e.g. "Assumptions: … Rebuttal: …".
  const notes = text.match(/^\s*(?:assumptions|thinking|reasoning|plan)\s*:[\s\S]*?(?:\n\s*\n|$)/i);
  if (notes) {
    reasoning.push(notes[0].trim());
    text = text.slice(notes[0].length);
  }

  return { reasoning: reasoning.join("\n").trim(), content: text.trim() };
}

/**
 * The visible words and the private reasoning for one turn.
 *
 * Two layers, in order. `splitReasoning` peels off any `<think>` block —
 * Ollama reports a reasoning model's scratchpad separately and `parseLine`
 * re-wraps it in those tags, so it is still there even under constrained
 * decoding. What remains is the model's actual message: constrained JSON on a
 * live turn, plain prose in simulation.
 */
function parseTurn(raw: string, live: boolean) {
  const parts = splitReasoning(raw);
  return live ? { content: spokenText(parts.content), reasoning: parts.reasoning } : parts;
}

function systemFor(
  config: DebaterConfig,
  topic: string,
  side: Side,
  language: DebateLanguage = "en",
  opening = false,
) {
  const stance =
    side === "alpha"
      ? "You argue FOR the resolution: you want it adopted."
      : "You argue AGAINST the resolution: you want it rejected.";
  const stanceWord = side === "alpha" ? "FOR" : "AGAINST";
  return [
    config.systemPrompt.trim(),
    `You are one of two debaters speaking live, out loud, on stage. ${stance}`,
    `Resolution: "${topic}"`,
    "Speak in first person, directly and only as yourself — never in the third person, and never narrate or describe your own argument from the outside.",
    'Do NOT write phrases like "Debater Alpha argues", "my rebuttal shows", "Alpha\'s case is" or any other self-referential label — those make you sound like a report about the debate, not a participant in it.',
    opening
      ? 'This is the FIRST thing said in the debate. Your opponent has not spoken yet, so you have nothing to reply to: do not open with "you claim", "you assume", "you\'re wrong" or any other response to an argument that does not exist. State your own case from scratch.'
      : 'Talk straight to your opponent using "you"/"your", as if replying to what they just said, the way a real person would in a live argument. Never describe the debate\'s structure or rounds.',
    // Debaters kept opening rebuttals with "you claim X" for an X the opponent
    // never said -- a strawman that reads as a glitch to anyone following the
    // transcript on screen.
    'Only attribute to your opponent things they ACTUALLY said in this conversation. Before writing "you claim", "you said", "you assume" or any paraphrase of their position, check their previous turns: if they did not say it, you may not pin it on them. To attack a position they have not stated, introduce it impersonally ("some would argue...", "the usual case for this is...") -- never as theirs.',
    // The audience hears each turn once, spoken aloud, many as non-native
    // listeners. Register this as a hard constraint, not a style preference.
    "SPEAK SIMPLY -- THIS OVERRIDES EVERYTHING ABOUT STYLE. Use plain, everyday English a listener catches on first hearing: short sentences, common words, one idea per sentence. No corporate or academic jargon, no dense abstractions, no words a teenager would need to look up. If a simpler word exists, use it. Sounding smart by sounding complicated loses the audience and the debate.",
    'Never refer to your opponent by any name or label (not "Beta", "Alpha", "my opponent", "Debater X", etc.) — call them "you" every time, exactly like a real person arguing face to face never says the other person\'s debate title out loud.',
    "Respond with one focused argument. Never role-play the opponent. Never use bullet lists.",
    `Hard limit: ${TURN_WORD_LIMIT} words per turn. The stage microphone cuts off at the end of the sentence that crosses that limit, so land your strongest point early and stop — a short, complete argument always beats a long one that gets cut.`,
    'Never mention the word limit or your word count out loud. No "46 words", no "within limit", no bookkeeping of any kind — the audience hears every character you produce, and a count read aloud breaks the show. End on your argument\'s final sentence and nothing after it.',
    // Openers kept arriving as invented anecdotes -- a named colleague, then a
    // named customer ("Fatima in Riyadh") with a timestamp and a metric. None
    // of it is real, none of it has context, and it reads as nonsense on stage.
    'Never name an individual person. No colleagues, customers, users or contacts -- invented or real. Refer to people only by role ("a merchant", "an engineering team").',
    'Never invent an anecdote or claim something happened: no "this morning", no calls you took, no conversations you had, no internal metrics or figures about your opponent\'s company. You have no inside information and no private examples.',
    "Do not attribute specific actions or statistics to named real companies. Reason about the industry in general terms instead.",
    // This runs in front of a live audience, so the register matters as much as
    // the argument. Disagree with the position, never disparage people.
    'Stay courteous and professional throughout. Argue hard against the IDEA, never against your opponent as a person: no insults, no sneering, no contempt, and no dismissive labels for any group of people ("freeloaders" and the like). Nothing you say should be capable of offending anyone in the room.',
    "Keep the tone measured and constructive, the way two executives disagree in a boardroom — confident and direct, never combative.",
    // Restated last on purpose: with a long turn history above, a single
    // stance line at the top is exactly what a small model loses track of --
    // one live run had a debater switch sides mid-debate.
    `FINAL CHECK before every turn: you are ${stanceWord} "${topic}". Every sentence must push your side. If a point you are about to make helps the other side, drop it -- conceding or switching sides mid-debate is the one unrecoverable mistake on a live stage.`,
    THINKING_INSTRUCTION[Math.min(config.thinkingLevel, THINKING_INSTRUCTION.length - 1)],
    LANGUAGE_INSTRUCTION[language],
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
  /**
   * Finalized turns, updated synchronously the moment a turn completes.
   *
   * The judge must not read `messagesRef` for this: that ref mirrors React
   * state, which only commits on the next render — so a judge invoked right
   * after `runTurn` returned still saw the just-finished turn as streaming.
   * Every interim therefore scored one turn behind, and the final verdict
   * was computed with the last turn missing from the transcript entirely.
   */
  const transcriptRef = useRef<DebateMessage[]>([]);

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
    const [a, b] = await Promise.all([checkHealth(s.alpha.endpoint), checkHealth(s.beta.endpoint)]);
    setHealth({ alpha: a ? "online" : "offline", beta: b ? "online" : "offline" });

    // Ask each reachable runtime which models it actually serves, and bind the
    // configured name to a real installed model.
    const slots: Array<{ slot: Slot; endpoint: string; configured: string; up: boolean }> = [
      { slot: "alpha", endpoint: s.alpha.endpoint, configured: s.alpha.model, up: a },
      { slot: "beta", endpoint: s.beta.endpoint, configured: s.beta.model, up: b },
      { slot: "judge", endpoint: s.judge.endpoint, configured: s.judge.model, up: a || b },
    ];
    const lists = await Promise.all(
      slots.map((x) => (x.up ? listModels(x.endpoint) : Promise.resolve([]))),
    );
    const nextAvailable: Record<Slot, string[]> = { alpha: [], beta: [], judge: [] };
    slots.forEach((x, i) => {
      nextAvailable[x.slot] = lists[i];
      const resolved = resolveModelName(x.configured, lists[i]);
      if (resolved) setResolved(x.slot, resolved);
      else {
        resolvedRef.current = { ...resolvedRef.current, [x.slot]: null };
        setResolvedModels((prev) => ({ ...prev, [x.slot]: null }));
      }
    });
    setAvailableModels(nextAvailable);
    return { alpha: a, beta: b };
  }, [setResolved]);

  useEffect(() => {
    void refreshHealth();
    const id = setInterval(() => void refreshHealth(), 15000);
    return () => clearInterval(id);
  }, [refreshHealth]);

  const runTurn = useCallback(
    async (index: number) => {
      const s = settingsRef.current;
      const side: Side = index % 2 === 0 ? "alpha" : "beta";
      const baseConfig = side === "alpha" ? s.alpha : s.beta;
      // Use the model the local runtime actually serves, when we have detected one.
      const detected = resolvedRef.current[side];
      const config: DebaterConfig = detected ? { ...baseConfig, model: detected } : baseConfig;
      const round = Math.floor(index / 2) + 1;
      const topicValue = topicRef.current;

      const opponentLast = [...historyRef.current[side]].reverse().find((m) => m.role === "user");
      if (!opponentLast) {
        historyRef.current[side].push({
          role: "user",
          content:
            s.language === "ar"
              ? `افتتح المناظرة حول الطرح التالي: "${topicValue}"`
              : `Open the debate on the resolution: "${topicValue}"`,
        });
      }

      const payload: ChatMessage[] = [
        {
          role: "system",
          content: systemFor(config, topicValue, side, s.language, index === 0),
        },
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
            {
              headers: { "Content-Type": "application/json" },
              body: buildRequestBody(config, payload),
            },
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
      // Set once the visible content crosses the word budget and its final
      // sentence completes; from then on this is the turn's whole text.
      let clippedContent: string | null = null;

      const iterator = live
        ? // Constrained decoding: the grammar only permits {"argument": "..."},
          // so a preamble, a `<think>` block or a trailing "(47 words)" has
          // nowhere to be emitted. See lib/debate/spokenText.ts.
          streamChat(config, payload, controller.signal, { format: TURN_SCHEMA })
        : simulateStream(
            simulatedTurnText(topicValue, side, index >> 1, s.language),
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
            const parts = parseTurn(raw, live);
            clippedContent = clipAtSentenceEnd(parts.content);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? { ...m, content: clippedContent ?? parts.content, reasoning: parts.reasoning }
                  : m,
              ),
            );
            if (clippedContent !== null) break;
          }
          chunkCount += 1;
          if (chunkCount % 6 === 0 || chunk.done) {
            log("chunk", side, chunk.raw);
          }
          if (chunk.model) setResolved(side, chunk.model);
          if (chunk.evalCount) evalCount = chunk.evalCount;
          if (chunk.promptEvalCount) promptTokens = chunk.promptEvalCount;
          if (chunk.done) break;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(
          "error",
          side,
          `${msg} — falling back to Simulation Mode. If this is a CORS error, restart Ollama with OLLAMA_ORIGINS="*".`,
        );
        usingSimulationRef.current = true;
        setUsingSimulation(true);
        const fallback = simulatedTurnText(topicValue, side, index >> 1, s.language);
        for await (const chunk of simulateStream(fallback, config.model, controller.signal)) {
          if (controller.signal.aborted) break;
          if (chunk.content) {
            if (!ttft) {
              ttft = performance.now() - started;
              setStatus((prev) => ({ ...prev, [side]: "speaking" }));
            }
            raw += chunk.content;
            evalCount += 1;
            const parts = parseTurn(raw, live);
            clippedContent = clipAtSentenceEnd(parts.content);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? { ...m, content: clippedContent ?? parts.content, reasoning: parts.reasoning }
                  : m,
              ),
            );
            if (clippedContent !== null) break;
          }
          if (chunk.evalCount) evalCount = chunk.evalCount;
          if (chunk.promptEvalCount) promptTokens = chunk.promptEvalCount;
        }
      }

      // A clipped turn leaves the request streaming server-side; stop it so
      // the runtime is not still generating a turn nobody will see.
      if (clippedContent !== null) {
        controller.abort();
        log(
          "info",
          side,
          `Turn reached the ${TURN_WORD_LIMIT}-word limit — stopped at the sentence end.`,
        );
      }

      const durationMs = performance.now() - started;
      const parts = parseTurn(raw, live);
      const telemetry: Telemetry = {
        ttftMs: Math.round(ttft),
        tokensPerSec: durationMs > 0 ? +(evalCount / (durationMs / 1000)).toFixed(1) : 0,
        tokens: evalCount,
        promptTokens,
        durationMs: Math.round(durationMs),
      };

      const spoken = clippedContent ?? (parts.content || raw);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                streaming: false,
                content: spoken,
                reasoning: parts.reasoning,
                telemetry,
              }
            : m,
        ),
      );
      setLastTelemetry((prev) => ({ ...prev, [side]: telemetry }));
      setContextTokens((prev) => prev + evalCount + (promptTokens || Math.round(raw.length / 4)));
      setStatus((prev) => ({ ...prev, [side]: "idle" }));

      historyRef.current[side].push({ role: "assistant", content: spoken });
      transcriptRef.current.push({
        id: messageId,
        side,
        round,
        content: spoken,
        reasoning: parts.reasoning,
        streaming: false,
        telemetry,
      });
      const other: Side = side === "alpha" ? "beta" : "alpha";
      // The stance is restated inside every turn request, not just the system
      // prompt: after a few exchanges the freshest instruction wins, and a
      // debater mid-rally has echoed the opponent's framing and argued the
      // wrong side of the motion ("paper fails without power" — from the
      // e-books side).
      const stanceReminder =
        s.language === "ar"
          ? other === "alpha"
            ? `تذكير: أنت تؤيد الطرح «${topicValue}» — يجب أن يدافع ردك عنه، لا أن يمنح خصمك أي نقطة.`
            : `تذكير: أنت تعارض الطرح «${topicValue}» — يجب أن يهاجمه ردك، لا أن يمنح خصمك أي نقطة.`
          : other === "alpha"
            ? `Reminder: you argue FOR "${topicValue}" — every sentence of your reply must defend it. Do not hand your opponent a point.`
            : `Reminder: you argue AGAINST "${topicValue}" — every sentence of your reply must attack it. Do not hand your opponent a point.`;
      historyRef.current[other].push({
        role: "user",
        content:
          s.language === "ar"
            ? `قال خصمك للتو: ${spoken}\n\n${stanceReminder}\n\nرُدّ عليه مباشرة وبالعربية، مخاطباً إياه بـ"أنت"، دون ذكر اسمه أو لقبه.`
            : `Your opponent just said: ${spoken}\n\n${stanceReminder}\n\nRespond to them directly, addressing them as "you" — do not refer to them by any name or label.`,
      });

      turnRef.current = index + 1;
      setTurnIndex(index + 1);
    },
    [log, setResolved],
  );

  const usingSimulationRef = useRef(usingSimulation);
  usingSimulationRef.current = usingSimulation;

  const messagesRef = useRef<DebateMessage[]>([]);
  messagesRef.current = messages;

  const scorecardRef = useRef<JudgeScorecard | null>(null);
  scorecardRef.current = scorecard;

  const judgeSeqRef = useRef(0);

  /**
   * Commit only the side that just spoke.
   *
   * A live update rescores the whole transcript, so both totals used to jump
   * together after every turn and it was impossible to see who had just been
   * awarded what. Keeping the other side's numbers frozen means points land
   * on one debater, right after their own turn.
   */
  const mergeSide = useCallback((next: JudgeScorecard, side: Side | null): JudgeScorecard => {
    const prev = scorecardRef.current;
    if (!side || !prev) return next;
    const other: Side = side === "alpha" ? "beta" : "alpha";
    return { ...next, [other]: prev[other] } as JudgeScorecard;
  }, []);

  /**
   * Judge runs are serialized, never cancelled.
   *
   * The old behaviour bumped a sequence number per call and discarded any
   * in-flight run's result. Simulation never noticed — its judge is
   * synchronous — but a real judge model takes seconds per interim, so on
   * live hardware each new turn's judge request would have killed the
   * previous one and the scoreboard would barely have moved. Now one job
   * runs at a time; while it runs, the newest request waits in a single
   * pending slot (a final replaces a pending interim, never the reverse).
   * Collapsed interims re-snapshot the transcript when they finally run, so
   * a slow judge lags but never scores stale data — and when two different
   * sides' interims collapse into one, the side-freeze is dropped so both
   * columns move. `judgeSeqRef` is now bumped only by start/reset, where it
   * invalidates every outstanding job.
   */
  const judgeBusyRef = useRef(false);
  const judgePendingRef = useRef<{ interim: boolean; onlySide: Side | null } | null>(null);

  const judgeDebate = useCallback(
    async (interim = false, onlySide: Side | null = null) => {
      const s = settingsRef.current;
      // transcriptRef, not messagesRef: the state mirror lags a render behind,
      // which made every judge run score with the just-finished turn missing.
      const transcript = transcriptRef.current.filter((m) => m.content.trim());
      if (!s.judge.enabled || transcript.length < 1 || !topicRef.current) return;

      if (judgeBusyRef.current) {
        const pending = judgePendingRef.current;
        if (pending && !pending.interim && interim) return; // never demote a waiting final
        judgePendingRef.current = {
          interim: pending ? pending.interim && interim : interim,
          onlySide: pending && pending.onlySide !== onlySide ? null : onlySide,
        };
        return;
      }
      judgeBusyRef.current = true;

      const seq = judgeSeqRef.current;
      const names: Record<Side, string> = { alpha: s.alpha.name, beta: s.beta.name };
      setJudging(true);
      try {
        // Keep the previous scorecard visible while ANY update is computed. The
        // final run used to blank it, so the scoreboard flashed 0.0 / 0.0 for a
        // few seconds right before the verdict landed.
        log(
          "info",
          "system",
          interim
            ? `AI Judge updating live score after ${transcript.length} turns…`
            : "AI Judge is scoring the debate…",
        );

        if (!usingSimulationRef.current) {
          try {
            const judgeConfig = resolvedRef.current.judge
              ? { ...s.judge, model: resolvedRef.current.judge }
              : s.judge;
            log(
              "request",
              "system",
              `POST ${judgeConfig.endpoint} (AI Judge${interim ? " · live update" : ""})\nmodel=${judgeConfig.model} temperature=${judgeConfig.temperature}`,
            );
            // Watchdog: judge runs are serialized, so ONE hung request (an
            // Ollama stream that never completes) would wedge the queue and
            // freeze the scoreboard for the rest of the debate. Aborting
            // lands in the catch below — simulated scoring — and the pending
            // slot drains normally.
            const watchdog = new AbortController();
            // 60s: generous for a healthy judge (~10s per interim), short
            // enough that the now-awaited interim can't stall the turn loop
            // long when a request hangs.
            const watchdogTimer = setTimeout(() => watchdog.abort(), 60_000);
            const { scorecard: live, raw } = await runLiveJudge(
              judgeConfig,
              topicRef.current,
              transcript,
              names,
              watchdog.signal,
              (rawChunk) => {
                try {
                  const parsed = JSON.parse(rawChunk) as { model?: string };
                  if (parsed.model) setResolved("judge", parsed.model);
                } catch {
                  /* non-JSON keepalive line */
                }
              },
              interim,
              s.language,
              (partial) => {
                if (seq !== judgeSeqRef.current) return;
                // Interim updates land as ONE discrete change when the judge
                // finishes, right after the scored turn — streaming them made
                // the scoreboard drift continuously while a debater was still
                // speaking. Only the final verdict streams in live, when the
                // floor is already silent.
                if (interim) return;
                setScorecard(mergeSide(partial, onlySide));
              },
            );
            clearTimeout(watchdogTimer);
            if (seq !== judgeSeqRef.current) return;
            if (live) {
              setScorecard(mergeSide(live, onlySide));
              log(
                "info",
                "system",
                `AI Judge ${interim ? "running leader" : "verdict"}: ${live.winner.toUpperCase()}.`,
              );
              setJudging(false);
              return;
            }
            log(
              "error",
              "system",
              `Judge returned unparsable output, using heuristic scoring. Raw: ${raw.slice(0, 200)}`,
            );
          } catch (error) {
            if (seq !== judgeSeqRef.current) return;
            const msg = error instanceof Error ? error.message : String(error);
            log("error", "system", `AI Judge request failed (${msg}) — using simulated scoring.`);
          }
        }

        if (seq !== judgeSeqRef.current) return;
        const simulated = simulateJudge(
          topicRef.current,
          transcript,
          names,
          s.judge,
          interim,
          s.language,
        );
        setScorecard(mergeSide(simulated, onlySide));
        log(
          "info",
          "system",
          `AI Judge (simulated) ${interim ? "running leader" : "verdict"}: ${simulated.winner.toUpperCase()}.`,
        );
        setJudging(false);
      } finally {
        judgeBusyRef.current = false;
        const pending = judgePendingRef.current;
        judgePendingRef.current = null;
        if (pending && seq === judgeSeqRef.current) {
          void judgeDebate(pending.interim, pending.onlySide);
        }
      }
    },
    [log, setResolved, mergeSide],
  );

  const loop = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const total = settingsRef.current.rounds * 2;
    while (runningRef.current && turnRef.current < total) {
      await runTurn(turnRef.current);
      // Live scoring: score the side that just spoke, on its own — and WAIT
      // for it. Fire-and-forget let generation outrun the serialized judge,
      // so interims coalesced into sparse snapshots and the paced scoreboard
      // sat still for turns at a time. Awaiting gives every turn its own
      // scorecard; with voice on, the judge's seconds hide entirely inside
      // the previous turn's playback time.
      if (turnRef.current < total) {
        await judgeDebate(true, turnRef.current % 2 === 0 ? "beta" : "alpha");
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
      log(
        "info",
        "system",
        `Live Local API Mode forced. Health: alpha=${result.alpha}, beta=${result.beta}.`,
      );
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
      transcriptRef.current = [];
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
    } else {
      void judgeDebate(true, turnRef.current % 2 === 0 ? "beta" : "alpha");
    }
  }, [runTurn, judgeDebate]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    runningRef.current = false;
    busyRef.current = false;
    turnRef.current = 0;
    topicRef.current = "";
    historyRef.current = { alpha: [], beta: [] };
    transcriptRef.current = [];
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
    resolvedModels,
    availableModels,
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
