---
description: Accessibility and RTL sweep of a route — landmarks, labels, keyboard, focus, contrast, reduced motion, Arabic direction.
---

Run an accessibility and bilingual sweep of route `$ARGUMENTS` (default: all routes).

Load the `arabic-rtl` skill first, then dispatch the `a11y-rtl` spoke.

Work the checklist in the spoke definition, and actually perform the interactions rather than
reading the markup and inferring:

- **Structure** — one `<h1>`, no skipped heading levels, real landmarks, labelled regions.
- **Controls** — no `<div onClick>`; every input labelled; icon-only buttons named; sliders expose
  value/min/max.
- **Keyboard** — tab the whole route in order, operate every control, confirm focus stays visible.
  Open and close each sheet or dialog: focus must be trapped while open, restored to the trigger on
  close, and `Esc` must close.
- **Live regions** — streaming transcript, speaker status, connection status and judging progress
  announce politely. Turn boundaries, not every token.
- **Reduced motion** — with `prefers-reduced-motion: reduce`, the marquee rails, spotlight flicker,
  bubble pop and character crossfades all stand down.
- **Contrast** — check the 10–11px uppercase micro-labels specifically, measured over the panel
  gradient rather than the page background.
- **Arabic** — switch to Arabic and confirm `dir="rtl"` on speech clouds, transcript bodies,
  reasoning blocks and judge explanations; that the app chrome does **not** mirror; that PRO stays
  anchored left and CON right; and that the voice-synced reveal never splits a grapheme cluster.

Verify Arabic visually. A DOM inspection will not show a broken grapheme or a misplaced full stop.

Report each finding as: defect → fix applied → how it was confirmed. List anything deliberately
left alone with its reason and owning spoke, and state the keyboard walk you actually performed.
