# Frontend migration — reference design import

## Reference

The visual design is imported from **`https://github.com/Leen-ekrish/lovable-backup`** at commit

```
0c8646ef7ba2294d770cb74f1be809bf6acf5119
```

That pin is what makes "matches the reference" checkable. Compare against the commit, never the tip
of that repository. The full component/token/asset inventory captured during discovery lives in
`.claude/skills/reference-fidelity/references/reference-inventory.md`.

Both projects are the same stack — TanStack Start, React 19, Tailwind v4 CSS-first, shadcn/ui
new-york, bun — so the migration was a styles + routes + components swap rather than an
infrastructure change.

## What was kept from each side

| Source of truth for                                                | Comes from               |
| ------------------------------------------------------------------ | ------------------------ |
| Visual design, layout, typography, motion, assets                  | the reference repository |
| Debate behaviour, transport, judging, TTS, persistence, deployment | this repository's `main` |

The reference's own backend (TanStack server functions calling `ai.gateway.lovable.dev` with a
`LOVABLE_API_KEY`) was **not** ported: it requires outbound internet and an API key, which breaks
this project's offline local-Ollama Docker contract. `/` keeps the reference's exact look and
interaction but is driven by the existing `useDebate`/`useSpeech` engine.

## Routes

| Route    | What it is                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`      | **Arena of Debate** — the reference landing experience: marquee topic rails, executive persona picker, character stage with spotlights and speech clouds, broadcast scoreboard, verdict bar with PDF brief. Links to `/arena`.                          |
| `/arena` | **Control Arena** — the instrumented experience in the same design language: status rail, stage band, transport controls, transcript with reasoning, judge scorecard, telemetry, raw HTTP monitor, and the full configuration sheet. Links back to `/`. |

The reference's unlinked `/copy-1` route was not ported — it is dead, superseded by `/`, and nothing
links to it.

## Feature → UI mapping

| Capability                                                    | Implementation                        | New home                                              | Reference pattern                  | Verified by                                                              |
| ------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Debate state machine (start/pause/resume/next/reset/finished) | `useDebate`                           | `/arena` transport bar; `/` start+reset               | footer button row                  | Playwright: start, pause, next turn, resume, run to completion           |
| Live streaming + health + model discovery                     | `ollamaClient`                        | `StatusRail`, config tests                            | `arena-panel` pill, micro-labels   | endpoint test against the mock returns "Reachable"                       |
| Simulation auto-fallback                                      | `useDebate` catch → `usingSimulation` | badge on both routes                                  | uppercase micro-label              | forced simulation run completes end to end                               |
| Interim + final judging, weights, scale, tie rules            | `judge.ts`                            | `/` scoreboard + `LeanBar`; `/arena` `ScorecardPanel` | `ScoreSide`, round pips, `LeanBar` | scores move per turn; per-criterion reasons render                       |
| Judge persona weighting                                       | `settings.judge.weights`              | `/` persona picker                                    | 2→4 col persona grid               | Playwright asserts picking CTO writes `Logic: 2.2` to persisted settings |
| English/Arabic + RTL                                          | `settings.language`                   | toggle on both routes                                 | pill toggle                        | Playwright asserts `dir="rtl"` in Arabic                                 |
| TTS, voices, synced reveal                                    | `useSpeech` + `tts.ts`                | drives character lighting and cloud text              | `AgentStage` crossfade             | reveal helpers extracted to `presentation.ts`                            |
| Transcript + reasoning                                        | `DebateMessage`                       | `/arena` `TranscriptPanel`                            | panel cards                        | transcript populates with collapsible reasoning                          |
| Telemetry, context, HTTP monitor                              | `useDebate` logs/telemetry            | `/arena` panels                                       | `arena-panel` + micro-labels       | TTFT/tok-s/tokens and NDJSON lines render                                |
| Full configuration + endpoint tests                           | `presets.ts`, `ollamaClient`          | `/arena` `ConfigPanel` in a `Sheet`                   | `Sheet` + `Tabs`                   | all five endpoints separately listed and testable                        |
| Markdown transcript export                                    | `lib/transcript.ts`                   | `/arena` toolbar                                      | `Download` button                  | pure builder + isolated download                                         |
| Verdict PDF brief                                             | `lib/pdf.ts` (ported)                 | `/` verdict bar                                       | jsPDF brief                        | built from the real scorecard, not a second LLM call                     |
| SSR / error pages / Docker                                    | `server.ts`, `Dockerfile`             | unchanged                                             | —                                  | production server serves both routes                                     |

## Intentional deviations from the reference

| Deviation                                                                                | Why                                                                                       |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/` runs on the local engine, not the Lovable AI gateway                                 | The gateway needs `LOVABLE_API_KEY` and internet; this project must run offline.          |
| Round pips count `settings.rounds`, not a hardcoded 3                                    | Round count is user-configurable here.                                                    |
| Turns are driven by real streaming and TTS completion, not fixed 6.5s sleeps             | Real generation has variable duration; fixed sleeps would desynchronise the voice reveal. |
| Personas are a weight preset over `judge.ts`; the reference's `weightedTotal` is dropped | `judge.ts` is the single scoring authority. Two scorers would eventually disagree.        |
| `/copy-1` not ported                                                                     | Dead, unlinked, superseded.                                                               |
| A visible `/arena` navigation link added                                                 | The reference has no navigation; the arena must be discoverable.                          |
| `/arena` scrolls instead of locking to `h-screen`                                        | The instrumentation cannot fit a locked viewport.                                         |
| Marquee pauses on `focus-within` and stops entirely under `hover: none`                  | The reference's hover-to-pause leaves keyboard and touch users chasing a moving target.   |
| `prefers-reduced-motion` stands down marquees, spotlight flicker and crossfades          | Accessibility requirement the reference does not handle.                                  |
| `dir="rtl"` on Arabic content containers                                                 | Bilingual requirement the reference does not have.                                        |
| Cloud column widened to `max-w-[70%]` below `sm`                                         | The reference's `max-w-[46%]` is unreadable on a phone.                                   |

