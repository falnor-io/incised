# Changelog

## 0.1.0

First release.

- 26 components: workflow views, record views and data-driven explorers (trace, diff, flow, grid, control chart, Sankey, approval queue, deadline Gantt, activity heatmap).
- `orlune/verify`: offline verification of a signed, hash-chained record, plus exact-interval statistics.
- `orlune/openui`: an OpenUI Lang binding that keeps verification state out of model output. Nine explorers can be placed by source id through `SourcesProvider`; the model never supplies their data.
- A shadcn registry (31 items) that installs the components as source.
