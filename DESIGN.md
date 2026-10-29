---
name: Orlune
description: Components for agents that put it in writing.
colors:
  ink: "#16181d"
  paper: "#ffffff"
  muted-ink: "#5d6470"
  hairline: "#e3e5ea"
  slate-accent: "#1d232b"
  honored-green: "#1b7249"
  waiting-amber: "#8f4f00"
  breach-red: "#b3261e"
  series-blue: "#2563c7"
  series-ochre: "#a85a0a"
  series-green: "#1d7a56"
  series-violet: "#7a4cc2"
  series-rose: "#bf3557"
  series-teal: "#17788a"
  series-olive: "#7d6a0f"
  series-grey: "#5b6470"
  night-paper: "#0e1115"
  night-ink: "#ececec"
  night-muted: "#9aa1ab"
  night-hairline: "#2a3038"
  night-accent: "#e7b65c"
  night-green: "#5fcf94"
  night-amber: "#f0a85a"
  night-red: "#ff8a80"
  notebook-paper: "#f3e6b0"
  highlighter: "#e8b923"
  sticky-yellow: "#f7e27a"
  sticky-pink: "#f4b6c2"
  sticky-green: "#bfe3a8"
  sticky-blue: "#b6d2f2"
  sticky-ink: "#3b3320"
typography:
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
  lead:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  control:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.45
  micro:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.45
  stat:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.15
    fontFeature: "tnum"
  figure:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.2
    fontFeature: "tnum"
  hand:
    fontFamily: "Caveat, Bradley Hand, Segoe Print, Ink Free, Chalkboard SE, cursive"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.25
  record-id:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.92em"
    fontWeight: 400
rounded:
  xs: "2px"
  sm: "4px"
  note: "3px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
components:
  panel:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-approve:
    backgroundColor: "{colors.slate-accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-reject:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.breach-red}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  pill:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.muted-ink}"
    rounded: "{rounded.pill}"
    padding: "1px 9px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
---

# Design System: Orlune

## Overview

**Creative North Star: "The Auditor's Ledger"**

Orlune looks like a record you would trust: neutral surfaces, exact numbers, and a rule written next to every verdict. It disappears into the host app. Every surface inherits the host's shadcn tokens (`--background`, `--foreground`, `--muted-foreground`, `--border`, `--primary`) and falls back to the values below only when the host defines none. The brand shows in how verdicts and figures are presented, not in a signature colour or typeface.

Density is that of a working tool: 14px body, 12px labels, tabular figures, 8px gaps. Colour is reserved for state. A green, amber or red mark means a verifier or a rule said so, never decoration. Motion explains: it replays or reveals real steps, starts only when asked, and yields to reduced motion.

**Key Characteristics:**
- Inherits the host theme; light and dark follow the OS or `data-theme`.
- Flat and tonal: one hairline frame, tinted washes for groups, no shadows.
- Tabular, literal, system type. Numbers align and read exactly.
- State colour is semantic only (honored, waiting, breached).
- Nothing animates on first paint; every drawing has a text equivalent.

## Colors

A restrained neutral base with three state colours and an eight-hue series ramp for charts.

