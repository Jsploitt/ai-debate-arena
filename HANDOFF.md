# Handoff — `/` ↔ `/arena` sync work

Written at the end of a cloud session so this can continue locally. Delete this file before
opening a PR; it is session scratch, not project documentation.

Branch: `claude/frontend-qa-sync-debug-0qtagt` — 2 commits, pushed, working tree clean.

---

## State

The reported bug is fixed and covered. `/` and `/arena` were two independent `useDebate()`
instances with no synchronization mechanism of any kind in the codebase. They now share one
session, in-tab via a provider and cross-tab via a leader-elected `BroadcastChannel`.

Verification at handoff:

| Check               | Result                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `bun run lint`      | 0 errors, 6 warnings (baseline was 0 / 5; the extra is the same `react-refresh` pattern the other providers have) |
| `bunx tsc --noEmit` | clean                                                                                                             |
| `bun run build`     | succeeds                                                                                                          |
| `bun run test`      | **17/17 pass** (the 12 sync tests fail 11/12 against the pre-fix code)                                            |
| built server smoke  | `node .output/server/index.mjs` → `/` 200, `/arena` 200, `/nope` 404; 3 sync tests pass against it                |

The full QA report is in the session transcript, not in the repo.

---

## Running it locally

The cloud sandbox needed two workarounds that you should **drop** locally:

```bash
bun install
bun run dev            # locally this just works; the sandbox needed
                       # `bunx vite dev --host 127.0.0.1 --port 8080` because it has no IPv6
                       # and @lovable.dev/vite-tanstack-config binds `::`

bunx playwright install chromium   # do this once
bun run test                       # the sandbox needed CHROMIUM_PATH=... because its
                                   # pre-provisioned Chromium build did not match Playwright 1.62.
                                   # playwright.config.ts only reads CHROMIUM_PATH if it is set,
                                   # so locally leave it unset.
```

`playwright.config.ts` starts the dev server itself (`webServer`, `reuseExistingServer: true`) on
`127.0.0.1:8080`; override with `E2E_HOST` / `E2E_PORT`.

The suite takes ~7.5 minutes: `workers: 1` and `fullyParallel: false`. Each test gets its own
browser context so the leader leases do not collide — the serial setting is caution about
timing-sensitive cross-tab assertions under CPU contention, not a correctness requirement. Try
raising it locally; if the failover and snapshot-timing tests stay green, keep the speedup.

---

## Where the code lives

| File                                        | Role                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/components/arena/DebateProvider.tsx`   | the single session; leader/follower, snapshot publishing, command dispatch, promotion/adopt |
| `src/lib/debate/sessionChannel.ts`          | `BroadcastChannel` transport + the `localStorage` leader lease                              |
| `src/lib/debate/useDebate.ts`               | engine; gained `options.active`, unmount abort, `adoptSession()`                            |
| `src/lib/debate/useSpeech.ts`               | gained `options.active`, unmount guards, abort signal, URL revocation                       |
| `src/components/arena/SettingsProvider.tsx` | `storage` listener + read-modify-write against persisted settings                           |
| `tests/e2e/sync.spec.ts`                    | 12 two-page synchronization tests                                                           |
| `tests/e2e/arena.spec.ts`                   | 5 regressions from exploratory testing                                                      |
| `tests/e2e/helpers.ts`                      | seeding, hydration-safe interactions, shared locators                                       |

Mental model: one tab holds a lease and drives the models; it publishes throttled snapshots;
other tabs mirror those snapshots and forward their control actions to it. Only the driving tab
plays audio. Separate browser profiles are separate clients and do not sync — that boundary is
asserted by a test on purpose.

---

## Remaining work, in the order I would do it

### 1. Exercise it against real models

Nothing here ran against a real LLM — everything used simulation mode or dead endpoints. Untested:
real streaming cadence, `<think>` extraction against real output, live judge JSON repair, real TTS
timing and the voice-synced reveal.

```bash
bun .claude/skills/local-llm-fixtures/scripts/mock-ollama.ts   # GPU-free, binds all five ports
```

Then re-run the sync scenarios with `mode: "live"` and `tts.enabled: true`. The interesting
question is snapshot throttling under real token rates, and whether the follower's mirrored
reveal stays in step with the leader's audio.

### 2. Fix `bun run preview` (pre-existing, unrelated to this work)

It looks for `dist/server/server.js`, but `vite.config.ts` sets the nitro `node-server` preset
which emits `.output/server/index.mjs`. Either point the preview plugin at the nitro output or
change the `preview` script to run the built server directly.

### 3. Decide on BUG-7 — typing before hydration is discarded

Measured: ~800ms window on a cold dev server, less in production. Text typed into the motion
field before React hydrates is silently thrown away. Pre-existing and inherent to SSR + controlled
inputs. Options: disable the field until hydrated, or seed state from the DOM on mount. Both have
worse trade-offs than the bug in my view, hence untouched — your call.

### 4. Bound snapshot size for long debates

`logs` is tail-capped at `SNAPSHOT_LOG_LIMIT` (150), but `messages` is sent whole on every
snapshot. Fine at the default 4 rounds; a much longer debate makes each 80ms snapshot
progressively larger. Delta encoding on `messages` would fix it.

### 5. Leader election under background throttling

Browsers clamp timers in hidden tabs, so a backgrounded driving tab could let its 3s lease lapse
and trigger an unnecessary handover. The adopt path makes that safe rather than destructive, but
it would surface as a debate flipping to `paused`. I could not reproduce background throttling in
headless Chromium — worth checking in a real window with the tab hidden for a few minutes.

### 6. Fonts

The sandbox blocked `fonts.googleapis.com`, so everything was tested on fallback fonts. Anything
font-metric-dependent in the layout is unverified.

### 7. Trivia

`docs/local-llm-backend-notes.md` fails `prettier --check` — pre-existing, untouched.

---

## Gotchas that will waste your time if you rediscover them

- **The topic rails on `/` are infinite CSS marquees.** Playwright's "element is stable" check
  never passes on them. The app stands them down under reduced motion, so `helpers.preparePage()`
  calls `page.emulateMedia({ reducedMotion: "reduce" })` per page. The `use.reducedMotion` config
  option was _not_ honoured by the sandbox's Chromium; the explicit per-page call works on both.
  Do not "simplify" this away.
- **Pre-hydration clicks and typing are dropped** (BUG-7). The helpers retry until a React-derived
  signal responds — `Begin the debate` appearing, or `Start` becoming enabled. Do not replace those
  with fixed sleeps; they will pass against inert SSR markup.
- **`context.on("request")` aggregates across every page in the context.** I briefly concluded a
  mirroring tab was polling health when it was the first tab's 15s interval. Attribute per page.
- **Test seeding** goes through `context.addInitScript` writing `debate-arena-settings-v1`;
  `loadSettings()` deep-merges over defaults, so a partial patch is enough.
- **Do not force-push this branch** — the repo syncs to Lovable and rewriting pushed history
  loses project history (see `AGENTS.md`).
