---
name: design-tokens
description: The design token system for ai-debate-arena — Tailwind v4 CSS-first configuration, the oklch-only colour rule, how to register a new semantic colour, the @utility catalogue, and the removed Dell-era tokens that must not return. Load before editing src/styles.css or adding any colour, font, radius, or animation.
---

# Design tokens

All styling configuration lives in **`src/styles.css`**. There is no `tailwind.config.js` and there
must not be one — this project uses Tailwind v4's CSS-first configuration.

The file opens with:

```css
@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));
```

## Rule 1 — every colour is oklch

No hex, no `rgb()`, no `hsl()` in `src/styles.css`. oklch keeps lightness perceptually uniform, so
`/opacity` modifiers and lightness tweaks behave predictably across hues.

```css
/* wrong */
--primary: #3b82f6;
/* right */
--primary: oklch(0.62 0.15 245);
```

## Rule 2 — register before you use

A new semantic colour is a **three-step** change. Skipping step 2 means the Tailwind class silently
does not exist.

1. Define the raw value on `:root`:
   ```css
   :root {
     --warning: oklch(0.78 0.14 85);
   }
   ```
2. Register it in an `@theme inline` block as `--color-<name>`:
   ```css
   @theme inline {
     --color-warning: var(--warning);
   }
   ```
3. Only now use `text-warning`, `bg-warning/20`, `border-warning`.

## The palette

`:root` **is** the dark theme — the app never applies the `.dark` class. The `.dark` block in the
file is stock shadcn slate and is vestigial; do not build against it.

| Token                  | Value                                    | Role                                                    |
| ---------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `--background`         | `oklch(0.19 0.052 256)`                  | deep blue canvas — visibly blue, not near-black         |
| `--foreground`         | `oklch(0.96 0.006 250)`                  | near-white text                                         |
| `--card` / `--popover` | `oklch(0.22 0.036 254)`                  | raised surfaces                                         |
| `--primary`            | `oklch(0.62 0.15 245)`                   | the single accent — buttons, active borders, pips       |
| `--secondary`          | `oklch(0.28 0.03 253)`                   |                                                         |
| `--muted`              | `oklch(0.26 0.025 253)`                  |                                                         |
| `--muted-foreground`   | `oklch(0.72 0.02 250)`                   | micro-labels                                            |
| `--accent`             | `oklch(0.32 0.045 245)`                  |                                                         |
| `--destructive`        | `oklch(0.6 0.19 27)`                     |                                                         |
| `--border`             | `oklch(0.32 0.028 252)`                  |                                                         |
| `--input`              | `oklch(0.3 0.028 252)`                   |                                                         |
| `--ring`               | `oklch(0.7 0.12 240)`                    | focus ring                                              |
| `--pro`                | `oklch(0.76 0.11 235)`                   | the PRO / alpha side — lighter cyan-blue, reads "lit"   |
| `--con`                | `oklch(0.72 0.022 250)`                  | the CON / beta side — near-neutral, reads "cool"        |
| `--arena-glow`         | `0 0 50px oklch(0.62 0.15 245 / 0.12)`   | panel outer glow                                        |
| `--radius`             | `0.5rem`                                 | base; `--radius-sm/md/lg/xl/2xl/3xl/4xl` derive from it |
| `--font-display`       | `"Space Grotesk", system-ui, sans-serif` | headings, numbers, micro-labels                         |
| `--font-body`          | `"DM Sans", system-ui, sans-serif`       | body copy                                               |

There is **one accent hue family** (blue ≈245°). PRO and CON are distinguished by lightness and
chroma, not by opposing hues. Resist the urge to make CON red or orange — the design reads as a
broadcast studio, not a scoreboard.

## Fonts

Space Grotesk (500, 700) and DM Sans (400, 500, 700), loaded from Google Fonts via `preconnect` +
stylesheet `<link>` in `src/routes/__root.tsx`'s `head()`. Not self-hosted.

