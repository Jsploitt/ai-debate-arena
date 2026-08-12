# Arena of Debate — Local LLM Debate Arena

An event-ready, big-screen web application where **two locally hosted LLMs debate any topic you give them**, live, under the spotlight, with an **executive AI judge** scoring both sides in real time.

Everything runs against models on your own workstation (Ollama by default) — **no prompt, no token, and no transcript ever leaves the machine**.

## Routes

| Route    | What it is                                                                                                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`      | **Arena of Debate** — the stage. Pick a motion from the marquee rails, appoint a CFO, CTO, CMO or CEO judge, and watch two illustrated agents debate it under the spotlight. Ends with a downloadable PDF brief. |
| `/arena` | **Control Arena** — the instrumented view. Transport controls, live transcript with reasoning, weighted judge scorecard, telemetry, raw HTTP monitor, and the full configuration panel.                          |

Both routes drive the **same** debate engine and share the same persisted settings; each links to the other.

The visual design is imported from a pinned reference commit — see `docs/frontend-migration-notes.md` for the SHA, the feature mapping, and the documented deviations.

---

## What it does

- **Two debaters, one topic.** Enter a resolution; Debater Alpha argues for, Debater Beta argues against, alternating turns for a configurable number of rounds.
- **Executive judge personas.** CFO, CTO, CMO and CEO each weight the five criteria differently — the CFO wants evidence, the CTO wants logic, the CMO wants persuasion, the CEO wants clarity. Picking one rewrites the real judge weights, not just a label.
- **Live token streaming.** Responses stream token-by-token from the local runtime, with visible "thinking → speaking" states per debater.
- **Visible reasoning.** If a model emits `<think>…</think>`, the arena renders it as a collapsible terminal-style "Reasoning Path" block, separate from the argument itself.
- **AI Judge with live scoring.** A third model scores both sides on **Logic, Evidence, Rebuttal, Clarity and Persuasion**, updating after every round — not just at the end — and gives a one-line reason for each individual score plus a final verdict.
- **Real model names.** The app queries the runtime for installed models, reconciles configured names against real tags (`llama3` → `llama3:latest`), and displays the model the runtime actually served.
- **Telemetry for the audience.** Time-to-first-token, generation speed (tok/s), round token counts, last-turn latency and context-window usage.
- **Developer console.** A live HTTP monitor showing every request and streamed chunk against the local endpoints — useful for proving on stage that inference is local.
- **Never fails on stage.** If the local runtime is unreachable, the app transparently falls back to a scripted **simulation mode** with high-quality pre-written debates, so the demo always runs.
- **Bilingual.** Debate in English or Arabic, with correct right-to-left presentation and a separate Arabic voice.
- **Transcript export.** Download the full debate as Markdown, including the judge's score matrix, per-criterion reasons and verdict — or a formatted PDF brief in the judge persona's voice.

---

## Quick start

### 1. Run the models locally (Ollama)

```sh
# install models
ollama pull llama3
ollama pull qwen2.5

# allow the browser to call the local API
OLLAMA_ORIGINS="*" ollama serve
```

`OLLAMA_ORIGINS="*"` is required — without it the browser blocks the cross-origin request to `localhost:11434` and the app drops into simulation mode.

### 2. Run the app

```sh
bun install
bun run dev
```

Open the printed URL, pick a motion from the rails, appoint a judge, and press **Begin the debate**.

### No GPU? Run the mock stack

A mock backend speaks the same protocols on the same ports, so every live code path works without a GPU or a model download:

```sh
bun .claude/skills/local-llm-fixtures/scripts/mock-ollama.ts
```

It binds 11434, 11435, 11436, 8100 and 8101 with permissive CORS, and supports failure injection via `?fail=`, `?judge=` and `?format=` query parameters. See `.claude/skills/local-llm-fixtures/SKILL.md`.

If no local runtime answers, a **Simulation Mode** badge appears in the header and the arena runs the scripted debate instead.

---

## Using the arena

| Control               | What it does                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------- |
| **Start Debate**      | Begins the debate on the entered resolution                                               |
| **Pause / Resume**    | Halts after the current turn, resumes where it stopped                                    |
| **Next Turn**         | Steps one turn at a time — useful for narrating a live demo                               |
| **Reset Arena**       | Clears the transcript, telemetry, logs and scorecard                                      |
| **Transcript**        | Downloads the full debate + scorecard as Markdown                                         |
| **Auto-follow**       | Toggles transcript auto-scroll (off by default, so the view never jumps mid-presentation) |
| **Configuration**     | Per-debater and judge settings panel                                                      |
| **Developer Console** | Telemetry cards + live HTTP monitor                                                       |

### Configuration panel

Per debater (Alpha / Beta) and for the judge:

- **Endpoint** — defaults to `http://localhost:11434/api/chat`; each side can point at a _different_ workstation.
- **Model** — any tag installed on that endpoint.
- **Temperature / top-p** — sampling controls.
- **Tone preset** — Aggressive, Analytical, Humorous, Conservative, Socratic, Diplomatic, or Custom.
- **Thinking level** — 0 (none) to 3 (deep chain of reasoning inside `<think>` tags).
- **System prompt** — fully editable.
- **Rounds**, **context window**, and **execution mode** (`auto` / `live` / `simulation`).

