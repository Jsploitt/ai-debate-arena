---
name: debate-engine-contract
description: The public API of the debate engine and shared runtime — useDebate/useSpeech internals, useDebateRuntime route contract, the ArenaSettings/JudgeScorecard type surface, the one-live-runtime rule, cross-tab owner/mirror behavior, and SSR-safety boundaries. Load before consuming or changing anything under src/lib/debate/ or the debate runtime provider.
---

# Debate engine contract

`src/lib/debate/` is the application engine. `DebateRuntimeProvider` is the route-facing runtime bridge. The UI is a view over that contract. Treat these shapes as a published API: additive changes are cheap, renames and removals require a caller audit.

## The one-live-runtime rule

`useDebate` owns the debate lifecycle implementation and `useSpeech` owns playback, but routes do **not** instantiate either hook directly. `src/components/arena/DebateRuntimeProvider.tsx` owns those hook instances and exposes them through `useDebateRuntime()`.

Within one browser tab, route navigation therefore stays on the same runtime. Across simultaneous same-origin tabs/windows, the tab that starts a debate becomes the runtime owner. It alone performs generation, judging and TTS; other tabs mirror serializable debate/speech state over `BroadcastChannel` and forward runtime commands back to the owner. A mirror must never start a second side-effecting debate engine for the same session.

## `useDebateRuntime()` — route-facing API

```ts
{
  debate,          // same public shape as useDebate(settings)
  speech,          // same public shape as useSpeech(settings, messages)
  isRuntimeOwner,  // boolean
}
```

Routes `/` and `/arena` consume this API. If a new route needs debate state, consume `useDebateRuntime()` rather than calling the engine hooks directly.

## `useDebate(settings: ArenaSettings)` — engine implementation

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
  provisional from final. `scorecard.turnsScored` says how many turns that card covers — views
  that pace score reveals (the presentation stage holds each card until its turns have been
  delivered on stage) key off it.
- Judge runs are **serialized, never cancelled**: one job at a time, with the newest request
  waiting in a single pending slot (a final replaces a pending interim, never the reverse; a
  collapsed pending job re-snapshots the transcript when it runs). On slow judge models interims
  coalesce rather than dying — the board lags, it does not stall. Only `start()`/`reset()`
  invalidate outstanding jobs.
- The judge reads a synchronously-updated transcript ref, not React state — state commits a
  render late, which used to make every judge run miss the just-finished turn (and the final
  verdict miss the last turn of the debate).
- Any live-stream error auto-falls back to simulation **for the rest of the session** and flips
  `usingSimulation`.
- `<think>` blocks are extracted into `DebateMessage.reasoning` by `splitReasoning`.

## `useSpeech(settings, messages)` — playback implementation

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

Only the runtime-owner tab may perform audio playback for a mirrored debate. Mirror tabs receive the serializable speech view (`speakingId`, `revealFraction`, `revealedIds`, `syncActive`) and render it without creating duplicate audio.

### The generation/voice skew

This matters more than it looks. When TTS is on, the model generates and the judge scores far ahead
of what has actually been read aloud. Showing raw generation progress makes the UI contradict what
the audience is hearing. So when `syncActive` is true, speaker status and round counters must be
derived from the **voice queue**, not from `debate.status` / `turnIndex`. That derivation lives in
`presentation.ts` (`effectiveStatus`, `effectiveRound`, `revealedText`) and must be used by every
view that displays either.

## Cross-tab command contract

The owner/mirror layer forwards side-effecting controls to the runtime owner. At minimum this includes:

- start
- pause
- resume
- next turn
- reset
- manual judge

Snapshots must contain only structured-clone-safe state. `Set` values such as `revealedIds` are serialized before broadcast and reconstructed by mirrors. Settings are persisted separately by `SettingsProvider` and synchronized across same-origin tabs/windows through the browser `storage` event.

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
never at module scope and never in a way that changes server/client markup during initial render:

- `localStorage` — hence the `useState(DEFAULT_SETTINGS)` + client effect pattern.
- `BroadcastChannel`, `window` event listeners and tab ownership setup.
- `new Audio()`, playback, and any `AudioContext`.
- `URL.createObjectURL` and programmatic downloads.
- `window`, `document`, `navigator`.

## Lifecycle hygiene

- Every stream takes an `AbortSignal` and is aborted on reset, unmount, and supersession.
- Every object URL is revoked after use.
- Every `BroadcastChannel` is closed and browser event listener removed on provider cleanup.
- Guard async completions with a request token so a stale response cannot overwrite newer state —
  this already protects judging and must protect anything similar you add.
- `reset()` on the owner debate must be paired with `stop()` on owner speech.
- If an owner tab exits, it releases ownership; mirrors must not continue generating from stale local state.

## Before changing a field

```bash
rg -n 'debate\.<field>|speech\.<field>|useDebateRuntime|useDebate\(|useSpeech\(' src/
```

Report the audit. A rename without one is how a control silently stops working. Any direct `useDebate` or `useSpeech` call outside `DebateRuntimeProvider` is an architecture regression.
