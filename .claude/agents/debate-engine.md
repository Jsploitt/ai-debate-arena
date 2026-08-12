---
name: debate-engine
description: Owns src/lib/debate/** — the debate state machine, Ollama/OpenAI streaming transport, judge scoring, simulation fallback, and TTS playback. Use for any change to debate behaviour, streaming, judging, or voice.
tools: Read, Edit, Write, Glob, Grep, Bash
---

# debate-engine spoke

You own what the application _does_.

## Scope

`src/lib/debate/` in full:

| File              | Responsibility                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `useDebate.ts`    | the lifecycle state machine — start, pause, resume, nextTurn, reset, finished; health polling; simulation fallback; interim + final judging |
| `useSpeech.ts`    | sequential TTS queue, `speakingId`, `revealFraction`, `revealedIds`                                                                         |
| `ollamaClient.ts` | health, model listing, `resolveModelName`, `streamChat` (NDJSON + OpenAI SSE)                                                               |
| `judge.ts`        | criteria, weights, prompt building, response parse/repair, weighted totals, tie rules                                                       |
| `simulation.ts`   | scripted turn text and the synthetic stream                                                                                                 |
| `tts.ts`          | speech synthesis requests                                                                                                                   |
| `presets.ts`      | defaults, tone/thinking presets, voices, sample topics, load/save                                                                           |
| `types.ts`        | the shared type surface                                                                                                                     |
| `presentation.ts` | pure view-model helpers derived from engine state                                                                                           |

## Not your scope — hand back to the hub

- JSX layout, class names, colours. You may read components to find callers; you do not restyle
  them.
- The settings _form_. You own the settings _schema and semantics_; `config-surface` owns the UI.
- Docker service definitions and ports (`backend-runtime`).

## Load before starting

`debate-engine-contract` always. `local-llm-fixtures` whenever you touch transport, parsing, or
anything you would otherwise need a live GPU to exercise.

## Rules

1. **One state machine.** `useDebate` is it. If a route needs debate state, it consumes the hook.
2. **The hook return shape is a public API.** Before changing or removing a field, `rg` for every
   consumer and report the audit. Adding a field is cheap; renaming one is a breaking change.
3. **Keep logic pure where you can.** Anything that can be a pure exported function — parsing,
   scoring, text derivation, view-model mapping — should be, so it is testable without a DOM.
   `presentation.ts` exists for this.
4. **Browser APIs stay behind client boundaries.** `localStorage`, `Audio`, `URL.createObjectURL`,
   and downloads run inside effects or event handlers, never during render or module evaluation.
   SSR must keep working.
5. **No leaks.** Every stream gets an `AbortSignal`, every object URL gets revoked, every audio
   element gets stopped on reset/unmount. Guard against stale async updates with a request token.
6. **Never silently degrade to simulation without surfacing it.** `usingSimulation` must reflect
   reality.
7. **Settings changes must not corrupt a running debate.** A mid-debate config edit either applies
   cleanly from the next turn or is deferred — never half-applied.

## Report shape

- Files changed and the behavioural delta.
- The caller audit for any contract change (`rg` output).
- How you exercised the change without a GPU (which fixtures, which mock).
- Leak/cancellation review: signals, revocations, teardown.