`@layer base` sets `body { font-family: var(--font-body) }` and
`h1,h2,h3 { font-family: var(--font-display); letter-spacing: -0.02em }`.

## The body glow

Fixed, two-layer, and load-bearing for the whole mood:

```css
background-image:
  radial-gradient(ellipse 80% 50% at 50% -10%, oklch(0.62 0.15 245 / 0.22), transparent),
  radial-gradient(ellipse 60% 40% at 10% 100%, oklch(0.76 0.11 235 / 0.08), transparent);
background-attachment: fixed;
```

## `@utility` catalogue

| Utility                                                 | What it does                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arena-panel`                                           | the standard raised card: `linear-gradient(160deg, oklch(0.235 0.036 254), oklch(0.195 0.032 253))`, 1px border, `box-shadow: var(--arena-glow)`                                                                                                                                |
| `gold-text`                                             | the title gradient — despite the name it is icy blue, `oklch(0.93 0.05 235) → oklch(0.66 0.15 245)`, background-clip:text                                                                                                                                                       |
| `topic-marquee` / `topic-marquee-rev`                   | opposed infinite rails, `translateX(0 → -50%)` over 42s / 46s linear                                                                                                                                                                                                            |
| `bubble-pop`                                            | 0.35s ease-out entrance from `opacity 0, translateY(8px) scale(0.96)`                                                                                                                                                                                                           |
| `spotlight-beam`                                        | the blurred stage cone: vertical gradient holding brightness to the floor, `clip-path: polygon(42% 0%, 58% 0%, 100% 100%, 0% 100%)`, `beam-flicker` 3.2s, `filter: blur(2px)`; on `/` the beam element overshoots the section top by 50vh so it starts at the top of the screen |
| `stage-floor`                                           | radial floor wash under the characters                                                                                                                                                                                                                                          |
| `stage-backdrop`                                        | static set dressing behind `/`: a fine 76px grid + floor wash on `::before`, masked to fade upward; alphas ≤ 0.13                                                                                                                                                               |
| `cloud-bubble` + `cloud-tail-left` / `cloud-tail-right` | white cartoon speech cloud, `border-radius: 2.25rem`, dark text, drop shadow; the tail is a clipped `::before`                                                                                                                                                                  |
| `topic-ring` / `topic-ring-rev`                         | 3D `rotateY` carousel, 34s / 40s                                                                                                                                                                                                                                                |
| `arena-scroll`                                          | thin custom scrollbar for panels that scroll                                                                                                                                                                                                                                    |

## The typographic motif

Tiny uppercase labels are the "broadcast graphics" signature and appear everywhere:

```
font-display text-[10px] tracking-[0.3em] uppercase text-muted-foreground
```

10px with `tracking-[0.3em]` for stat labels, 11px with `tracking-[0.25em]` for section kickers.
Numbers are `font-display text-2xl font-bold`.

## Removed — must not return

The previous "Dell / Vision 2030" identity is gone. Do not reintroduce:

- Tokens: `--color-alpha`, `--color-alpha-soft`, `--color-beta`, `--color-beta-soft`,
  `--color-steel`, `--color-terminal`, and the Saudi-green accent.
- Utilities: `arena-ring`, `arena-flicker`, `arena-rise`, `arena-shake`, `arena-spin-slow`,
  `arena-flag-rule`, `arena-geo`.
- The arabesque lattice / tech-grid body background.
- `--font-mono: "JetBrains Mono"` as a design font. Monospace is fine for the HTTP monitor payload
  view; it is not part of the identity.

`arena-scroll` and `arena-panel` are the only names that survived, and `arena-panel`'s definition
was replaced wholesale.

## Before you finish

- `rg -n 'oklch|#[0-9a-fA-F]{3,8}|rgb\(|hsl\(' src/styles.css` — confirm only oklch matches.
- `rg -n 'color-alpha|color-beta|color-steel|color-terminal|arena-ring|arena-geo|arena-flag-rule'
src/` — must be empty.
- Check the page at 1440×900 and 390×844 for horizontal body overflow.
