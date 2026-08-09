<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Agentic workflows

This repository ships a hub-and-spoke agent layer under `.claude/`. Start with the **hub** — it
routes work to the right specialist rather than doing it itself.

### Agents (`.claude/agents/`)

| Agent             | Owns                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `hub`             | routing and reconciliation; holds no domain knowledge                                                        |
| `design-system`   | `src/styles.css` tokens, `@utility` classes, fonts, assets, layout, responsive behaviour, reference fidelity |
| `debate-engine`   | `src/lib/debate/**` — state machine, streaming transport, judging, simulation, TTS                           |
| `config-surface`  | settings schema, persistence and migration, endpoint tests, the configuration UI                             |
| `a11y-rtl`        | landmarks, labels, keyboard, focus, contrast, reduced motion, Arabic `dir="rtl"`                             |
| `backend-runtime` | Docker services and ports, SSR entry, CORS, build output                                                     |
| `verification`    | read-mostly quality gate: format, lint, typecheck, build, smoke, screenshots                                 |

### Skills (`.claude/skills/`)

`reference-fidelity` (pinned reference SHA + structural checklists) · `design-tokens` (oklch rule,
token registration, `@utility` catalogue) · `debate-engine-contract` (hook API, SSR boundary) ·
`arabic-rtl` · `local-llm-fixtures` (deterministic fixtures + a GPU-free mock server) ·
`verification-protocol` (baseline, smoke matrix, pass criteria)

### Commands (`.claude/commands/`)

`/verify` · `/fidelity-check [route]` · `/engine-audit` · `/config-audit` · `/a11y-pass [route]` ·
`/backend-up [mock|docker]` · `/migrate-phase <n>`

### Running without a GPU

No default workflow requires one:

```bash
bun .claude/skills/local-llm-fixtures/scripts/mock-ollama.ts
```

This binds the same five ports as `docker-compose.yml` (11434, 11435, 11436, 8100, 8101) with
permissive CORS, so the app's default settings work untouched. Failure injection via `?fail=`,
`?judge=` and `?format=` query parameters — see that skill for the full matrix.

### Invariants

1. Never rewrite published git history (see the Lovable note above).
2. The tree must build after every phase.
3. Never replace real behaviour with mock data or a static control.
4. One debate state machine — `useDebate` is the only lifecycle owner.
5. Removal requires a reference search proving the target is unused. Deployment files, simulation
   scripts and local-model configuration are never "unused" merely because the UI does not render
   them.
