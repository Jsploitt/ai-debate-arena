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

## Summary of what changed

| File | Change |
|---|---|
| `docker/ollama/Dockerfile`, `docker/ollama/entrypoint.sh` | New — shared image that imports one bind-mounted GGUF into Ollama and warms it up |
| `docker-compose.yml` | Added `ollama-alpha` / `ollama-beta` / `ollama-judge` services (GPU reservation, health check, named volumes) |
| `.env` (gitignored) | Host paths to the three GGUF files — workstation-specific |
| `src/lib/debate/presets.ts` | Default endpoints/models point at the three new containers instead of a single placeholder |
| `src/lib/debate/ollamaClient.ts` | Merge `message.thinking` into `<think>` tags for tolerant parsing; send `think:false` to avoid the Gemma reasoning-leak bug |

## Takeaways that generalize beyond this project

1. **Read the existing contract before designing a new one.** Half of "build
   the backend" was already specified by how the frontend called out.
2. **Test the load-bearing assumption cheaply before committing to it.**
   One throwaway container settled a hardware-compatibility question that
   could otherwise have derailed the whole architecture.
3. **"Already have the data locally" is a real constraint that should drive
   tool choice** (Ollama-imports-GGUF vs. vLLM-downloads-from-HF), not just
   an implementation detail to route around.
4. **A minimal base image may be missing tools you assume exist.** Check
   before scripting against `curl`/`wget`/etc.
5. **Multi-turn, realistic load finds bugs single-request testing can't.**
   Budget time to actually run the feature the way an end user would,
   especially for anything client-side or conversational.
