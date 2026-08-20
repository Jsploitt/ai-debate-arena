# Handoff — ai-debate-arena

Context dump for a fresh session. Written 2026-08-20. Supersedes the earlier handoff, which
described a different branch and had the two routes' roles backwards.

Machine: **GB10** (`promaxgb10-6594`), user `dellsa`, repo at
`/home/dellsa/leap_2026/prod/ai-debate-arena`. Everything below was verified on this box, not
assumed.

---

## 1. What this is

TanStack Start (React + Vite + Tailwind v4). Two local LLMs debate a motion; a third judges.

| Route    | Title in the UI   | Role                                                                    |
| -------- | ----------------- | ----------------------------------------------------------------------- |
| `/`      | "AI Debate Arena" | **Stage** — the presentation view LEAP visitors see                     |
| `/arena` | "Control Arena"   | **Operator** surface — full instrumentation and the Configuration sheet |

Get this the right way round: `/arena` is the _control_ page and links to `/` labelled "Stage".
The previous handoff had it inverted, which cost a session's worth of confusion.

Repo: `github.com/Jsploitt/ai-debate-arena` (public). Connected to **Lovable** — never force-push,
rebase, amend or squash anything already pushed. Lovable syncs `main` only, so side branches are
safe.

---

## 2. Where the work stands

Branch **`personas`**, cut from `agent/fix-runtime-sync-handoff`. Two commits, **pushed** —
`origin/personas` is at `6a98919`, identical to local:

- `f0bdb41` — the debater cast: a Cast tab in the Configuration sheet, characters that apply whole
  configuration presets, randomize, no-duplicates.
- `6a98919` — per-character artwork, the fourth mood state, distinct sampling profiles, the swap
  fix.

Working tree also has `.claude/launch.json`, `handoff.md`, `package-lock.json` staged-untracked and
a regenerated `src/routeTree.gen.ts`. None of those are part of the feature.

### The feature, in one paragraph

Four named characters — **Fahad** (founder), **Khalid** (marketer), **Rania** (logistics heir),
**Noura** (policy analyst). Picking one from the Cast tab writes a whole `DebaterConfig` preset:
name, system prompt, tone, temperature, topP, thinking level, voice. It deliberately does **not**
write `model` or `endpoint`, so any character works in either slot.

### Design decisions that are load-bearing

- **`characterId` is stored, not derived.** The stage avatar reads from it alone. An earlier design
  derived the character by matching config against the registry, which made the avatar snap back to
  default the moment any slider moved. Drift is surfaced separately as a "modified" badge.
- **Stance belongs to the slot, not the character.** `useDebate` appends "argue FOR/AGAINST" per
  turn based on alpha/beta. Character prompts therefore describe _how_ someone argues, never which
  side. This is subtler than avoiding the words: archetypes built on scepticism or caution read as
  a posture toward the resolution and silently override the assigned stance. In live testing Noura
  and Rania both argued _against_ a motion they were told to support. Every prompt now aims its
  manner at the opposing argument and ends with an explicit commit-to-your-side clause. **If you
  edit a character prompt, re-test it on both sides.**
- **Swap moves, it does not reset.** Picking a character already in the other slot exchanges the
  two slots' personality fields. Rebuilding the displaced character from its registry preset (the
  original behaviour) silently discarded hand-tuning.
- **Noura's `speaking` reuses her `base` art** — her niqab covers her mouth, so a speaking pose
  shows nothing new. Three files, four states.

### The four mood states

`agentMood()` in `src/lib/debate/presentation.ts`. Each appears only in its own case:

| State      | When                                                           |
| ---------- | -------------------------------------------------------------- |
| `speaking` | this side holds the floor (wins over everything)               |
| `pleased`  | ahead on points                                                |
| `tense`    | behind on points                                               |
| `base`     | none of the above — unscored or level; present but not emoting |

Scores persist past the verdict, so the winner keeps `pleased` and the loser `tense` until reset.

### Sampling profiles

Each character sits at a distinct point on all three axes. `thinkingLevel` also drives latency.

