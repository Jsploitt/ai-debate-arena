---
name: local-llm-fixtures
description: Deterministic fixtures and a mock server for exercising the local-LLM paths without a GPU — Ollama NDJSON, OpenAI-style SSE, malformed and partial judge JSON, health and model-list failures, and TTS success/failure. Load whenever you need to test transport, parsing, judging, endpoint tests or TTS and the real services are not running.
---

# Local LLM fixtures

No default developer workflow may require a GPU. These fixtures and the mock server let you drive
every live code path — streaming, parsing, judging, health, model discovery, TTS — on any machine.

They are also the fixture base for the planned automated test suite, so keep them deterministic:
no randomness, no timestamps, no network.

## Files

````
.claude/skills/local-llm-fixtures/
├── SKILL.md
├── scripts/mock-ollama.ts        # bun server: alpha, beta, judge, tts-en, tts-ar
└── fixtures/
    ├── ollama-ndjson.txt         # happy-path Ollama chat stream
    ├── ollama-thinking.txt       # stream with message.thinking → <think> rewrapping
    ├── openai-sse.txt            # OpenAI-compatible data: stream, ends with [DONE]
    ├── stream-truncated.txt      # stream that stops mid-object (no done:true)
    ├── tags-ok.json              # /api/tags success
    ├── tags-empty.json           # /api/tags with zero models
    ├── judge-valid.json          # well-formed scorecard
    ├── judge-fenced.txt          # scorecard wrapped in ```json fences + prose
    ├── judge-partial.txt         # truncated mid-object (tests repair)
    ├── judge-malformed.txt       # trailing commas, single quotes, missing criterion
    └── brief-valid.json          # well-formed verdict-brief fields (next/reasons/watch/verdict)
````

The three broken judge fixtures use `.txt` deliberately: they are not valid JSON, and a `.json`
extension would make `prettier --check` fail on them.

## Running the mock server

```bash
bun .claude/skills/local-llm-fixtures/scripts/mock-ollama.ts
```

Binds the same ports as `docker-compose.yml`, so the app's default settings work untouched:

| Port  | Service      |
| ----- | ------------ |
| 11434 | ollama-alpha |
| 11435 | ollama-beta  |
| 11436 | ollama-judge |
| 8100  | tts-en       |
| 8101  | tts-ar       |

It sends permissive CORS headers, mirroring `OLLAMA_ORIGINS=*`, and answers `OPTIONS` preflight.

### Failure injection

Query parameters on any request, or the matching env var, force a failure mode:

| Mode               | Effect                                                      |
| ------------------ | ----------------------------------------------------------- |
| `?fail=health`     | `/api/tags` returns 500                                     |
| `?fail=empty`      | `/api/tags` returns `{"models":[]}`                         |
| `?fail=cors`       | omits CORS headers, reproducing a browser CORS block        |
| `?fail=truncate`   | stream cuts off mid-object                                  |
| `?fail=slow`       | 5s delay before first token, for TTFT and timeout behaviour |
| `?fail=tts`        | TTS returns 503                                             |
| `?judge=malformed` | judge returns `judge-malformed.json`                        |
| `?judge=partial`   | judge returns `judge-partial.json`                          |
| `?judge=fenced`    | judge returns `judge-fenced.json`                           |
| `?format=sse`      | responds with OpenAI SSE instead of Ollama NDJSON           |

Env equivalents: `MOCK_FAIL`, `MOCK_JUDGE`, `MOCK_FORMAT` apply to every request.

```bash
MOCK_FAIL=slow bun .claude/skills/local-llm-fixtures/scripts/mock-ollama.ts
```

## The two stream formats

`ollamaClient.ts:streamChat` must handle both. Any change to it gets tested against both.

**Ollama NDJSON** — one JSON object per line, no prefix:

```json
{"model":"m","message":{"role":"assistant","content":"Hello"},"done":false}
{"model":"m","done":true,"eval_count":128,"prompt_eval_count":64}
```

**OpenAI-compatible SSE** — `data: ` prefix, blank line between events, terminated by
`data: [DONE]`:

```
data: {"choices":[{"delta":{"content":"Hello"}}]}

data: [DONE]
```

Telemetry comes from `eval_count` (completion tokens) and `prompt_eval_count` (prompt tokens).
The OpenAI format carries no equivalent, so telemetry is partial there — that is expected, not a
bug.

### Thinking blocks

Ollama may return reasoning in `message.thinking` rather than inline. `streamChat` rewraps it as
`<think>…</think>` so `splitReasoning` can extract it uniformly. `ollama-thinking.txt` covers this.
Note the app sends `think: false` in the request body by default; the fixture exists because
servers do not always honour it.

## Judge parsing

`parseJudgeResponse` must survive real model output, which is frequently not clean JSON. The four
judge fixtures cover the failure taxonomy:

- `judge-valid` — the contract.
- `judge-fenced` — wrapped in ` ```json ` fences with prose before and after. Must strip and
  slice to the outer braces.
- `judge-partial` — truncated mid-object, as happens when a stream is cut. `runLiveJudge` emits
  partial scorecards roughly every 40 characters, so partial parsing is a normal path, not an
  error path.
- `judge-malformed` — trailing commas, single-quoted keys, a missing criterion. Must either repair
  or return `null` cleanly; it must never throw or produce `NaN` totals.

A missing criterion must not silently score 0 and hand the debate to the other side. Check what
`weightedTotal` does with an absent key.

## Verdict brief

The brief hits the winning _debater's_ endpoint with a JSON schema in the request's `format` field
(Ollama structured outputs). The mock recognises any chat request carrying `format` and answers
with `brief-valid.json`, so the brief renders with model-written fields end-to-end. `?judge=malformed`
(or `MOCK_JUDGE=malformed`) makes brief requests fall through to debate prose instead, which
exercises the brief's retry-then-template-fallback chain.

## TTS

- `tts-en` (8100) accepts `{text, voice}` and returns `audio/wav`.
- `tts-ar` (8101) accepts `{text}` only — passing a voice is a bug.

The mock returns a minimal valid WAV so `new Audio()` can load and fire `timeupdate`/`ended`,
which is what drives `revealFraction` and the queue. With `?fail=tts` it returns 503; the debate
must continue silently, since `useSpeech` swallows failures by design.

## Using fixtures directly

For unit-level work, read a fixture and feed it to the parser instead of running a server:

```ts
const body = await Bun.file(".claude/skills/local-llm-fixtures/fixtures/ollama-ndjson.txt").text();
const response = new Response(body, { headers: { "content-type": "application/x-ndjson" } });
```

## Rules

1. Fixtures are deterministic. No `Date.now()`, no randomness, no live network.
2. When you fix a transport or parsing bug, add the fixture that reproduces it before the fix.
3. Never make the mock more capable than the real service. If Ollama cannot do it, the mock must
   not either — a mock that is too generous hides real integration failures.
4. Live-service testing stays optional and clearly labelled. The default suite runs on a laptop.
