## Local LLM Debate Arena — Dell Saudi Arabia showcase

A single-page, fully client-side app (no backend needed — it talks straight to Ollama on the presenter's machine, and falls back to a scripted simulation if that's offline).

### Visual direction
Dark tech theme in `src/styles.css` tokens: near-black metallic gray base, deep blue surfaces, emerald accents. Alpha = cyan/blue glow, Beta = emerald glow. Large type, high contrast, readable from 5m. Glow rings, holographic VS badge, animated status pulses via CSS keyframes + Motion for entrance/streaming.

### Screen layout (`/` — replaces the placeholder index route)
```text
┌──────────────────────────────────────────────┐
│ Dell Saudi Arabia • AI Debate Arena          │
│ [Alpha ●online] [Beta ●offline]  Vision 2030 │
├───────────┬──────────────┬───────────────────┤
│ Alpha     │      VS      │ Beta              │
│ avatar    │  (flashing)  │ avatar            │
├───────────┴──────────────┴───────────────────┤
│  Conversation stream (bubbles + reasoning)   │
├──────────────────────────────────────────────┤
│  [ Debate resolution input ]  Start Pause ...│
└──────────────────────────────────────────────┘
   Settings sidebar (left drawer) │ Dev console (right drawer)
```

### Components to build
- `ArenaHeader` — title, subtitle, live health pills (polls `/api/tags` on each endpoint every 10s).
- `DebaterStage` — two `DebaterAvatar` cards (glow rings, Idle/Thinking/Speaking) + `VsBadge`.
- `ConversationStream` — message bubbles colored by speaker, streamed text, collapsible "Reasoning Path" block in mono/terminal styling (parses `<think>...</think>` or the model's reasoning field).
- `TelemetryPanel` — TTFT ms, tokens/sec, round token total, context-window usage bar.
- `HttpMonitor` — terminal block logging outgoing POST payload (URL, headers, system prompt, temperature, messages) and raw streamed JSON chunks.
- `SettingsSidebar` — per-model endpoint URL + model dropdown (fetched from `/api/tags`, with manual entry), temperature & top_p sliders, system prompt editors, tone presets, thinking level, rounds slider (2–10). Persisted to localStorage.
- `ControlDesk` — topic input, Start / Pause-Resume / Next Turn / Reset / Download Transcript (markdown).

### Debate engine (`src/lib/debate/`)
- State machine hook `useDebate`: topic → Alpha (user role) → Alpha's reply appended as user message to Beta's history → Beta counters → repeat N rounds. Supports pause, manual step-through, abort/reset.
- `ollamaClient.ts`: `fetch` POST to `/api/chat` with `stream: true`, read `ReadableStream`, split NDJSON lines, emit `{content, done, eval_count, ...}`; also tolerates OpenAI-style `data:` SSE chunks. Records TTFT and tokens/sec.
- `simulation.ts`: 3 scripted high-quality debates (AI Ethics, Quantum vs Supercomputing, Saudi Smart Cities / THE LINE) plus a generic fallback for arbitrary topics, replayed token-by-token with synthetic-but-plausible telemetry and fake JSON chunk logs, so the demo never fails.
- Mode selector: Auto (live if health check passes, else simulation), Force Live, Force Simulation.

### Technical notes
- Everything runs in the browser; no server functions, no database. Ollama CORS (`OLLAMA_ORIGINS=*`) is a workstation prerequisite — the app surfaces a clear inline hint with the exact command when a fetch fails with a network/CORS error.
- shadcn components (slider, dialog/sheet, tabs, accordion, select, textarea, button) + lucide-react icons + Motion for animation.
- SEO head() on the index route with an app-specific title/description/og tags.