|               | Fahad   | Khalid   | Rania        | Noura   |
| ------------- | ------- | -------- | ------------ | ------- |
| temperature   | 1.10    | 0.85     | 0.65         | 0.35    |
| topP          | 0.95    | **0.98** | 0.88         | 0.78    |
| thinkingLevel | 0 Off   | 1 Brief  | 2 Structured | 3 Deep  |
| voice         | am_adam | am_echo  | af_sarah     | af_kore |

Fahad improvises and answers fastest; Noura is clipped, precise and **slowest**. If a Noura
matchup drags on stage, drop her `thinkingLevel` to 2 — one number in `src/lib/characters.ts`.

### Files

```
src/lib/characters.ts            cast registry, randomCast, slotArt, characterPatchOf
src/lib/agent-art.ts             15 images, 4 moods x 4 characters
src/lib/debate/presentation.ts   agentMood — the four states
src/lib/debate/types.ts          CharacterId, DebaterConfig.characterId
src/components/arena/ConfigPanel.tsx  Cast tab, selectCharacter, randomizeCast
src/components/arena/stage.tsx   AgentStage flip prop
src/assets/*.png                 fahad|khalid|rania|noura -{base,speaking,pleased,tense}
```

---

## 3. Asset pipeline — read before touching any PNG

All 15 are **405x786 RGBA**, transparent, bottom-anchored. Women are drawn at **92% height inside
an identical canvas**, not a shorter one: `AgentStage` renders `h-[46vh] w-auto object-contain`
anchored at `bottom-0`, so a shorter canvas is simply scaled back up and the height difference
vanishes. Transparent headroom is what makes them read as shorter.

Keying these is genuinely tricky. Three traps, all hit at least once:

1. **A white thobe meeting the canvas edge.** These are bust crops, so the garment is cut off at
   the bottom with no ink outline. A border flood fill walks straight in and eats the clothing.
   Seed only from the top and upper sides.
2. **A black abaya on an already-transparent source.** Same bug inverted — a stray opaque fringe
   reads as a "dark backdrop", then the fill walks through the black hijab. If a source is already
   keyed, leave its alpha alone entirely.
3. **Resizing RGBA directly.** LANCZOS pulls transparent black into the rim and rings it into a
   bright halo. Premultiply, resize, un-premultiply.

Facing: **Fahad and Rania face right** (`nativeSide: "left"`), **Khalid and Noura face left**
(`nativeSide: "right"`). `slotArt()` mirrors with `scale-x-[-1]` when a character occupies the
opposite slot. Safe because nothing else on the stage is directional — the spotlight beam is
centred and the lit glow has no offset.

---

## 4. The GB10 environment

### Services

| Port        | What               | Survives reboot?      |
| ----------- | ------------------ | --------------------- |
| 11434       | Ollama alpha       | yes — snap service    |
| 11435       | Ollama beta        | **no** — hand-started |
| 11436       | Ollama judge       | **no** — hand-started |
| 8100 / 8101 | Kokoro / MMS TTS   | yes                   |
| 5900        | x11vnc             | **no**                |
| 6080        | websockify → noVNC | **no**                |
| 8080        | dev server         | started per session   |

**Four processes are manual and unsupervised.** After any reboot, restart them or the demo is
down. Offered but not yet done: four systemd _user_ units with `Restart=always`, which need no
sudo.

```bash
# ollama beta + judge — note the cwd, see the gotcha below
cd /home/dellsa
OLLAMA_MODELS=/var/snap/ollama/common/models OLLAMA_HOST=127.0.0.1:11435 \
  setsid nohup /snap/ollama/current/bin/ollama serve > ~/.ollama-11435.log 2>&1 < /dev/null &
OLLAMA_MODELS=/var/snap/ollama/common/models OLLAMA_HOST=127.0.0.1:11436 \
  setsid nohup /snap/ollama/current/bin/ollama serve > ~/.ollama-11436.log 2>&1 < /dev/null &

# vnc chain
nohup x11vnc -display :1 -rfbauth ~/.vnc/passwd -forever -shared -rfbport 5900 > ~/.x11vnc.log 2>&1 &
setsid nohup websockify --web /usr/share/novnc/ 6080 localhost:5900 > ~/.websockify.log 2>&1 &
```

The judge's **first** call takes ~50s while the model loads. Fire a throwaway debate to warm it
before going on stage.

### The single biggest gotcha

