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
- Judgement components: `AutonomyGate` (agreement with a person, an exact interval widened for repeated looks, tiers T0 to T4 from the arXiv agent reliability profile), `EvidenceTable` (coverage and conflicts counted from sources) and `PlanVsActual` (skipped, failed, blocked, late and unplanned steps).
- `ApprovalChain` (who has to approve, in order, with time limits; wrong-person decisions do not count) and `HandoffPacket` (what an agent hands a person, checked for completeness).
- `PermissionGrant` (what an agent may do, what is left, when it ends) and `BudgetMeter` (spend against a limit with a straight-line projection), `AutonomyBoard` (every agent in one list, worked out from each agent's own cases, grants and budget).
- `RecordViewer`: one record on one page. It says verified only when the verifier's verdict and its own details agree, and can save the verifier's output.
- `orlune/adapters`: `spansFromOtlp` (OpenTelemetry JSON to trace spans) and `stepsFromAiSdk` (AI SDK message parts to plan-comparison steps).
- `ApprovalWorkspace`: the approval queue with the chain, evidence and handoff beside the selected request. `ApprovalQueue` gained an `onSelect` callback for it.
- First workspace: `RunInspector`, one run in four views with the four questions answered first. The plan to go further is in `docs/ROADMAP.md`.
- Fixed `Compare`: its cells lost their styling when the table was given row wrappers. Styles now use roles, and a test stops direct-child selectors coming back.
