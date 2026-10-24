# References

What each advanced component was built against, and what was and was not taken. Screenshots of other products
are not committed (they are other people's designs). Links go to the live pages.

## Looked at directly

| Reference | What it showed | Where it went in incised |
| --- | --- | --- |
| [Datadog, Trace View](https://docs.datadoghq.com/tracing/trace_explorer/trace_view/) | Flame graph with a time ruler and an overview minimap, a legend with each service's share of execution time, tabs for Flame Graph / Span List / Waterfall, and a detail panel under the trace | `TraceExplorer`: the three views on one axis, the draggable minimap, the legend with shares, the detail panel |
| [speedscope](https://www.speedscope.app/) | Dense flame chart, overview strip with a movable window, labels that truncate with an ellipsis, colour by category | `TraceExplorer` flame view and minimap |
| [Jaeger UI, trace view settings](https://www.jaegertracing.io/docs/latest/frontend-ui/) | Critical path highlighting, timeline minimap, span tag ordering, JSON view | `TraceExplorer` critical path toggle, `JsonTree` |
| [GitHub, a commit diff](https://github.com/falnor-io/incised/commit/2536e21) | File tree with change counts, `@@` hunk headers, old and new line-number gutters, folded unchanged lines, `+N −N` with five squares | `DiffViewer` |
| [React Flow, layout examples](https://reactflow.dev/examples) | Dotted canvas, pan and zoom, handles on nodes, minimap and controls, edge labels, sub flows | `FlowCanvas` |
| [shadcn/ui, AI Elements](https://ui.shadcn.com/docs/components/trace) | The existing `Trace` component is a flat list of text lines with status and nesting, with no timing, tokens, cost or structured spans | The gap `TraceExplorer` fills: quantitative, structured spans. incised does not try to replace chat-style agent steps |
| [Kibo UI](https://www.kibo-ui.com) | Lists Gantt and Contribution Graph components (the page gives no detail) | The category for `DeadlineGantt` and `ActivityHeatmap`. Neither of those is a copy: incised adds deadlines, breach marks and computed states |
| [visx gallery](https://visx.airbnb.tech/) | Low-level chart primitives for React | Confirmed the approach of drawing SVG directly, with no chart dependency |

## Read, not copied

- Human-in-the-loop approval guidance ([setproduct](https://www.setproduct.com/blog/ai-agent-ui-design-patterns), [Pixso](https://pixso.net/articles/agentic-ui-patterns/), [Velt](https://velt.dev/blog/designing-human-in-the-loop-workflows-ai-products)). The points `ApprovalQueue` follows: bind an approval to the exact plan and invalidate it if the plan changes; name the action on the button; say whether it can be undone and what evidence will remain; show waiting, approved, rejected and expired states; keep a second approver's judgement independent. These are vendor and design-blog opinions, not a standard.

- [taste-skill](https://github.com/leonxlnx/taste-skill) (`design-taste-frontend`). Its list of tells and its app-screen rules shaped the lint: no tracked uppercase captions, monospace only for ids and code, KPIs as type, tinted pills, flat surfaces. Its real-browser inspector is used by `npm run lint:visual`. It was reviewed before use: no shell execution, no credentials, network only for image sources.

## Standard methods used

- `ControlChart`: a p-chart with per-point limits from each sample size, and the Western Electric run rules.
- `EvalMatrix`: exact McNemar test on paired results, Clopper-Pearson intervals per run.
- `ConfidenceBar`: Clopper-Pearson interval and the exact zero-failure bound.

These are textbook methods, implemented in `src/components/spc.ts` and `src/verify/stats.ts` and tested against known values.

## Not done

- No reference was available for `DataGrid` beyond general requirements (virtualization, sticky header, multi-sort, per-column filters, resize, range select, keyboard). It was not modelled on a specific product, and it has not been compared against AG Grid or TanStack Table.
- Mobbin could not be used (it needs a paid plan), so there are no Mobbin references.
