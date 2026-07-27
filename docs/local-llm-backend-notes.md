# Wiring a client-side app to real local LLMs: notes from this session

This document walks through how `ai-debate-arena` went from "frontend only,
always in simulation mode" to a working three-container local-inference
backend, and — more usefully — *why* each decision was made and what broke
along the way. It's meant to be readable by someone who hasn't done this
before: containerizing local LLMs, matching a frontend's expected API shape,
and debugging model behavior that only shows up under real, multi-turn load.

## 1. Read the contract before building anything

The instinct when asked to "build a backend" is to start designing services.
But this app already had a fully-specified backend contract, just unimplemented:

- `src/lib/debate/ollamaClient.ts` — POSTs `{model, messages, stream: true,
  options: {temperature, top_p}}` to a configurable endpoint, and parses the
  response as NDJSON, tolerating both Ollama's shape (`message.content`,
  `done`, `eval_count`) and OpenAI-style SSE deltas.
- `GET {origin}/api/tags` — used for health checks and listing installed
  models (Ollama-specific, not OpenAI-compatible).
- Three independent slots — Debater Alpha, Debater Beta, Judge — each with
  its own endpoint + model, exactly matching "one microservice per model."

**Lesson:** before designing a backend for an existing frontend, grep for
how it already calls out to a server. Here it saved an entire layer of
translation code — the frontend was built to talk to Ollama natively, so the
job became "stand up real Ollama instances," not "build an adapter."

## 2. Validate the riskiest assumption first, cheaply

The biggest unknown wasn't architecture — it was hardware. This machine is
an NVIDIA GB10 (DGX Spark, Blackwell, compute capability `sm_121`), a very
new chip. The existing local vLLM setups on this box (`~/gemma-gb10`,
`~/nemotron3-nano-gb10`) needed custom `cu130`-tagged images to work at all,
which suggested stock container images might not support this GPU.

Instead of assuming and building around it, a 2-minute test settled it:

```bash
docker run --rm --gpus all -v ollama_test:/root/.ollama -p 11499:11434 \
  --name ollama_gputest -d ollama/ollama:latest
docker logs ollama_gputest
```

The logs showed the *first* CUDA library directory (`cuda_v12`) explicitly
skipping the device ("compute capability not in compiled architectures"),
then a *second* one (`cuda_v13`) picking it up successfully. Stock
`ollama/ollama:latest` ships multiple CUDA backends and already supported
this chip — no custom build needed.

**Lesson:** when a plan hinges on "will X even work on this hardware,"
spend five minutes running the smallest possible version of X before
designing three services around an assumption. It's cheaper to fail fast on
a throwaway container than to discover a hardware incompatibility after
writing five docker-compose services around vLLM.

## 3. Match the serving engine to what you already have on disk

The workstation had real GGUF model files already downloaded (via LM Studio
and manual pulls), but no running inference server. Two options:

- **vLLM**, like the existing `gemma-gb10`/`nemotron3-nano-gb10` setups —
  but those pull full model weights from Hugging Face at container start,
  which would mean re-downloading models that already exist locally as GGUF.
- **Ollama** — imports a local GGUF file directly via
  `ollama create <name> -f Modelfile` with `FROM /path/to/model.gguf`, and
  happens to speak the *exact* protocol the frontend already expects.

Given the constraint "these three models are already downloaded," Ollama
was the only option that didn't throw away that constraint. This is a case
where the "obvious" choice (reuse the pattern already in the repo/homedir)
was wrong for this specific situation — the existing vLLM configs solved a
different problem (serving HF-hosted models) than the one at hand (serving
already-local GGUF files).

## 4. Architecture: one container per model, no gateway needed

```
                 ┌─────────────────────────┐
   browser  ───▶ │  ai-debate-arena (3000) │   (static SPA, no server calls)
                 └─────────────────────────┘
                       │        │        │
                       ▼        ▼        ▼
                 ollama-alpha  ollama-beta  ollama-judge
                  :11434        :11435       :11436
                 (Nemotron-30B) (Gemma-26B)  (Nemotron-4B)
```

Because the app is 100% client-side (the browser calls each endpoint
directly — `src/server.ts` is just an SSR error wrapper, not an API), there
was no need for a gateway/orchestrator container. Three Ollama containers
*are* the three microservices the app was designed to talk to. Adding a
gateway here would have been unrequested complexity — the frontend already
does the routing by having three independently-configurable slots.

