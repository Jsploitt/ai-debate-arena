# Reference inventory — `Leen-ekrish/lovable-backup` @ `0c8646ef7ba2294d770cb74f1be809bf6acf5119`

Captured during the migration discovery pass. Use this instead of re-cloning when you only need to
know what the reference contains.

## Stack

Identical to this repository: TanStack Start (SSR) + TanStack Router file-based routing, React
19.2, TypeScript 5.8, Vite 8, nitro 3 beta, Tailwind v4 CSS-first (**no `tailwind.config.js`**),
shadcn/ui new-york with `cssVariables: true` and lucide icons, bun (`bun.lock`, `bunfig.toml`),
`@lovable.dev/vite-tanstack-config` (2.9.1 there, 2.7.7 here).

`vite.config.ts` is an 8-line re-export of `defineConfig` from `@lovable.dev/vite-tanstack-config`
with `tanstackStart.server.entry = "server"`. Devtools, tanstackStart, viteReact, tailwindcss,
tsConfigPaths, nitro and the `@` alias are already bundled — never add them manually.

Notable dependency the target lacked: **`jspdf ^4.2.1`**.
Notable absence in both: no animation library, no test runner.

## Routes

| File                                | Path      | Contents                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/routes/__root.tsx` (132 lines) | —         | `createRootRouteWithContext<{queryClient}>`; shell renders html/head/body with `HeadContent` + `Scripts`; `RootComponent` wraps `Outlet` in `QueryClientProvider`. Head: title "Arena of Debate", OG/Twitter meta, Google Fonts preconnect + stylesheet, `../styles.css?url`, favicon. Inline 404 (`text-7xl` numeral + "Go home") and error component (`reportLovableError`, "Try again" invalidates the router). |
| `src/routes/index.tsx` (442 lines)  | `/`       | The entire `Arena`: topic → persona → 3 rounds → verdict PDF. All bespoke components are local functions in this file.                                                                                                                                                                                                                                                                                             |
| `src/routes/copy-1.tsx` (404 lines) | `/copy-1` | Earlier alternate arena — free-text `Input`, `Progress` bars, tabbed rounds (`tab: number \| "verdict"`), manual next-round/deliver buttons, `Swords`/`Quote` icons. No character art, no marquee, no auto-run. **Unlinked from anywhere.** Not ported.                                                                                                                                                            |

Also `src/router.tsx` (`getRouter()`, `scrollRestoration: true`, `defaultPreloadStaleTime: 0`),
`src/server.ts` (SSR fetch entry unwrapping h3-swallowed 500s), `src/start.ts` (`createStart` with
error middleware + `createCsrfMiddleware` filtered to `serverFn`). All equivalent to this repo's.

## Bespoke components (all local to `src/routes/index.tsx`)

| Component     | Signature                         | Role                                                                                                           |
| ------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Arena`       | —                                 | the page; state machine topic → persona → rounds → verdict                                                     |
| `TopicRail`   | `{topics, onPick, reverse?}`      | infinite horizontal marquee of topic pills; duplicates the array, pauses on hover                              |
| `CloudBubble` | `{side, active, text}`            | white cartoon speech cloud with a left/right tail                                                              |
| `LeanBar`     | `{pro, con}`                      | gradient track `from-pro/70 via-muted to-con/70` with a glowing dot animating `left` over 700ms, clamped 8–92% |
| `AgentStage`  | `{side, img, lit, dim, position}` | bottom-anchored character PNG with an overlaid spotlight beam                                                  |
| `ScoreSide`   | `{label, score, color, align?}`   | uppercase 10px `tracking-[0.3em]` label over a `text-2xl` bold score                                           |

Only shadcn primitives imported by `/`: `Button`, `Toaster` (sonner). `/copy-1` adds `Input`,
`Progress`.

`src/components/` contains **only** `src/components/ui/` — 45 stock, unmodified shadcn/ui new-york
primitives. No custom component directory exists. (This repo has the same 45 plus `sidebar`, i.e.
46.)

## Data layer — NOT ported