### Primary
- **Slate Accent** (#1d232b light, #e7b65c dark; inherits `--primary`): the one interactive accent. Approve buttons, focus rings, the playhead and selected marks. It follows the host's primary when one exists.

### Neutral
- **Paper** (#ffffff / #0e1115): panel background, inherits `--background`.
- **Ink** (#16181d / #ececec): text, inherits `--foreground`.
- **Muted Ink** (#5d6470 / #9aa1ab): labels, captions, secondary text.
- **Hairline** (#e3e5ea / #2a3038): the single 1px frame and input borders.
- **Ledger Wash**: `--ol-surface`, 4% of ink over paper, groups rows and fills pills and tracks.

### State
- **Honored Green** (#1b7249 / #5fcf94), **Waiting Amber** (#8f4f00 / #f0a85a), **Breach Red** (#b3261e / #ff8a80). Pills mix the colour at 12-14% into paper for the fill and use the full colour for text.

### Series
- Eight hues, `--ol-c1` to `--ol-c8`: blue, ochre, green, violet, rose, teal, olive, grey. Dark mode lifts each for contrast; `--ol-on-c` is the text colour on a series fill.

### Named Rules
**The Verdict-Only Colour Rule.** Green, amber and red appear only where a rule or verifier produced that state. No decorative use, and never for a value a model supplied.
**The Inherit-First Rule.** Define a colour as a fallback behind the host's variable, never instead of it.

## Typography

**Body, display and label font:** the system UI stack (`system-ui, -apple-system, 'Segoe UI', sans-serif`)
**Mono font:** `ui-monospace, SFMono-Regular, Menlo, monospace`, for hashes and record ids only.

**Character:** the host's own voice. One family, two weights (400 and 600), so the product reads as part of the page it sits in.

### Hierarchy
- **Lead** (600, 16px, 1.45): the one sentence that states a verdict.
- **Title** (600, 15px, 1.45): component heading.
- **Body** (400, 14px, 1.45): rows and explanations; summaries cap near 62ch.
- **Control** (600, 13px): button and toolbar labels.
- **Micro** (400, 11px): axis ticks, ruler labels, keyboard hints; muted ink.
- **Stat** (600, 22px, tabular): in-row figures such as budget used.
- **Label** (400, 12px): captions, units, secondary lines; muted ink.
- **Figure** (600, 26px, tabular): headline numbers such as those in `SealedRecord`.

### Named Rules
**The Tabular Rule.** Every number uses tabular figures so columns and counters never shift.
**The Record-Id Rule.** Only hashes and ids use monospace.

### The sketch surface

A second voice, used only where a model explains something. It is a notebook page: a warm paper wash (`notebook-paper` at 26% over the host background, 7% in dark mode), handwriting lettering (`hand`), pen strokes drawn twice with a small wobble, pastel fills for inputs (blue) and outputs (red), a yellow pointer that leads the narration, and sticky notes, pins, circles and tag callouts in `highlighter` and the four `sticky` colours. The look is the cue: **hand-drawn is the model's explanation; crisp and tabular is what the interface computed or a verifier checked.** A figure never appears in the hand-drawn voice.

**The Two Voices Rule.** Verdicts, figures and signatures are always in the ledger voice. The sketch voice carries only a model's explanation, and never a number a source did not give it.
**The Host-Font Rule.** The library names a handwriting stack but ships no font. A host that loads Caveat gets it; everyone else gets the system handwriting face, then cursive.

## Layout

Each component is a self-contained container (`container: ol / inline-size`) with 16px padding and answers to its own width, not the viewport; below 520px, side-by-side groups stack. Inside, rhythm runs on a 4, 6, 8, 10, 12px scale from fixed utility steps, so no note needs an inline margin. Heads are a flex row with a title left and one status pill right. Lists are unruled grids of rows.

## Elevation & Depth

Flat. A component is one hairline-framed panel on the host background; grouping inside it is a 4% tonal wash, never a nested card. State is shown by tone, opacity (steps ahead of a playhead dim to 38%) and outline, not by shadow. Focus is a 2px accent outline offset 2px.

### Named Rules
**The Flat-Frame Rule.** One hairline per component. No shadows at rest or on hover, and no card inside a card.

## Shapes

10px radius on the panel, 8px on buttons, inputs and bands, 4px on bars and slabs, 2px on tiny marks and swatches, full pills for status and the rounded flow-node kinds. Funnel bands are polygons that narrow into the next step, the only decorative geometry, and they carry data. No side-stripe accents: authorship and state use washes and glyphs.

## Components

### Buttons
- **Shape:** 8px radius, 13px 600 label, 8px 14px padding.
- **Default:** paper fill, hairline border; hover shifts to the ledger wash.
- **Approve:** accent fill, paper text. **Reject:** breach-red text and border on paper.
- **Focus / Disabled:** 2px accent outline; disabled is 42% opacity.

### Pills
- **Style:** ledger wash with muted text; tone variants mix state colour at 12-14% into paper. Fully round, 12.5px 500.

### Panels
- **Corner Style:** 10px. **Background:** host background. **Border:** 1px hairline. **Padding:** 16px. No shadow.

### Inputs / Fields
- **Style:** paper fill, 1px hairline, 8px radius, 4px 10px padding, 160px minimum width.
- **Focus:** 2px accent outline, offset 2px.

### Playback bar
- Back, Play, Next buttons and a range scrubber in the accent colour, with a `n / total` counter. Arrow keys step. Steps ahead dim; the current step carries `aria-current`.

### Verdict pill and record rows
- The status pill sits top right of every judgement. Ledger events show seq, type, signer and a mono hash; a broken link or bad signature turns the row red with the reason in words.

## Do's and Don'ts

### Do:
- **Do** read the host's shadcn variables first and use the `--ol-*` fallbacks only when they are absent.
- **Do** show the rule and the number behind every verdict, in a sentence.
- **Do** use tabular figures for every number and monospace only for ids and hashes.
- **Do** animate only to explain a real step, from the value on screen, and switch it off under `prefers-reduced-motion`.
- **Do** give every drawing a text equivalent and keyboard control.

### Don't:
- **Don't** nest a bordered card in a panel; group with a 4% wash.
- **Don't** use shadows, gradient text, glass or decorative colour.
- **Don't** mark state with a coloured side stripe on a row or card.
- **Don't** use bounce or elastic easing; use ease-out-quart (`cubic-bezier(.25, 1, .5, 1)`).
- **Don't** animate width or height; use transform and opacity.
- **Don't** colour a value green unless a verifier or rule decided it, and never render absent data as zero or a pass.
