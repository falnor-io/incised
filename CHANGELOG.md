# Changelog

## 0.1.0

First release.

- 26 components: workflow views, record views and data-driven explorers (trace, diff, flow, grid, control chart, Sankey, approval queue, deadline Gantt, activity heatmap).
- `orlune/verify`: offline verification of a signed, hash-chained record, plus exact-interval statistics.
- `orlune/openui`: an OpenUI Lang binding that keeps verification state out of model output. Nine explorers can be placed by source id through `SourcesProvider`; the model never supplies their data.
- A shadcn registry (31 items) that installs the components as source.
- Works in Next.js App Router: every component that uses hooks or handlers carries `'use client'`. A lint rule enforces it and `npm run smoke:next` builds a server page against the packed package in CI.
- Accessibility: an axe-core test runs over the whole demo. Fixed grid row and header roles, the density toggle, unnamed progress bars and the Compare header; labelled groups no longer become page landmarks.
- `VerifyStatus` says plainly when a record was changed after signing, and does not present its guarantee count as trusted.
- `docs/COMPONENTS.md`: props for every component, generated from the types (`npm run docs`).
- Install straight from the repository with `shadcn add falnor-io/orlune/<item>`.
