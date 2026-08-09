---
description: Compare a route against the pinned lovable-backup reference design and report structural deltas.
---

Check visual fidelity of route `$ARGUMENTS` (default: all routes) against the pinned reference.

Load the `reference-fidelity` skill first — it holds the pinned SHA
`0c8646ef7ba2294d770cb74f1be809bf6acf5119`, the per-route structural checklist, the visual language
spec, and the table of intentional deviations. Load `design-tokens` too. Then dispatch the
`design-system` spoke.

Procedure:

1. Fetch or reuse the reference at the pinned SHA. Confirm `git rev-parse HEAD` matches before
   comparing anything.
2. Build and preview both apps.
3. Capture the route at **1440×900** and **390×844** in each.
4. Compare in order — **structure before pixels**: band layout → element presence and order →
   sizing and spacing → typography → colour → motion.
5. Classify every difference as either a bug to fix or a deviation to record. There is no third
   category. If it is a deviation, it goes into the deviations table in the skill with a written
   reason.

Report: side-by-side findings per viewport, the classification of each difference, and any fixes
applied. Check explicitly for horizontal body overflow and for the reference's hover, focus, active,
loading and empty states — not only the initial screen.