Settings persist in `localStorage`, so a configured demo machine keeps its setup across reloads.

---

## How the judge works

After each round (both sides have spoken), the judge model receives the transcript so far and returns a structured scorecard:

- A 0–10 score per criterion per side, with a short reason citing a specific argument.
- Running totals, a leader while the debate is in progress, and a final verdict when it ends.
- The panel shows a skeleton on first score and a dimmed "Judge is updating…" state on re-scores, so the UI never appears frozen.
- Judging requests are sequence-tracked, so a slow response from an earlier round can never overwrite newer scores.

In simulation mode the judge falls back to a heuristic scorer driven by turn count, vocabulary diversity, evidence markers and direct-rebuttal detection, so the scorecard still behaves realistically offline.

---

## Technical overview

**Stack:** TanStack Start (React 19 + TanStack Router) on Vite 7, Tailwind CSS v4 (CSS-first theming in `src/styles.css`), shadcn/ui + Radix primitives, lucide-react icons. The debate itself is entirely **client-side** — the browser talks directly to your local inference endpoints, so there is no server hop and no cloud dependency.

```
src/
  routes/
    index.tsx                 # `/`  — the stage: rails, personas, characters, scoreboard, PDF
    arena.tsx                 # `/arena` — instrumented arena + configuration sheet
    __root.tsx                # shell, fonts, meta, SettingsProvider, Toaster
  components/arena/
    stage.tsx                 # TopicRail, CloudBubble, LeanBar, AgentStage, ScoreBanner
    panels.tsx                # Transcript, Scorecard, Telemetry, HttpMonitor, StatusRail
    ConfigPanel.tsx           # the whole configuration surface
    SettingsProvider.tsx      # persisted ArenaSettings shared by both routes
  lib/
    personas.ts               # executive judge personas → judge weight presets
    pdf.ts                    # jsPDF verdict brief, built from the real scorecard
    transcript.ts             # pure Markdown builder + isolated download
    debate/
      types.ts                # shared types (messages, telemetry, scorecard, chunks)
      presets.ts              # tone presets, thinking levels, defaults, persistence
      ollamaClient.ts         # streaming fetch client, health check, model resolution
      judge.ts                # judge prompt, live judging, heuristic fallback
      simulation.ts           # scripted offline debates
      tts.ts                  # speech synthesis requests
      useDebate.ts            # state machine: turns, streaming, health, judging
      useSpeech.ts            # sequential TTS queue + voice-synced reveal
      presentation.ts         # pure view-model helpers (no React, no DOM)
  styles.css                  # design tokens, arena utilities, reduced-motion rules
```

### Streaming client

`ollamaClient.ts` POSTs to the endpoint with `stream: true` and parses NDJSON line-by-line, tolerating both Ollama's native shape (`message.content`, `done`, `eval_count`) and OpenAI-compatible deltas (`choices[].delta.content`). Each chunk also reports the model the runtime actually used, which is what the header pills display.

### State machine

`useDebate.ts` owns the whole lifecycle: health polling, model resolution, turn ordering, per-turn streaming and telemetry, pause/step control, automatic simulation fallback, and round-triggered judging.

### Theming

All colours are semantic **oklch** tokens in `src/styles.css` (Tailwind v4 CSS-first — there is no `tailwind.config.js`): a deep desaturated navy canvas under a fixed cyan-blue radial glow, one accent hue family around 245°, with `--pro` and `--con` distinguished by lightness rather than opposing hues. Space Grotesk for display, DM Sans for body. Utilities `arena-panel`, `gold-text`, `topic-marquee`, `spotlight-beam`, `cloud-bubble` and `bubble-pop` carry the stage look; `prefers-reduced-motion` and `hover: none` stand the animations down.

A new colour is a three-step change — define it on `:root`, register it in `@theme inline` as `--color-<name>`, then use it. See `.claude/skills/design-tokens/SKILL.md`.

### Agentic workflows

The repository ships a hub-and-spoke agent layer under `.claude/` — a routing hub, six role spokes, six skills encoding project knowledge, and seven slash commands (`/verify`, `/fidelity-check`, `/engine-audit`, `/config-audit`, `/a11y-pass`, `/backend-up`, `/migrate-phase`). See `AGENTS.md`.

---

## Privacy & event notes

- All inference is local; the app makes no outbound calls to any AI provider.
- Alpha, Beta and the judge can each target a different Dell workstation to show multi-node inference.
- Simulation mode is the safety net — if the venue network or the runtime misbehaves, the demo continues uninterrupted.
