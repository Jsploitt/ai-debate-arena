---
description: Run the full quality gate — format check, lint, typecheck, production build, preview smoke, console and network inspection.
---

Run the complete verification gate for this repository.

Load the `verification-protocol` skill first — it holds the recorded baseline, the exact command
sequence, the smoke matrix, and the pass criteria. Then dispatch the `verification` spoke.

Scope: $ARGUMENTS (if empty, verify everything).

Requirements:

- Run **every** command in the sequence, even after one fails, so a single report covers the whole
  gate.
- Compare each result against the recorded baseline. Distinguish new failures from pre-existing
  ones explicitly; never report a pre-existing failure as a regression.
- Quote real output. Do not report a check as passing that you did not run.
- Exercise the required smoke rows, not just the build.
- Inspect the production preview's console and network panel, not the dev server's.
- Finish with exactly one verdict: pass, pass-with-known-issues (itemised), or fail (with output).

Do not fix anything you find. Report it with enough precision that the owning spoke can, and name
that spoke.