Each container:
- Bind-mounts exactly one host GGUF file, read-only
- Runs a small custom entrypoint that imports the model into Ollama's blob
  store on first boot (idempotent — skips re-import if already present in
  the named volume) and fires a throwaway warm-up request so the model is
  GPU-resident before the first real user request
- Sets `OLLAMA_KEEP_ALIVE=-1` so the model never unloads mid-demo, and
  `OLLAMA_ORIGINS=*` so the browser's cross-origin fetch isn't blocked
- Requests the GPU via the same `deploy.resources.reservations.devices`
  block already used by the existing vLLM compose files on this box —
  reusing a known-working pattern rather than inventing a new one

Model-to-role assignment mattered for reasons beyond "pick three files":
the Judge re-scores after *every round* (per the app's README), so it
needed to be the fastest model, not the biggest. Alpha and Beta being
different model families (Nemotron vs. Gemma) also makes the debate a real
contest between two different models, not two instances of the same one.

## 5. The base image didn't have the tool the entrypoint assumed

First attempt at the entrypoint used `curl` to poll readiness and for the
Docker healthcheck. Containers started, logs showed the Ollama server
listening — but the entrypoint script never progressed past "waiting for
ollama server." `docker exec ... which curl` came back empty: the official
`ollama/ollama` image has no `curl` and no `wget`, only the `ollama` binary
itself.

Fix: use `ollama list` as the readiness probe (it's a real HTTP client
under the hood, hits the local server, and fails informatively if the
server isn't up yet) instead of assuming a shell utility exists.

**Lesson:** "wait for the server with curl" is a reflex — verify the base
image actually has curl before relying on it, especially with minimal
images built around a single Go binary.

## 6. A working pipeline can still produce a bad user-facing result

Once all three endpoints answered correctly (`/api/tags`, streaming
`/api/chat`), it was tempting to call it done. But this app's whole point
is a live-audience demo, so it got tested with an actual multi-round debate
in a real browser (see §7) — and round 1 revealed something curl testing
had missed: **Gemma's response leaked a giant unfiltered chain-of-thought
monologue directly into the visible debate text**, including things like
*"Wait! I need to check if there's any hidden text in the prompt..."*
appearing as the debater's live argument. Nemotron, tested identically,
stayed clean.

Root cause: the app's system prompt already asks the model to reason
inside literal `<think></think>` tags (a feature that predates Ollama
adding native `message.thinking` support for reasoning models). With both
mechanisms active at once — the model's own native reasoning mode *and*
the manual tag instruction — Gemma got confused under a real multi-turn
conversation and spilled its reasoning as plain, untagged content instead
of cleanly separating it either way.

The fix was to send `"think": false` in every request (`ollamaClient.ts`),
which forces all models to rely solely on the app's existing prompted-tag
mechanism instead of fighting between two overlapping reasoning systems.
Verified with isolated `curl` tests against both models before touching
the app code — same prompt, `think:false` added, clean output on both.

**Lesson:** an endpoint that responds correctly to a single test prompt can
still misbehave under the real conversational load your app produces
(longer history, adversarial framing, model-specific chat templates).
"It streams a 200 with content" and "it produces a good user experience"
are different bars — only the second one is what a demo actually needs.

## 7. Verifying a client-side app requires a browser, not just curl

Because all debate logic runs in the browser (health checks, streaming,
judge parsing), curl-testing the three Ollama endpoints proved the backend
worked, but not that the *app* worked — CORS, the Ollama-tag-based model
resolution, and the reasoning-tag parsing all only execute in a real page
context.

No project-specific browser-driving skill existed yet, and no headless
browser was preinstalled, so the verification path was: install
`playwright` + Chromium into a scratch directory (not the project), script
a real session — navigate, fill the topic, click Start Debate, poll for
the judge scorecard — and read back `document.body.innerText` plus
`console.error` events after each step. That caught the Gemma leak in §6,
which no amount of endpoint-level curl testing would have surfaced.

**Lesson:** for a feature that only exists in the browser (streaming
fetches, client-side parsing, CORS), "the API responds" is necessary but
not sufficient verification. Drive it the way a real user would, and
actually read the rendered output — don't just check for a 200 or an
absence of thrown exceptions.

## 8. A fix from the outside can hide inside the data, not the code

When debaters kept narrating themselves and each other by name ("Debater
Alpha counters...", "Beta says...") even after strengthening the system
prompt, more instructions only partly helped. The actual leak was
structural: `useDebate.ts` was handing the next speaker a line reading
`"Debater Beta قال: [content]"` — literally planting the opponent's name
into the conversation history fed back to the model. The model wasn't
ignoring instructions; it was faithfully continuing a pattern it had just
been shown in its own input.

Fix: stop naming the opponent in that history line at all
(`"Your opponent just said: ..."`) and add one explicit "never use a name
or label" instruction, so both models default to natural direct address
("you") instead of a name they were never supposed to fixate on.

**Lesson:** when a model does something odd *repeatedly and consistently
across models*, check what's actually in the prompt/history before assuming
it's ignoring instructions. Sometimes it's behaving exactly as trained — on
data you didn't realize you were sending it.

## 9. A working demo on your box may be unreachable from someone else's

The app is client-side by design — the browser calls every LLM/TTS endpoint
directly, no server hop. That means whichever machine has the browser open
needs a network path to *every* one of those ports, not just the one
serving the page.

This surfaced directly: `localhost:3000` loaded fine over the user's
SSH/VS Code tunnel, but the Ollama endpoints on `:11434`–`:11436` showed
"Unreachable." Nothing was wrong with the containers — `curl` from the box
itself worked, CORS headers were correct — the tunnel simply hadn't
forwarded the other ports. Same thing happened again later for the two new
TTS ports (`:8100`, `:8101`) the moment voice was added.

**Lesson:** for any app where the *browser*, not your server, makes the
calls, "it works when I test it here" only proves the box is fine. Whether
the actual user's browser can reach every port involved is a separate
question — and forgetting to forward a newly-introduced port is the default
failure mode over tunnels, not the exception.

## 10. Reuse what's already running elsewhere, but re-test the constraint each time

The workstation already had two other projects with working TTS: a
Kokoro-based English service and an MMS-TTS-ara (Arabic) FastAPI service.
Both were useful as *recipes*, but neither was reusable as-is — one was
wired into a Kafka/pub-sub framework specific to its own robot project, the
other's Dockerfile pulled in a multi-gigabyte vLLM base image just to get a
working CUDA+torch stack. Extracting the actual model-loading logic (a few
lines each) into fresh, minimal FastAPI services was faster and lighter
than adapting either original.

Per the earlier "test the assumption" lesson, GPU support was re-validated
from scratch rather than assumed to carry over: a plain
`pip install torch --index-url .../whl/cu130` in a throwaway container
confirmed CUDA worked before building anything around it. The first real
pass used CPU-only PyTorch to sidestep version-guessing, and measured
**~4 seconds** to synthesize one short sentence — for a multi-sentence
debate turn, an unacceptable delay stacked on top of LLM generation.
Switching to the same CUDA wheel already proven for the LLM containers
dropped that to well under a second per turn.

**Lesson:** "there's already a working example of this on the box" is a
great head start on *what to build*, not a license to skip validating *how
it should run here* — the constraints that made the original correct (its
framework, its base image, its hardware path) usually don't transfer as-is,
and "should be fast enough" deserves a real measurement, not a guess.

## 11. The same category of thing can need different browser plumbing

Ollama's CORS handling (`OLLAMA_ORIGINS=*`) is baked into the binary.
FastAPI has no equivalent by default — the new TTS services needed
`CORSMiddleware` added explicitly, or the browser would silently refuse
every `/synthesize` call. Easy to overlook precisely because the previous
three containers "just worked" without anyone touching CORS — the
assumption that "it's an HTTP API, CORS is a solved problem" quietly
stopped being true the moment the serving framework changed.

## 12. When a UI change makes text and voice race each other, decide who drives

Adding TTS on top of an app whose whole selling point is *live token
streaming* creates a structural conflict: the LLM finishes a turn in a few
seconds; naturally-paced speech to read that same turn aloud takes
30–50 seconds. Playing audio underneath text that's already fully visible
isn't "sync" no matter how fast the audio starts — the audience finishes
reading long before the voice finishes speaking.

Fixing that meant explicitly choosing which system paces the UI: fast LLM
generation, or slower voice playback. The user chose true sync to voice,
which required:
- Withholding a turn's text from the transcript entirely until its audio
  *actually starts playing* (not merely until the LLM finishes generating it).
- A word-based reveal (`revealFraction = audio.currentTime / audio.duration`,
  sliced on whole words, never mid-word) that grows the visible text in
  lockstep with the real `<audio>` element's playback position.
- Everything else — the round counter, the "Speaking"/"Thinking" status
  pills — *also* needed to switch from tracking raw generation progress to
  tracking the voice queue, once text-pacing changed. The first fix
  (transcript reveal) immediately exposed a second, sibling inconsistency
  (header showing "Round 3/4" while the transcript was still voicing round 1)
  that needed the identical treatment.

**Lesson:** when two async systems produce the same content at very
different speeds, "sync" is a decision about which one becomes the pacer,
not a small delay/adjustment — and that decision usually has more than one
place in the UI that needs to agree with it. Surface the trade-off
explicitly (the alternative — keep fast text, add a read-along highlight —
was a legitimate different choice) rather than quietly picking one.

## 13. A long wait can look exactly like a stuck queue

After wiring the pacing above, a verification script watched the audio
queue for 60–75 seconds, saw exactly one request fire, then nothing —
indistinguishable at a glance from a queue that died after its first item.
Before touching any code, the actual `<audio>` element's state was
inspected directly (`duration`, `currentTime`, `readyState`) in the same
browser session. That gave the real answer: the first turn's WAV blob was
~3.2 MB, and at 24 kHz/16-bit mono that's **~66 seconds** of legitimate
audio. The queue wasn't stuck — the test just hadn't waited long enough.
Re-running with a longer window showed clean, correctly-alternating
progression through several consecutive turns.

**Lesson:** before patching a suspected bug, get a direct measurement of
what's actually happening — here, the literal duration computed from the
blob's own byte size — rather than reasoning from an inconclusive symptom.
"Nothing happened" and "it takes longer than I waited" look identical from
the outside.

## Summary of what changed

| File | Change |
|---|---|
| `docker/ollama/Dockerfile`, `docker/ollama/entrypoint.sh` | Shared image that imports one bind-mounted GGUF into Ollama and warms it up |
| `docker/tts-en/`, `docker/tts-ar/` | New — minimal FastAPI wrappers around Kokoro (English, 2 voices) and MMS-TTS-ara (Arabic, 1 voice), both GPU-accelerated via stock PyTorch cu130 wheels |
| `docker-compose.yml` | `ollama-alpha/beta/judge` + `tts-en`/`tts-ar` services (GPU reservations, health checks, named volumes) |
| `.env` (gitignored) | Host paths to the three GGUF files — workstation-specific |
| `src/lib/debate/types.ts`, `presets.ts` | Per-debater `voice` field, `tts` settings block (endpoints + master enable), default model/endpoint wiring |
| `src/lib/debate/ollamaClient.ts` | Merge `message.thinking` into `<think>` tags for tolerant parsing; send `think:false` to avoid the Gemma reasoning-leak bug |
| `src/lib/debate/useDebate.ts` | Stop feeding debater names/labels into the opponent's turn history so debaters address each other as "you" |
| `src/lib/debate/tts.ts`, `useSpeech.ts` | New — TTS client and the sequential playback/reveal-sync queue (never overlaps Alpha/Beta, best-effort, drives transcript pacing) |
| `src/components/arena/ControlDesk.tsx` | "Generate Voice" ON/OFF toggle — fully gates whether any TTS request is made |
| `src/components/arena/ConversationStream.tsx` | Turns hidden until voiced, then revealed word-by-word in sync with `audio.currentTime` |
| `src/components/arena/SettingsPanel.tsx` | Per-debater voice picker, TTS endpoint config |
| `src/routes/index.tsx` | Wires `useSpeech` in; status pills and round counter derived from the voice queue instead of raw generation state |

## Takeaways that generalize beyond this project

1. **Read the existing contract before designing a new one.** Half of "build
   the backend" was already specified by how the frontend called out.
2. **Test the load-bearing assumption cheaply before committing to it.**
   One throwaway container settled a hardware-compatibility question that
   could otherwise have derailed the whole architecture — and the same
   five-minute check paid off again for GPU-accelerated TTS.
3. **"Already have the data locally" is a real constraint that should drive
   tool choice** (Ollama-imports-GGUF vs. vLLM-downloads-from-HF), not just
   an implementation detail to route around.
4. **A minimal base image may be missing tools you assume exist.** Check
   before scripting against `curl`/`wget`/etc.
5. **Multi-turn, realistic load finds bugs single-request testing can't.**
   Budget time to actually run the feature the way an end user would,
   especially for anything client-side or conversational.
6. **When a model repeats an odd pattern, audit what you fed it before
   blaming the model.** The fix is often in the data, not more instructions.
7. **A browser-driven app's reachability is a per-port, per-client question.**
   Your own successful test never proves someone else's browser can reach
   every endpoint involved — especially over tunnels.
8. **Syncing two systems that move at different speeds means picking a
   pacer, not adding a delay** — and checking for sibling UI elements that
   silently assumed the old pace.
9. **An inconclusive symptom ("nothing happened") isn't evidence of a bug**
   until you've measured what "happened" actually looks like from the inside.