## Removed

**Old-design components** (all proven unreferenced first): `ArenaHeader`, `DebaterStage`,
`ConversationStream`, `ControlDesk`, `JudgePanel`, `DevConsole`, `SettingsPanel`,
`EndpointsSection`.

**Design tokens and utilities**: `--color-alpha`, `--color-alpha-soft`, `--color-beta`,
`--color-beta-soft`, `--color-steel`, `--color-terminal`, the Saudi-green accent, `--font-mono` as
a design font, the arabesque-lattice/tech-grid body background, and the utilities `arena-ring`,
`arena-flicker`, `arena-rise`, `arena-shake`, `arena-spin-slow`, `arena-flag-rule`, `arena-geo`.

**Unused shadcn primitives and their dependencies**: `chart`, `carousel`, `form`, `input-otp`,
`calendar`, `resizable`, `drawer`, `command`, `sidebar` — and with them `recharts`,
`embla-carousel-react`, `react-hook-form`, `@hookform/resolvers`, `input-otp`, `react-day-picker`,
`date-fns`, `react-resizable-panels`, `vaul`, `cmdk` (10 packages).

**Other**: the stray `test.txt`, and the old Dell meta/OG tags.

**Deliberately kept** even though the new design does not render them: everything under
`src/lib/debate/`, `simulation.ts`, `docker/`, `docker-compose.yml`, `Dockerfile`, `docs/`,
`src/server.ts`, `src/start.ts`, and the error pages.

## Added

`jspdf` (the verdict brief), and `playwright` as a dev dependency for the smoke test.

## Architecture notes

- **One state machine.** `useDebate` remains the sole lifecycle owner. Each route instantiates it
  once; no component forks it.
- **Shared settings.** `SettingsProvider` (mounted in `__root.tsx`) holds the persisted
  `ArenaSettings`, so both routes see the same configuration. It initialises from
  `DEFAULT_SETTINGS` and only reads `localStorage` inside an effect, which is what keeps hydration
  clean.
- **Pure view helpers.** `src/lib/debate/presentation.ts` holds every derivation the UI needs —
  `effectiveStatus`, `effectiveRound`, `speakingSide`, `cloudText`, `revealedText`, `agentMood`,
  `leanPercent`, `runtimeState`, `runtimeLabel`. No React, no DOM, so they are testable as-is. The
  generation/voice skew correction lives here rather than being duplicated per route.
