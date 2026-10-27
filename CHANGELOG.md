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
- Install with `shadcn add @orlune/<item>` after adding the registry once.
- Judgement components: `AutonomyGate` (agreement with a person, an exact interval widened for repeated looks, tiers T0 to T4 from the arXiv agent reliability profile), `EvidenceTable` (coverage and conflicts counted from sources) and `PlanVsActual` (skipped, failed, blocked, late and unplanned steps).
- `ApprovalChain` (who has to approve, in order, with time limits; wrong-person decisions do not count) and `HandoffPacket` (what an agent hands a person, checked for completeness).
- `PermissionGrant` (what an agent may do, what is left, when it ends) and `BudgetMeter` (spend against a limit with a straight-line projection), `AutonomyBoard` (every agent in one list, worked out from each agent's own cases, grants and budget).
- A playground at `/playground` on the docs site, run locally with `npm run playground`. It lists every component with sample data, generates controls from the props, edits the rest as JSON, switches theme and width, offers presets, logs callbacks, and copies the code or a link to the exact state.
- Existing components move. Figures count to their new values (`Count`, `useCountUp`), bars slide and grow (`Funnel`, `Bottlenecks`, `DeadlineGantt`, `BudgetMeter`, `ConfidenceBar`), and rows and steps arrive in sequence (`Trail`, `Swimlane`, `ApprovalChain`, `LedgerTimeline`, `PermissionGrant`, `PlanVsActual`, `ApprovalQueue`, `FleetBoard`, `AutonomyBoard`, `EvidenceTable`, `EvalMatrix`, `RunInspector`). `ControlChart` draws its line and pops its signal points, `ActivityHeatmap` fills in by week, and the waiting step of an approval chain pulses. Nothing animates on first paint, and reduced motion turns it all off.
- `PermissionGrant` separates delegated from autonomous grants, checks a delegated one against what the person it acts for may do (`userScopes`), flags scopes unused for 30 days, and flags an irreversible scope nobody approves each use of.
- `RunInspector` has a Trace health tab (`traceHealth`): a model call that wraps the whole loop, tool calls at the top, orphan spans, missing token counts, empty names, noise, failures that say nothing, and children that outlive their parent.
- `RunBranches` compares two ends of a replayed run from its saved states. `RunVariants` groups runs by the path they took, against a plan, with an exact interval on each path's failure rate.
- The verifier takes `trustedKeys` and says whether each signing key is on your list: `trusted`, `valid-unknown-signer` or `not-checked`. `VerifyStatus` and `RecordViewer` show "Valid, unknown signer" instead of "Verified". `VerifyBadge` is a small mark that opens to the full result.
- `DiffViewer` marks moved code and leaves it out of the counts, shows who wrote each added line, can list files by how much really changed, and can accept or reject a hunk, with each decision tied to a digest of the file.
- `EvalMatrix` filters to changed, worse or better cases, shows how each run stands against the baseline, and says when too few cases flipped to tell a drop from chance.
- `HandoffPacket` records what triggered the handoff, whether it was warm or cold and whether the recipient was checked, and notes a summary that is too long.
- `FlowCanvas` arrow keys walk along the edges once a step is selected, and there is a text outline of the diagram.
- `AutonomyGate` and `AutonomyBoard` can step an agent down: when even the best-case estimate over the latest cases misses the rule. Promotion needs the lower bound over the rule and a step-down needs the upper bound under it, so an agent cannot flap. A critical task, a missing control or approvals made too fast to be a review each hold back a pass and are named. Gates show how often the agent asked and how often a person overrode it, and `autonomyStatement` makes a digest for a person to sign.
- `BudgetMeter` shows the burn rate as a multiple of the steady rate, over the whole period and over the latest samples, and a level that is critical only when both windows are at twice the pace or 10% is left.
- `EvidenceTable` looks each quote up in the document text you pass and flags one that is not there, checks the quote contains the value the source is said to read, and names values in the source that were never extracted.
- `InputRequest` reads the JSON Schema an MCP server sends (`fieldsFromJsonSchema`), refuses fields that look like secrets, offers a link with the site named, shows who is asking, and answers as accept, decline or cancel.
- `ControlChart` can apply all eight Nelson rules (`rules={NELSON}`), and `markersFromEvents` places ledger events on the chart.
- `ApprovalQueue` can now reject with a reason, reply to the agent without running the action (`respond`), and edit the plan. An edit is a new plan, so earlier approvals stop counting. Each item says which decisions it allows. `onDecide` gains a message, and there is a new `onEdit`.
- `InputRequest`: a form an agent hands to a person. Every answer is checked against the field it was asked for.
- OpenUI: the judgements, `RunInspector` and `RecordViewer` can be placed by a model, by source id. `orlune/openui/library` exports `orluneLibrary` for the OpenUI CLI.
- `orlune/adapters` gains `itemsFromInterrupt` and `responseFromDecisions` for LangGraph human-in-the-loop interrupts.
- Fixed: a bad date no longer throws or prints NaN. `PermissionGrant` counts a grant with an unreadable end date as not in force, `BudgetMeter` says its dates cannot be read, `ApprovalChain` says no time limit was checked, and a zero limit no longer divides by zero.
- `RecordViewer`: one record on one page. It says verified only when the verifier's verdict and its own details agree, and can save the verifier's output.
- `orlune/adapters`: `spansFromOtlp` (OpenTelemetry JSON to trace spans) and `stepsFromAiSdk` (AI SDK message parts to plan-comparison steps).
- `ApprovalWorkspace`: the approval queue with the chain, evidence and handoff beside the selected request. `ApprovalQueue` gained an `onSelect` callback for it.
- First workspace: `RunInspector`, one run in four views with the four questions answered first. The plan to go further is in `docs/ROADMAP.md`.
- Fixed `Compare`: its cells lost their styling when the table was given row wrappers. Styles now use roles, and a test stops direct-child selectors coming back.
