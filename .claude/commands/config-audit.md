---
description: Verify every configuration setting persists, validates, and demonstrably changes a real request or runtime behaviour.
---

Audit the configuration surface.

Load the `debate-engine-contract` skill for the settings shape and `local-llm-fixtures` for
exercising endpoint tests without live services. Then dispatch the `config-surface` spoke.

For **every** control, establish three things and report them per setting:

1. **Effect** — trace it to the outgoing request or runtime behaviour. Verify in the HTTP monitor,
   not in the displayed value. A control that only changes what is shown on screen is a bug.
2. **Persistence** — change it, reload, confirm it survives. Then confirm a stored object that
   predates the setting still loads via the default merge, rather than throwing or blanking the
   form.
3. **Validation** — push it out of range and confirm a visible, accessible message rather than a
   bad request.

Cover the full surface: endpoints and endpoint tests, installed-model selection and manual model
entry, debater names, temperature, top-p, tone preset, thinking level, system prompts, rounds,
context window, execution mode, language, TTS enablement and endpoints, per-debater voices, judge
enablement, judge model and temperature, weights, scale, tie threshold, rules, persistence, and
reset-to-defaults.

The five endpoints must be individually distinguishable and individually testable:
Alpha 11434 · Beta 11435 · Judge 11436 · TTS-EN 8100 · TTS-AR 8101.

Exercise every status state at least once: pending, success, failure, empty model list, invalid
value, CORS rejection, unreachable runtime. Confirm each is conveyed in text and announced to
assistive technology, not by colour alone.

Finally, confirm that changing a setting mid-debate does not corrupt the running debate.

Report a table: setting → effect verified where → persists → validation → status.