- **Browser boundaries.** `localStorage`, `Audio`, `URL.createObjectURL` and downloads run only in
  effects and event handlers. `buildTranscriptMarkdown` is pure; `downloadMarkdown` is the only
  browser-touching half.

## Verification performed

| Check                          | Result                                                                                                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx tsc --noEmit`            | clean (baseline had 1 pre-existing error in `judge.ts`, fixed by making `DebaterConfig.voice` optional)                                              |
| `bun run lint`                 | 0 errors, 5 warnings (baseline: 78 errors, 8 warnings — all remaining warnings are `react-refresh/only-export-components` inside stock shadcn files) |
| `bun run build`                | clean, `.output/server/index.mjs` emitted                                                                                                            |
| Production server, both routes | HTTP 200 on direct load                                                                                                                              |
| Horizontal overflow            | none, at 1440×900 and 390×844, on both routes                                                                                                        |
| Console/network                | clean except the Google Fonts request, which the build sandbox blocks                                                                                |

Browser smoke test (`playwright`, Chromium, against the GPU-free mock backend), run at **1440×900
and 390×844**, both passing:

1. `/` idle → pick a motion from the marquee → appoint a CTO judge → begin the debate
2. asserts the persona actually wrote `judge.weights.Logic = 2.2` into persisted settings
3. speech clouds render, characters light and dim, scoreboard and lean bar move
4. runs to a final verdict and the PDF download bar
5. navigates to `/arena`, starts a second debate, transcript populates
6. pause → next turn → resume all operate
7. configuration sheet opens; an endpoint test returns "Reachable"
8. switching to Arabic sets `dir="rtl"`

Screenshots were captured for every route and state at both viewports.

## Known limitations

1. **Google Fonts are loaded from the network.** Space Grotesk and DM Sans come from
   `fonts.googleapis.com`, exactly as the reference does. In a genuinely air-gapped deployment they
   will not load and the design falls back to `system-ui`, which changes the typography though not
   the layout. Both faces are SIL OFL 1.1 and may be self-hosted — see the follow-up below. This is
   also why the smoke test reports a blocked font request: the build sandbox has no route to
   Google.
2. **Live-service paths were exercised against the mock, not real GPUs.** The Ollama and TTS
   containers need NVIDIA hardware and GGUF files that this environment does not have. The mock
   speaks the same protocols on the same ports, but a real end-to-end run on the target hardware is
   still worth doing before a showcase.
3. **TTS voice sync was verified structurally, not audibly.** The mock returns valid silent WAVs of
   realistic duration, so queueing, `revealFraction` and reveal ordering are exercised; the actual
   speech quality is not.

## Follow-up work

1. **Self-host the two fonts** under `public/fonts/` with `@font-face` and `font-display: swap`,
   removing the Google dependency and closing limitation 1.
2. **Automated test suite** — recorded as the next milestone, deliberately not built now:
   - Vitest + Testing Library + a DOM environment, with `test`, `test:watch` and coverage scripts.
   - Unit tests for stream parsing, `resolveModelName`, reasoning extraction, judge response
     repair/parsing, weighted scoring and tie rules, simulation selection, settings default
     merging/migration, transcript generation, speech-text cleanup, and every helper in
     `presentation.ts`.
   - Hook/integration tests for the debate lifecycle with mocked streaming fetch and audio: live
     success, auto fallback, pause/resume, one-step execution, abort/reset, judge sequencing,
     interim vs final scorecards, TTS queueing and cleanup.
   - Component tests for configuration fields, validation and persistence; language/RTL; transport
     button states; transcript rendering; scorecards; errors; keyboard-accessible overlays.
   - Playwright E2E for navigation, a complete simulated debate, configuration persistence, export,
     responsive flows and accessibility smoke checks. The existing smoke script is the seed.
   - Deterministic fixtures already exist in `.claude/skills/local-llm-fixtures/fixtures/` — Ollama
     NDJSON, OpenAI SSE, truncated streams, thinking blocks, health/model-list failures, and
     valid/fenced/partial/malformed judge JSON. The default suite must never need a GPU.
   - CI gates added incrementally: format check, lint, typecheck, unit/component, production build,
     then critical E2E. Set coverage thresholds after a first baseline rather than chasing line
     coverage.

   The extraction of pure helpers and the use of stable accessible selectors during this migration
   were done specifically so this milestone is additive rather than another rewrite.
