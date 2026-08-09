---
name: debate-engine-contract
description: The public API of the debate engine — useDebate and useSpeech return shapes, the ArenaSettings/JudgeScorecard type surface, the one-state-machine rule, and the SSR-safety boundary for localStorage, audio and object URLs. Load before consuming or changing anything under src/lib/debate/.
---

# Debate engine contract

`src/lib/debate/` is the application. The UI is a view over it. Treat these shapes as a published
API: additive changes are cheap, renames and removals require a caller audit.

## The one-state-machine rule

`useDebate` owns the debate lifecycle. There is exactly one instance per route, and no component
may reimplement start/turn/round/finish logic locally. If a view needs derived state, add a pure
helper to `presentation.ts` — do not fork the machine.

## `useDebate(settings: ArenaSettings)`

```ts
{
  resolvedModels,   // Record<Slot, string | null>   — what the runtime actually serves
  availableModels,  // Record<Slot, string[]>        — from /api/tags
  topic,            // string
  phase,            // "idle" | "running" | "paused" | "finished"
  messages,         // DebateMessage[]
  logs,             // LogEntry[]  (capped at 400)
  status,           // Record<Side, SpeakerStatus>   — "idle" | "thinking" | "speaking"
  health,           // Record<Side, ConnectionState> — "unknown" | "checking" | "online" | "offline"
  usingSimulation,  // boolean
  turnIndex,        // number — round = Math.floor(turnIndex / 2) + 1
  lastTelemetry,    // Record<Side, Telemetry | null>
  contextTokens,    // number
  scorecard,        // JudgeScorecard | null
  judging,          // boolean
  judgeDebate,      // (interim?: boolean) => Promise<void>
  start,            // (value: string) => Promise<void>
  pause,            // () => void
  resume,           // () => void
  nextTurn,         // () => Promise<void>
  reset,            // () => void
  refreshHealth,    // () => Promise<{ alpha: boolean; beta: boolean }>
  setTopic,         // raw React setter
}
```

`type Slot = Side | "judge"`, `type Side = "alpha" | "beta"`.

Behaviour a view must account for:

- Health polls every 15s.
- `start()` clears all state, then runs `settings.rounds * 2` turns.
- An **interim** `judgeDebate(true)` fires after every completed turn; a final one at the end. So
  `scorecard` is populated and moving _during_ the debate, and `scorecard.interim` distinguishes
  provisional from final.
- Any live-stream error auto-falls back to simulation **for the rest of the session** and flips
  `usingSimulation`.
- `<think>` blocks are extracted into `DebateMessage.reasoning` by `splitReasoning`.

## `useSpeech(settings, messages)`

```ts
{
  speakingId,      // string | null — message id currently being read aloud
  revealFraction,  // number 0..1 — audio.currentTime / audio.duration
  revealedIds,     // Set<string> — fully spoken message ids
  syncActive,      // boolean — equals settings.tts.enabled
  stop,            // () => void
}
```

The queue is strictly sequential and never overlaps sides. Failures are swallowed — a dead TTS
service must not stop the debate. Arabic uses `settings.tts.endpointAr` with no voice; English uses
`endpointEn` plus the per-debater `settings[side].voice`.

### The generation/voice skew

This matters more than it looks. When TTS is on, the model generates and the judge scores far ahead
of what has actually been read aloud. Showing raw generation progress makes the UI contradict what
the audience is hearing. So when `syncActive` is true, speaker status and round counters must be
derived from the **voice queue**, not from `debate.status` / `turnIndex`. That derivation lives in
`presentation.ts` (`effectiveStatus`, `effectiveRound`, `revealedText`) and must be used by every
view that displays either.

## Types worth knowing

```ts
Side            = "alpha" | "beta"
SpeakerStatus   = "idle" | "thinking" | "speaking"
ExecutionMode   = "auto" | "live" | "simulation"
ConnectionState = "unknown" | "checking" | "online" | "offline"
DebateLanguage  = "en" | "ar"
JudgeCriterion  = "Logic" | "Evidence" | "Rebuttal" | "Clarity" | "Persuasion"
LogKind         = "request" | "chunk" | "info" | "error"

DebaterConfig { name, endpoint, model, temperature, topP, systemPrompt, thinkingLevel, tonePreset, voice }
JudgeConfig   { enabled, endpoint, model, temperature, systemPrompt, weights, scale, tieThreshold, rules }
TtsSettings   { enabled, endpointEn, endpointAr }
ArenaSettings { alpha, beta, rounds, mode, contextWindow, judge, language, tts }
Telemetry     { ttftMs, tokensPerSec, tokens, promptTokens, durationMs }
DebateMessage { id, side, round, content, reasoning, streaming, telemetry }
LogEntry      { id, ts, kind, side: Side | "system", text }
StreamChunk   { content, done, evalCount?, promptEvalCount?, model?, raw }
JudgeSideScore { scores, reasons, total, summary }
JudgeScorecard { alpha, beta, winner: Side | "tie", verdict, simulated, createdAt,
                 interim, turnsScored, scale, maxTotal, weights, streaming? }
```

## Other modules

- `ollamaClient.ts` — `checkHealth`, `listModels`, `buildRequestBody`, `resolveModelName`
  (exact → `:latest` → base tag → partial → first), `streamChat` (tolerant of both Ollama NDJSON
  and OpenAI `data:` SSE; rewraps Ollama `message.thinking` as `<think></think>`).
- `judge.ts` — `JUDGE_CRITERIA`, `DEFAULT_JUDGE_WEIGHTS`, `DEFAULT_JUDGE_SCALE` (10),
  `DEFAULT_TIE_THRESHOLD` (0.4), `weightedTotal`, `maxTotalFor`, `rubricNote`,
  `buildJudgeMessages`, `parseJudgeResponse` (repairs malformed JSON), `simulateJudge`,
  `runLiveJudge` (streams partial scorecards roughly every 40 characters).
- `simulation.ts` — `simulatedTurnText` (three keyword-matched scripted debates plus generic EN/AR
  pools), `simulateStream` (word-by-word with synthetic telemetry).
- `tts.ts` — `synthesizeSpeech(text, endpoint, voice?, signal?)`; strips markdown emphasis first.
- `presets.ts` — `DEFAULT_SETTINGS`, `loadSettings`/`saveSettings` (localStorage key
  `debate-arena-settings-v1`, deep-merged with defaults), `KOKORO_VOICES`, `TONE_PRESETS`,
  `THINKING_INSTRUCTION`, `LANGUAGE_INSTRUCTION`, `LANGUAGE_LABEL`, `SAMPLE_TOPICS`,
  `SAMPLE_TOPICS_AR`.

## SSR safety

This is a TanStack Start SSR app. The following run **only** inside effects or event handlers,
never during render or at module scope:

- `localStorage` — hence the `useState(DEFAULT_SETTINGS)` + `useEffect(() => setSettings(loadSettings()), [])`
  pattern. Never initialise state directly from storage; it causes a hydration mismatch.
- `new Audio()`, playback, and any `AudioContext`.
- `URL.createObjectURL` and programmatic downloads.
- `window`, `document`, `navigator`.

## Lifecycle hygiene

- Every stream takes an `AbortSignal` and is aborted on reset, unmount, and supersession.
- Every object URL is revoked after use.
- Guard async completions with a request token so a stale response cannot overwrite newer state —
  this already protects judging and must protect anything similar you add.
- `reset()` on the debate must be paired with `stop()` on speech.

## Before changing a field

```
rg -n 'debate\.<field>|speech\.<field>' src/
```

Report the audit. A rename without one is how a control silently stops working.
