---
name: reference-fidelity
description: How to compare this app against the pinned lovable-backup reference design at SHA 0c8646ef7ba2294d770cb74f1be809bf6acf5119 — fetching it, the per-route structural checklist, the visual language spec, and the documented intentional deviations. Load for any task about visual fidelity, route appearance, or screenshot comparison.
---

# Reference fidelity

The visual design of this application is imported from
**`https://github.com/Leen-ekrish/lovable-backup`** at commit
**`0c8646ef7ba2294d770cb74f1be809bf6acf5119`**.

That SHA is what makes "matches the reference" a checkable claim. Always compare against the pinned
commit, never against the current tip of that repository.

## Fetching it

```bash
git clone https://github.com/Leen-ekrish/lovable-backup.git /tmp/ref
git -C /tmp/ref checkout 0c8646ef7ba2294d770cb74f1be809bf6acf5119
git -C /tmp/ref rev-parse HEAD   # must print 0c8646ef7ba2294d770cb74f1be809bf6acf5119
```

Both projects are the same stack — TanStack Start, React 19, Tailwind v4 CSS-first, shadcn/ui
new-york, bun — so reference code is usually portable with minimal edits. See
`references/reference-inventory.md` for the full component, token and asset inventory.

## The visual language, in one paragraph

A deep desaturated navy canvas (`oklch(0.17 0.035 252)`) under a fixed cyan-blue radial glow from
top-centre and a fainter one from bottom-left. Panels are slightly lighter navy gradients with a
50px blue outer glow. **One accent hue family only** (blue ≈245°): PRO is a lighter cyan-blue, CON
a near-neutral grey-blue, so PRO reads "lit" and CON reads "cool". Space Grotesk bold with tight
`-0.02em` tracking for headings, numbers and labels; DM Sans for body. Tiny 10–11px uppercase
labels at 0.25–0.3em letter-spacing are the recurring "broadcast graphics" motif. Radii: 0.5rem
base, `rounded-xl` panels, `rounded-lg` pills, 2.25rem speech clouds. Spacing is compact. Motion:
42s/46s opposed marquees that pause on hover, 0.35s bubble pop-in, 700ms character crossfades,
700ms eased lean indicator, 3.2s flickering blurred spotlight cones.

## Route `/` — structural checklist

The reference is a locked three-band viewport:
`<main className="flex h-screen flex-col overflow-hidden px-4 py-3">`.

**Header (`shrink-0 text-center`)**

- `gold-text text-4xl font-bold sm:text-5xl` title — hidden once the debate starts.
- Selected motion pill: `font-display rounded-lg border border-primary/50 bg-primary/10 px-6 py-2
text-xl font-semibold text-primary sm:text-2xl`, with a ghost `RotateCcw` "New" button.
- Once started, the scoreboard: `arena-panel mx-auto mt-2 flex max-w-4xl items-center
justify-between rounded-xl px-5 py-2` — `ScoreSide` PRO left (`text-pro`), CON right
  (`text-con`); centre shows `Round n / N · {persona} judging` as a 10px uppercase
  `tracking-[0.25em]` muted line, then round pips (`h-1.5 w-10 rounded-full`, `bg-primary` when
  complete else `bg-muted`), then the `LeanBar`.

**Stage (`relative min-h-0 flex-1`)**

- Two `AgentStage` characters absolutely pinned bottom-left / bottom-right, `h-[46vh] sm:h-[60vh]`,
  `object-contain`, `pointer-events-none`.
- Spotlight cone above each: `-top-6 left-1/2 h-[105%] w-[240px] -translate-x-1/2 sm:w-[320px]`,
  opacity 0 → 100 over 700ms when lit.
- Character filters: lit → `brightness-125 drop-shadow-[0_0_45px_oklch(0.7_0.13_240/0.6)]`;
  dimmed (other side speaking) → `opacity-60 brightness-50`; idle → `brightness-90`.