The project was moved from `/home/dellsa/leap_2026/ai-debate-arena` to
`/home/dellsa/leap_2026/prod/ai-debate-arena`. **That one move broke three separate things**, all
with the same signature — a process holding a deleted working directory:

- Ollama on 11435/11436 → `llama-server process has terminated: error: cannot get current path`
- The Claude daemon's background workers → crash-looped, `working directory no longer exists`
- The Tailscale funnel → pointing at a port whose backend had died

Always start long-lived services from a **stable** cwd such as `/home/dellsa`, never a project
subdirectory.

### Remote access

- **Tailscale**: `100.69.107.10`, node `promaxgb10-6594`.
- **Funnel**: `https://promaxgb10-6594.tail2f2d7d.ts.net` → `127.0.0.1:6080` (noVNC). Note this is
  **public internet**, behind only a VNC password.
- `tailscale funnel status` reports only that the tunnel exists — it never probes the backend. "Funnel
  on" plus a broken page means the thing behind it is dead. Check `ss -ltn | grep 6080` first.

### Remote Control is currently broken

`~/.claude/daemon-auth-status.json` reads `{"status":"auth_required"}` since 2026-08-12 15:14, and
no daemon process is running. That is why nothing interactive reaches a second device — permission
dialogs render only on the GB10 and `ListAgents` returns "No reachable agents". Fix on the host:

```bash
claude auth              # clears auth_required (interactive login)
claude --remote-control  # then connect from the other device, same account
```

### Other environment facts

- **`bun` is not installed.** `AGENTS.md` and the verification skill are written in bun; translate
  everything to npm/npx. The `local-llm-fixtures` mock server is a bun script and cannot run — but
  the real backend is up, so it is not needed.
- **`npm run preview` is broken** (pre-existing, not this branch): vite preview wants
  `dist/server/server.js`, nitro emits `.output/server/index.mjs`. Use
  `node .output/server/index.mjs`, which serves on **:3000**.
- Downloads from Hugging Face run **unauthenticated** unless `HF_TOKEN` is set — 30GB took 46
  minutes at ~9 MB/s.
- **Playwright is a devDependency and works.** Chromium is installed. This is the reliable way to
  drive and screenshot the app; the in-app Browser pane often fails to composite frames, so
  `computer{action:"screenshot"}` times out.

---

## 5. Verification status

Full gate run at `6a98919`: typecheck 0, lint 0 errors (6 pre-existing `react-refresh` warnings),
prettier clean on `src/`, production build passes. Zero console errors across
{1440x900, 390x844} x {en, ar} x {`/`, `/arena`}, each direct-loaded and hard-refreshed. No
horizontal scroll. SSR proven by fetching raw HTML with JS disabled.

Smoke matrix: **all five rows pass**, including the two live rows — alpha, beta and judge all
reached in both languages, no simulation fallback, no console errors.

Cast behaviours verified in a real browser: preset applies · avatar stays put under edits · badge
appears · swap carries hand-tuning across · randomize 15 runs 0 duplicates · mutual exclusion holds.

### Known issues, none introduced by this branch

|     | Issue                                                                                 | Owner             |
| --- | ------------------------------------------------------------------------------------- | ----------------- |
| F1  | `npm run preview` 500s                                                                | `backend-runtime` |
| F3  | Health pills read "Online" for endpoints that answer `/api/tags` but cannot generate  | `config-surface`  |
| F5  | "Debate complete" precedes the TTS-gated transcript reveal finishing; cosmetic        | `debate-engine`   |
| F6  | Cast card thumbnails crop the tops of headdresses (`object-cover object-top`, `h-20`) | `design-system`   |

---

## 6. How the user wants to be worked with

Learned the expensive way in the session that produced this file. None of it is guessable from the
code.

- **Show, do not describe.** Send the actual file or screenshot. "The avatar renders correctly" is
  worthless; the image is not. Use `SendUserFile`, and say where the artefact is stored so it can be
  checked independently.
- **Verify before asserting.** Run the thing and quote real output. Several confident claims in that
  session were wrong — that a directory was missing, that a job had been killed, that a fix had
  worked — and each cost trust. If something has not been run, say so plainly.
- **Do not modify or delete anything without asking**, including files that look like scratch. Art
  assets were altered in place once without approval; even though the change was a genuine
  improvement, it was not the assistant's call. Show a before/after and let the user decide.
