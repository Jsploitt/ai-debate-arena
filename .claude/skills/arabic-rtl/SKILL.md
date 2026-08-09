---
name: arabic-rtl
description: Arabic and RTL correctness for ai-debate-arena — where dir="rtl" belongs, how language flows through the engine to the prompts and TTS, the interaction between text slicing and the voice-synced reveal, and how to test bilingual output. Load for any language, direction, or Arabic presentation task.
---

# Arabic and RTL

The app debates in English or Arabic. `settings.language` is `"en" | "ar"` and it is a **content**
setting, not a UI localisation setting: the interface chrome stays LTR English; the debate content
switches.

## How language flows

1. `settings.language` is set from a toggle and persisted with the rest of `ArenaSettings`.
2. `presets.ts` exposes `LANGUAGE_INSTRUCTION` and `LANGUAGE_LABEL`; `useDebate` appends the
   instruction to the system prompt so the model answers in the right language.
3. `simulation.ts:simulatedTurnText(topic, side, turn, language)` has a separate Arabic pool, so
   simulation mode is bilingual too.
4. `judge.ts:buildJudgeMessages(..., language)` and `simulateJudge(..., language)` produce verdicts
   and per-criterion explanations in the same language.
5. `useSpeech` routes Arabic to `settings.tts.endpointAr` (port 8101, MMS-TTS-ara, **no voice
   parameter**) and English to `endpointEn` (port 8100, Kokoro, with the per-debater
   `settings[side].voice`).
6. Sample topics come from `SAMPLE_TOPICS` or `SAMPLE_TOPICS_AR`.

A language change must reach all six. Changing only the prompt gives you Arabic text read aloud by
an English voice.

## Where `dir="rtl"` belongs

Set direction on the container of the **content**, driven by `settings.language`:

```tsx
<p dir={language === "ar" ? "rtl" : "ltr"}>{message.content}</p>
```

Required on:

- speech clouds on the stage;
- transcript message bodies on `/arena`;
- reasoning (`<think>`) blocks;
- judge verdict text and per-criterion explanations;
- the topic pill, when the topic is Arabic.

**Not** on: the app shell, navigation, transport buttons, configuration labels, telemetry, the HTTP
monitor. Flipping the whole document breaks the character stage's left/right semantics — PRO is
anchored left and CON right by design, and that must not mirror.

Prefer the `dir` attribute over `text-align`. `dir` fixes punctuation placement, numeral runs and
bidirectional embedding; `text-align: right` only moves the block and leaves mixed-content
sentences broken.

## Mixed content

Debate text routinely mixes Arabic prose with Latin model names, numbers and quoted English terms.
Correct `dir` on the container lets the Unicode bidi algorithm handle these. If a specific inline
run still renders wrong, wrap just that run — do not fight it with CSS.

## Text slicing and the voice-synced reveal

`useSpeech` exposes `revealFraction` (0–1) and views slice message text to that fraction so the
transcript reveals in time with the audio. Two hazards in Arabic:

1. **Never slice by raw UTF-16 index.** Arabic uses combining marks; a naive `slice` can split a
   grapheme cluster and render a stray mark. Slice on grapheme boundaries — use
   `Intl.Segmenter("ar", { granularity: "grapheme" })` where available, and fall back to word
   boundaries.
2. **Never reverse or reorder the string yourself.** Direction is a rendering concern; the string
   stays in logical order. Reversing it produces text that looks plausible and is nonsense.

The shared helper for this lives in `src/lib/debate/presentation.ts` (`revealedText`). Use it
rather than slicing inline.

## Fonts

Space Grotesk and DM Sans have no Arabic coverage, so Arabic falls through to the system stack.
That is acceptable and intentional — do not add a display font override that makes Arabic render in
a mismatched weight. If Arabic body text looks visually lighter than English at the same size,
adjust size/line-height for the Arabic branch rather than swapping families.

Arabic needs more line-height than Latin at the same size. `leading-relaxed` is the floor for
Arabic body copy.

## Export

The Markdown transcript export must preserve Arabic content unmodified and use UTF-8
(`text/markdown;charset=utf-8` — already the case). Do not strip or normalise Arabic characters
when building the export or the PDF.

## Testing

Run the full matrix — Arabic is not a variant of English, it is a second path:

| Check                                                   | English             | Arabic                                       |
| ------------------------------------------------------- | ------------------- | -------------------------------------------- |
| Simulated debate runs end to end                        | ✓                   | ✓                                            |
| Transcript direction correct                            | —                   | `dir="rtl"`, punctuation at the correct edge |
| Judge verdict + criterion reasons in the right language | ✓                   | ✓                                            |
| TTS hits the right endpoint                             | 8100 + voice        | 8101, no voice                               |
| Voice-synced reveal does not corrupt glyphs             | ✓                   | ✓ (watch combining marks)                    |
| Markdown export readable                                | ✓                   | ✓                                            |
| Character stage orientation unchanged                   | PRO left, CON right | **PRO left, CON right** — must not mirror    |

Verify Arabic visually. A DOM inspection will not show you a broken grapheme or misplaced full
stop.