- Centre column `relative z-10 mx-auto flex h-full w-full max-w-[46%] flex-col justify-center
gap-4` holds the clouds — PRO `self-start` with left tail, CON `self-end` with right tail,
  active `scale-100 opacity-100`, inactive `scale-95 opacity-45`, 500ms transition.
- Fallbacks: a `Loader2 animate-spin` + status line while busy; otherwise an 11px uppercase
  `tracking-[0.3em]` hint.

**Footer (`shrink-0`)** — mode dependent:

- No topic → two stacked `TopicRail` marquees, the second reversed. Pills:
  `rounded-lg border border-border bg-background/60 px-5 py-2.5 text-sm backdrop-blur`, hover
  `border-primary bg-primary/15 text-primary`. The rail duplicates its array and pauses on hover
  via `group-hover:[animation-play-state:paused]`.
- Topic but no verdict → persona grid `grid grid-cols-2 gap-2 sm:grid-cols-4`; active card
  `border-primary bg-primary/10 shadow-[0_0_24px_-6px_var(--primary)]`, inactive
  `border-border bg-background/40 hover:border-primary/50`; title `font-display text-lg font-bold
text-primary` over a 10px muted "weights {criterion}" line. Then the `Gavel` "Begin the debate"
  button.
- Verdict → `arena-panel` bar with a `{persona} · {doc}` kicker, the winner sentence, and a
  `Download` PDF button.

## Intentional deviations from the reference

Each of these is a deliberate, documented departure. Do not "fix" them back.

| Deviation                                                                                                                                                                       | Why                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` is driven by `useDebate`/`useSpeech` (local Ollama + simulation) instead of the reference's `debateRound`/`debateVerdict` server functions calling `ai.gateway.lovable.dev` | The reference engine needs `LOVABLE_API_KEY` and outbound internet, which breaks this repo's offline local-LLM Docker contract. The user chose the local engine explicitly. |
| Round pips count `settings.rounds` rather than a hardcoded 3                                                                                                                    | Round count is user-configurable here.                                                                                                                                      |
| Speaking turns are driven by real streaming and TTS completion, not fixed `SPEAK_MS = 6500` sleeps                                                                              | Real generation has variable duration; faking it would desynchronise the voice reveal.                                                                                      |
| Personas are a weight-preset + presentation layer over the existing `judge.ts`; the reference's `weightedTotal` is dropped                                                      | `judge.ts` is the scoring authority and already implements weighted totals, scale and tie rules. Two scorers would disagree.                                                |
| The reference's unlinked `/copy-1` route is not ported                                                                                                                          | Dead route, superseded by `/`, nothing links to it.                                                                                                                         |
| A visible navigation link to `/arena` is added to the header                                                                                                                    | The reference has no navigation at all; the arena must be discoverable per the brief.                                                                                       |
| `/arena` scrolls instead of locking to `h-screen`                                                                                                                               | The instrumented experience (transcript, scorecard, telemetry, HTTP monitor) cannot fit a locked viewport. It uses the same design language throughout.                     |
| `prefers-reduced-motion` stands down the marquees, spotlight flicker and crossfades                                                                                             | Accessibility requirement; the reference does not handle it.                                                                                                                |
| `dir="rtl"` on Arabic content containers                                                                                                                                        | Bilingual requirement that the reference does not have.                                                                                                                     |

## Comparison procedure

1. Build and preview both apps.
2. Capture the same route at 1440×900 and 390×844 in each.
3. Compare in this order — **structure before pixels**: band layout → element presence and order →
   sizing/spacing → typography → colour → motion.
4. A difference is either a bug to fix or a deviation to add to the table above with a reason.
   There is no third category.

## Assets

Six 768×1024 PNGs in `src/assets/`: `pro-` and `con-` × `pleased` / `speaking` / `tense`. They are
Lovable-generated assets belonging to the user's own project — no third-party licence or
attribution applies. Keyed as `AGENT_ART[side][state]`.