The reference's backend is replaced by this repository's local engine. Recorded for reference only:

- `src/lib/debate.functions.ts` — `debateRound`, `debateVerdict` as `createServerFn({method:"POST"})`
  with zod validators.
- `src/lib/debate.server.ts` — posts to `https://ai.gateway.lovable.dev/v1/chat/completions`, model
  `google/gemini-3.6-flash`, `response_format: json_object`, `Lovable-API-Key` header from
  `process.env.LOVABLE_API_KEY`. Maps 429 → "The arena is busy (rate limit)", 402 → "AI credits
  exhausted". `parseJson` strips code fences and slices to the outer braces. Prompts a 3-agent sim
  (PRO/CON ≤35 words, 0–10 on five criteria, judge `reaction` + `mood`).
- No database, no Supabase, no persistence — all state is `useState`, lost on reload. TanStack
  Query is provided but never used.

## Ported

- `src/lib/personas.ts` — `CRITERIA` (logic, evidence, rebuttal, persuasion, clarity), `PERSONAS`
  with per-persona weight maps, `PERSONA_LIST`, doc names and framings. **Ported as weight presets
  and presentation config only**; its `weightedTotal` is dropped in favour of `judge.ts`'s.

  | Persona | Focus      | Weights (logic / evidence / rebuttal / persuasion / clarity) | Document                         |
  | ------- | ---------- | ------------------------------------------------------------ | -------------------------------- |
  | CFO     | evidence   | 1 / 2.2 / 1 / 0.6 / 1.2                                      | Financial Impact Brief           |
  | CTO     | logic      | 2.2 / 1.2 / 1.1 / 0.5 / 1                                    | Technical Feasibility Memo       |
  | CMO     | persuasion | 0.8 / 0.8 / 1 / 2.4 / 1                                      | Campaign & Positioning Brief     |
  | CEO     | clarity    | 1.2 / 1.2 / 1.1 / 1.1 / 1.8                                  | Executive Summary Decision Brief |

  These five criteria map 1:1 onto the existing `JudgeCriterion` union
  (`Logic | Evidence | Rebuttal | Clarity | Persuasion`).

- `src/lib/pdf.ts` — client-side jsPDF letter-size brief. Dark header bar `rgb(24,22,20)`, gold
  accents `rgb(212,168,83)`, headings `rgb(176,132,46)`, 56pt margins, filename
  `${persona.title}-${doc-with-dashes}.pdf`. (Its rgb values are inside a generated PDF, not CSS,
  so the oklch-only rule does not apply.)

- `src/assets/` — six ~500KB 768×1024 PNGs: `pro-pleased`, `pro-speaking`, `pro-tense`,
  `con-pleased`, `con-speaking`, `con-tense`. Imported as ES modules into `AGENT_ART[side][state]`.

## Topic rails

Row 1: Replace sales with AI agents · Go fully remote, close offices · Open-source the core product
· Ban meetings over 15 minutes · Leave the public cloud · Four-day work week · Kill the free tier ·
Acquire our competitor · Freeze hiring, automate · Rebrand for a new market

Row 2: Pay everyone the same salary · Halve marketing, fund R&D · Launch in three countries · Make
all documents public · Scrap annual reviews · Build our own AI models · Sunset the oldest product ·
Usage-based pricing · Outsource all support · Go public in 18 months

## Public assets

`public/favicon.ico` (20KB) and `public/robots.txt` (160B). Nothing else — no og-image, no
placeholder.

## Known gaps in the reference

- Responsiveness is minimal and desktop-first: only `sm:` breakpoints (title size, character height
  46vh→60vh, spotlight 240→320px, persona grid 2→4 columns). The `h-screen overflow-hidden` shell
  and `max-w-[46%]` bubble column are not phone-friendly — the migration must improve on this.
- No `prefers-reduced-motion` handling.
- No RTL support.
- No accessibility affordances beyond what shadcn primitives provide by default.
- `.dark` block is stock shadcn slate and vestigial — `:root` is the real dark theme and `.dark` is
  never applied.
