---
description: Run one phase of the frontend migration through the hub, ending with verification and a focused commit.
---

Execute migration phase **$ARGUMENTS** through the hub.

Dispatch the `hub` agent. It routes the phase's work to the owning spokes, in dependency order,
and reconciles their reports.

## The phases

| Phase | Goal                                                                                                                                                                   | Primary spoke                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 0     | Agentic workflow layer — hub, spokes, skills, commands                                                                                                                 | — (already landed)                |
| 1     | Baseline and migration specification — record lint/build state, screenshot inventory, feature-to-UI mapping, route map, asset map, token and dependency decisions      | `verification`                    |
| 2     | Reference design foundation — fonts, global styles, tokens, primitives, layout shell, assets; recreate the reference route including responsive and interactive states | `design-system`                   |
| 3     | Separate integrated arena page — build `/arena` from reference-native components against the existing `useDebate`/`useSpeech`                                          | `debate-engine` → `design-system` |
| 4     | Complete configuration integration — rebuild the whole config surface in the reference design                                                                          | `config-surface`                  |
| 5     | Cleanup and hardening — remove old-design components, CSS, tokens, assets and dependencies once proven unreferenced; update docs                                       | `design-system` → `verification`  |
| 6     | Verification and delivery — full gate, smoke matrix, screenshots, change summary                                                                                       | `verification`                    |

## Rules for every phase

- **Report the result before proceeding.** Phases are reviewable units, not a pipeline to run
  through.
- **The tree must build at the end of the phase.** Run `/verify` before committing.
- **Small, focused commits.** One phase, one commit, a message that says what changed and why.
- **Never rewrite published history.** No force-push, no rebase, no amend of pushed commits — this
  branch syncs to Lovable.
- **Never delete on suspicion.** Removal requires an import/reference search proving the target is
  unreferenced. Deployment files, simulation scripts, local-model configuration and error handling
  are never "unused" merely because the new design does not render them.
- **Never replace real behaviour with mock data or a static control.**

## Phase 5 has a specific procedure

Remove in small groups, running build and lint after each group, rather than one large deletion.
Then sweep for broken imports, duplicate primitives, unused packages, console errors, hydration
warnings, missing asset requests, horizontal overflow, and stale branding or meta tags.

Finish by stating what changed, what was verified with what output, what was deliberately left
alone, and what remains open for the next phase.
