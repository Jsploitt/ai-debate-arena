---
description: Bring up the local model and TTS backend (Docker stack, or the GPU-free mock) and report health on all five ports.
---

Bring up the backend services and report their health.

Load the `local-llm-fixtures` skill. Dispatch the `backend-runtime` spoke.

Choose the stack based on `$ARGUMENTS` and what the machine can actually do:

- `mock` (default when no GPU is available) —
  `bun .claude/skills/local-llm-fixtures/scripts/mock-ollama.ts`. Binds the same five ports as
  compose, sends permissive CORS, and supports failure injection. No GPU required.
- `docker` — `docker compose up -d`. Requires NVIDIA GPUs and the GGUF paths in the environment
  (`NEMOTRON_30B_GGUF`, `GEMMA_26B_GGUF`, `NEMOTRON_4B_GGUF`). First start is slow: the healthcheck
  allows a 600s start period while models load.

Then verify and report each service:

| Service      | Port  | Check                          |
| ------------ | ----- | ------------------------------ |
| ollama-alpha | 11434 | `GET /api/tags` returns models |
| ollama-beta  | 11435 | `GET /api/tags` returns models |
| ollama-judge | 11436 | `GET /api/tags` returns models |
| tts-en       | 8100  | `GET /health`                  |
| tts-ar       | 8101  | `GET /health`                  |

Also confirm:

- CORS headers are present on a cross-origin request — `OLLAMA_ORIGINS=*` is load-bearing, and
  without it every debate fails with an opaque browser error.
- The model names the runtimes actually serve, so `resolveModelName` has something to reconcile
  against the configured names.

Report a table of service → port → status → served models, and state plainly which stack you
started. If you started the mock, say so explicitly — never let mock health be read as evidence
that the real services work.
