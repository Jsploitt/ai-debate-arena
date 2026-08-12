---
name: verification-protocol
description: The verification gate for ai-debate-arena — the exact command sequence, the recorded pre-existing baseline, the manual smoke matrix, screenshot viewports, console/network criteria, and what counts as a pass. Load before running checks or claiming something works.
---

# Verification protocol

## The recorded baseline

Measured on `main` at commit `38388e2` before the frontend migration began:

| Check           | Result                                                                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run lint`  | **fails** — 86 problems: 78 errors (all `prettier/prettier` formatting) + 8 warnings (`react-hooks/exhaustive-deps`, one unused eslint-disable in `useSpeech.ts`) |
| `bun run build` | **passes** — `.output/server/index.mjs` emitted, ~940ms                                                                                                           |

Only _new_ failures are regressions. Never report a pre-existing failure as one, and never let the
noise of the pre-existing ones hide a new error — filter by rule and by file.

Because the pre-existing failures are entirely formatting, `bun run format` should be run once
during the migration to clear them, after which lint is expected to be **clean** and the baseline
above becomes historical.

## Command sequence — run in this order, run all of them

```bash
bun install --frozen-lockfile
bunx prettier --check .        # format check (non-mutating)
bun run lint                   # eslint
bunx tsc --noEmit              # typecheck
bun run build                  # production build → .output/server/index.mjs
bun run preview                # serve the built output
```

A failure early does not excuse skipping the rest. One report should cover the whole gate.

## Smoke matrix

The full cross product is 16 runs; the marked subset is the required minimum.

| #   | Mode       | Language | TTS | Judge | Required               |
| --- | ---------- | -------- | --- | ----- | ---------------------- |
| 1   | simulation | en       | off | on    | ✓                      |
| 2   | simulation | ar       | on  | on    | ✓                      |
| 3   | simulation | en       | on  | off   | ✓                      |
| 4   | live       | en       | off | on    | ✓ when services are up |
| 5   | live       | ar       | on  | on    | ✓ when services are up |

For each run, exercise: topic entry and a sample topic · start · pause · resume · manual next turn
· reset · run to completion · judge and re-judge · Markdown export · navigation `/` ↔ `/arena` ·
reload with persisted configuration.

**Live-only checks** (require `docker compose up`):

- health pills go `checking` → `online`;
- model discovery populates the select, and manual entry still works when it does not;
- endpoint tests on all five endpoints (11434, 11435, 11436, 8100, 8101), including one failure;
- stopping a container mid-debate flips to simulation with a visible badge and the debate continues.

**Simulation-only checks** (no GPU, always runnable): everything else. Use the mock server in the
`local-llm-fixtures` skill to exercise live-transport code paths without a GPU.

## Screenshots

Viewports: **1440×900** (desktop) and **390×844** (mobile).

Capture, at both:

- `/` idle (title + topic rails)
- `/` topic selected (persona picker)
- `/` mid-debate (characters lit, cloud bubble, scoreboard)
- `/` verdict state
- `/arena` idle
- `/arena` mid-debate with transcript and scorecard populated
- `/arena` configuration sheet open
- `/arena` in Arabic

Compare against the reference captures per the `reference-fidelity` skill. Structure first, pixels
second.

## Console and network criteria

Open the production preview, not the dev server. Zero tolerance for:

- hydration mismatch warnings — usually `localStorage` or `Date` read during render;
- 404s on assets, fonts or chunks;
- unhandled promise rejections;
- React key warnings and `act` warnings;
- CORS errors that reach the console without producing actionable UI guidance;
- requests firing after a reset (a leaked stream) or duplicated on a single click (double submit).

## Layout criteria

- No horizontal body scroll at either viewport, on any route, in either language.
- Direct load **and hard refresh** of `/` and `/arena` in the production preview — client-side
  navigation alone is not evidence that SSR works.
- Focus visible on every interactive element; sheets trap and restore focus.

## What counts as a pass

State one of exactly three verdicts:

- **Pass** — every gate command clean, required smoke rows exercised, console clean.
- **Pass with known issues** — followed by an itemised list, each with its impact and owning spoke.
- **Fail** — followed by the failing output verbatim and the file/line.

Never report a check as passing that you did not run. Never paraphrase output you did not see.
"Should work" is not a verification result.
