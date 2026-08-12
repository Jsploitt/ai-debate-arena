---
description: Verify every debate engine capability is still wired to the UI and nothing regressed against main.
---

Audit the debate engine against its consumers.

Load the `debate-engine-contract` skill first, then dispatch the `debate-engine` spoke.

For every field and action on `useDebate` and `useSpeech`, establish:

1. **Is it consumed?** `rg` for each field across `src/`. A field with no consumer is either a UI
   gap or dead state — say which.
2. **Does the consumer actually drive behaviour?** A control that renders but does not change the
   outgoing request or runtime state is a regression, even if it looks right.
3. **Is it reachable?** Some capabilities only appear in a particular phase or mode. Name the state
   that surfaces each one.

Then verify the capability list from `main` is intact end to end:

- start / pause / resume / manual next turn / reset / abort / completed
- live streamed responses, health checks, model discovery, model-name reconciliation
- NDJSON and OpenAI-compatible stream parsing
- automatic simulation fallback, and that `usingSimulation` surfaces it
- separate Alpha, Beta and Judge endpoints
- live/interim and final judging, weighted criteria, score scale, draw threshold, per-criterion
  explanations, stale-request protection, heuristic judging in simulation
- English and Arabic modes with correct RTL transcript presentation
- English and Arabic TTS, per-debater voices, queued playback, transcript reveal synced to speech,
  stop/reset
- streaming conversation, parsed reasoning blocks, speaker states, round progress, connection and
  simulation status, telemetry, context usage, raw HTTP monitoring, auto-follow
- Markdown transcript and scorecard export

Use the `local-llm-fixtures` mock rather than requiring a GPU.

Report a table: capability → wired to → verified how → status. Flag anything that renders but does
not function, and anything that lost a state it used to have.
