# Local LLM Debate Arena — Dell Saudi Arabia

An event-ready, big-screen web application where **two locally hosted LLMs debate any topic you give them**, live, with an **AI judge** scoring both sides in real time.

Everything runs against models on your own workstation (Ollama by default) — **no prompt, no token, and no transcript ever leaves the machine**. Built as a showcase demo for Dell Technologies Saudi Arabia, themed in Dell deep navy/blue fused with Saudi flag green.

---

## What it does

- **Two debaters, one topic.** Enter a resolution; Debater Alpha argues for, Debater Beta argues against, alternating turns for a configurable number of rounds.
- **Live token streaming.** Responses stream token-by-token from the local runtime, with visible "thinking → speaking" states per debater.
- **Visible reasoning.** If a model emits `<think>…</think>`, the arena renders it as a collapsible terminal-style "Reasoning Path" block, separate from the argument itself.
- **AI Judge with live scoring.** A third model scores both sides on **Logic, Evidence, Rebuttal, Clarity and Persuasion**, updating after every round — not just at the end — and gives a one-line reason for each individual score plus a final verdict.
- **Real model names.** The app queries the runtime for installed models, reconciles configured names against real tags (`llama3` → `llama3:latest`), and displays the model the runtime actually served.
- **Telemetry for the audience.** Time-to-first-token, generation speed (tok/s), round token counts, last-turn latency and context-window usage.
- **Developer console.** A live HTTP monitor showing every request and streamed chunk against the local endpoints — useful for proving on stage that inference is local.
- **Never fails on stage.** If the local runtime is unreachable, the app transparently falls back to a scripted **simulation mode** with high-quality pre-written debates, so the demo always runs.
- **Transcript export.** Download the full debate as Markdown, including the judge's score matrix, per-criterion reasons and verdict.

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
npm i
npm run dev
```

Open the printed URL, type a resolution (or pick a suggested topic), and press **Start Debate**.

If no local runtime answers, a **Simulation Mode** badge appears in the header and the arena runs the scripted debate instead.

---

## Using the arena

| Control | What it does |
| --- | --- |
| **Start Debate** | Begins the debate on the entered resolution |
| **Pause / Resume** | Halts after the current turn, resumes where it stopped |
| **Next Turn** | Steps one turn at a time — useful for narrating a live demo |
| **Reset Arena** | Clears the transcript, telemetry, logs and scorecard |
| **Transcript** | Downloads the full debate + scorecard as Markdown |
| **Auto-follow** | Toggles transcript auto-scroll (off by default, so the view never jumps mid-presentation) |
| **Configuration** | Per-debater and judge settings panel |
| **Developer Console** | Telemetry cards + live HTTP monitor |

### Configuration panel

Per debater (Alpha / Beta) and for the judge:

- **Endpoint** — defaults to `http://localhost:11434/api/chat`; each side can point at a *different* workstation.
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
    index.tsx                 # arena page: layout, wiring, Markdown transcript export
  components/arena/
    ArenaHeader.tsx           # branding, connection pills, resolved model names
    DebaterStage.tsx          # Alpha vs Beta stage, avatars, round counter
    ConversationStream.tsx    # streamed messages, reasoning blocks, auto-follow
    JudgePanel.tsx            # scorecard, per-criterion bars + reasons, skeletons
    ControlDesk.tsx           # topic input, start/pause/next/reset/transcript
    SettingsPanel.tsx         # debater + judge configuration
    DevConsole.tsx            # telemetry cards + live HTTP monitor
  lib/debate/
    types.ts                  # shared types (messages, telemetry, scorecard, chunks)
    presets.ts                # tone presets, thinking levels, defaults, persistence
    ollamaClient.ts           # streaming fetch client, health check, model resolution
    judge.ts                  # judge prompt, live judging, heuristic fallback
    simulation.ts             # scripted offline debates
    useDebate.ts              # state machine: turns, streaming, health, judging
  styles.css                  # Dell + Saudi theme tokens, gradients, arena utilities
```

### Streaming client

`ollamaClient.ts` POSTs to the endpoint with `stream: true` and parses NDJSON line-by-line, tolerating both Ollama's native shape (`message.content`, `done`, `eval_count`) and OpenAI-compatible deltas (`choices[].delta.content`). Each chunk also reports the model the runtime actually used, which is what the header pills display.

### State machine

`useDebate.ts` owns the whole lifecycle: health polling, model resolution, turn ordering, per-turn streaming and telemetry, pause/step control, automatic simulation fallback, and round-triggered judging.

### Theming

All colours are semantic tokens in `src/styles.css`: Dell deep navy canvas, Dell blue (`#0076CE`) as primary, Saudi flag green as accent, with flag-inspired corona gradients, a geometric arabesque lattice background, and `arena-*` utilities for the panels, pulse rings and glow effects. No hard-coded colour classes in components.

---

## Privacy & event notes

- All inference is local; the app makes no outbound calls to any AI provider.
- Alpha, Beta and the judge can each target a different Dell workstation to show multi-node inference.
- Simulation mode is the safety net — if the venue network or the runtime misbehaves, the demo continues uninterrupted.