- **Do not scrap work without showing it first.** Intermediate results the user has not seen are
  not yours to discard.
- **Confirm a problem is real before fixing it**, and confirm the fix cannot break anything else.
  The user asks for this explicitly and it has caught mistakes.
- **State blockers immediately and once.** Images pasted into chat are not files on disk and cannot
  be processed; saying that on the first turn would have saved a great deal of time.
- Prefers concise output. Long explanations of what is about to happen are not wanted; results are.

## 7. Session of 2026-08-20 — stage legibility + the winner's brief

### Stage, for readability at a distance

`AI Debate Arena` replaces "Arena of Debate" (h1 and both `<title>` constants). "Pick a motion"
and "Awaiting the gavel" are gone. Scores, round label, topic pill, judge cards, topic rails and
the `ScoreBanner` are all substantially larger; `/arena` is unaffected because `ScoreBanner`,
`ScoreSide` and `LeanBar` gained a `compact` prop that route passes.

- **The lean bar** is `h-4 w-[32rem]` with a `size-9` knob. The knob travels inside a rail inset by
  its own radius (`inset-x-[18px]`), so at 0% and 100% it stops flush instead of hanging over.
- **The spotlight** now spans the stage: `AgentStage`'s wrapper is `absolute inset-y-0 flex
flex-col justify-end`, so the beam starts at the top of the section and the figure stays pinned
  to the bottom. Verified lit — see `spotlight-2.png` in that session's scratchpad.
- **`stage-vignette`** is a new `@utility` on `main`, not on the stage `<section>`. Confined to the
  section it terminated at that element's bounds and read as a visible rectangle. It sits at
  `z-index:1`; header and footer were given `relative z-20` to stay above it.

### Bubble type is sized from text length — do not add `sm:` uplifts

`BUBBLE_SIZES` in `stage.tsx` picks a type scale from `text.length`. A fixed size plus a height cap
clipped arguments mid-sentence, which reads as a bug on stage.

**The trap, hit once:** the first version used `text-4xl sm:text-5xl`. Every desktop is above the
`sm` breakpoint, so the uplift is not a bonus — it _is_ the size, and it put the top step a full
step over budget, spilling text through the footer. The ladder is single-class and tuned to the
real column (~750px wide, ~250px per bubble at 1440x900). Measured across 70 samples of a live
debate: worst overflow 3px.

`focusSide()` in `presentation.ts` is new: the current speaker, or whoever spoke last. Without it
the stage flattens between turns, which is most of the wall clock.

### The winner's brief (`src/lib/verdict/`, `VerdictBrief.tsx`, `/brief`)

Four persona HTML templates the user supplied, tokenised to `{{topic}}`, `{{winner}}`,
`{{next1..4}}`, `{{reason1..4}}`, `{{bar1..4}}`, `{{watch1..4}}`, `{{verdict}}`, `{{lang}}`,
`{{dir}}`. On a final verdict the _winning debater's own model_ fills the twelve prose slots.

**Accuracy is the whole design.** Every number on the page is real: the bars are the judge's
per-criterion scores for the winner, on that persona's four heaviest-weighted criteria, and the
criterion label is prepended to each reason so the bar cannot be misread as scoring the sentence.

The model is barred from stating any figure, and the bar is enforced three times, because the
prompt alone measurably does not hold — a live run produced "98.8% of users", "over one dollar
monthly", and "five point three times return", the last one spelling the number out to dodge a
digit ban. So: the prompt states it, `fabricatedFields()` sends offending lines back for one
corrective rewrite, and `tidy()` drops any field that still carries a figure in favour of the
template's own wording. `hasFabricatedNumber()` rejects digits/%/currency outright and spelled
numerals only when a unit follows within two words, so "one of the strongest" survives.

**Parsing is deliberately forgiving.** `extractJsonObjects` returns _every_ balanced `{…}` and the
first that validates wins; taking only the first lost whenever a model reasoned out loud with a
brace in it, which failed two of five live runs. Array lengths are normalised rather than
required — demanding exactly four bullets threw away eleven good fields over one missing one.

The QR code carries _data_, not the document: the rendered brief is ~7KB, far past QR capacity, so
`payload.ts` deflates the facts+fields (~1KB) into a base64url URL fragment and `/brief` re-runs
`renderBrief` on it. No server state, and a fragment never leaves the browser. Templates are in
`.prettierignore` — prettier restructures their markup and shifts the vh-based layout.

### Art

The white matte fringe is gone from all seven Noura/Rania files. Only the _colour_ of rim pixels
changed — alpha is byte-identical in all seven, verified — so no garment was reshaped. Script kept
at `dehalo.py` in that session's scratchpad.

## 8. Open issues found this session

|         | Issue                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Evidence |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **T1**  | **Both TTS containers die into a bad CUDA context** and stay "healthy" while every synthesis 500s (`CUDA error: unknown error` on `tts-en`, `operation not permitted` on `tts-ar`). The browser shows it as CORS — a red herring; the OPTIONS preflight does return `access-control-allow-origin: *`, the 500 path just skips the CORS middleware. It also kills the spotlight, since `effectiveStatus` gates "speaking" on TTS ids when `tts.enabled`. **Fix: `docker restart tts-en tts-ar`.** Cleared 2026-08-20 and verified — all four voices (am_adam/am_echo/af_sarah/af_kore) return 200 with distinct audio, spotlight lights again. Expect recurrence; check this first if the voice is silent. |
| **T1b** | Arabic TTS removed entirely 2026-08-20 (user call): `endpointAr` dropped from `TtsSettings`/presets/`useSpeech`/ConfigPanel, `tts-ar` deleted from `docker-compose.yml`, container stopped and removed. `docker/tts-ar/` is left on disk to make it reversible. Note the old Arabic path passed `voice: undefined`, so both debaters shared one narrator; Arabic now uses each character's own Kokoro voice.                                                                                                                                                                                                                                                                                              |
| **T1c** | The TTS endpoint Test used to ping `/health` and render "0 models installed" — the count came from an empty `models` array meant for Ollama. Worse, `/health` stayed green right through the CUDA outage. It now POSTs a real synthesis and reports the audio size.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **T2**  | The `<think>` leak is worse than F5 suggested. `splitReasoning` matches the literal `<think>`/`</think>` pair only; models emit `[Thinking: …]` prose and unterminated `<think>…>`, both of which reach the stage, the TTS queue and the judge transcript (`m.content` feeds all three). Left unfixed — flagged to the user, not yet actioned.                                                                                                                                                                                                                                                                                                                                                            |
| **T3**  | At 390px the two figures overlap in the middle of the stage. Pre-existing (each is ~200px wide at `h-[46vh]`), not introduced here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## 9. What's next

Visual improvement, under an explicit constraint from the user: **no component changes, no hooks
added or removed.** That leaves `src/styles.css` tokens and `@utility` classes, Tailwind classes on
existing markup, and the stage treatment (spotlight, `lit`/`dim` filters, framing). It rules out new
components, restructured JSX, and any change to `useDebate` / `useSpeech` / `useDebateRuntime`
wiring.

One open design question: the arena has only **two** character colours — `--pro` and `--con` are
side tokens, not per-character — so Fahad and Rania both render in the same blue. Per-character
accents would need new registered oklch tokens in `styles.css` (see the `design-tokens` skill:
oklch only, must be registered). No component changes, so it fits the constraint, but it is the
user's call.

Also outstanding:

- **`personas` and `main` have diverged.** `personas` is 21 commits ahead, but `main` carries one
  commit `personas` lacks: `57af7f7 fix: update AGENTS.md to remove lovable dependencies`. That
  touches the very file holding the invariants this work follows. Merge `origin/main` into
  `personas` sooner rather than later — it is one file now and will not stay that way. Worth
  confirming with the user whether removing the Lovable dependency also retires the
  never-force-push rule, which is currently treated as binding.
- Decide on systemd user units for the four unsupervised services (section 4).
- `handoff.md` itself is untracked. A session on this box reads it fine; a **cloud** session clones
  from GitHub and will not see it until it is committed and pushed.
- Nothing auto-loads this file. Only `CLAUDE.md` and the `AGENTS.md` it imports enter context on
  their own. Either tell the session "read handoff.md first", or add a pointer line to `CLAUDE.md`.
