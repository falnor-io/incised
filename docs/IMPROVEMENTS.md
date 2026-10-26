# How to make each component better and more distinct

**Built so far (27 Oct 2026):** items 1 to 12 below. Not built: the ideas for the components I did not research deeply.

Research done on 26 Oct 2026 with TinyFish search and fetch. Each finding names its source. Where I read only a search
snippet, not the page, the line says so. Nothing here is built yet.

## What the field does, and what it leaves open

| Field | What it sells | What it leaves open |
| --- | --- | --- |
| Langfuse, Braintrust, LangSmith, Phoenix | Trace trees, score tables, LLM-as-judge | A score is a number from a model. You cannot recompute it from the page. |
| AWS graduated autonomy | A 0 to 100 weighted trust score, tiers T1 to T4 | Weights are chosen, not derived. No interval, no sample size. |
| LangChain HITL, CopilotKit, HumanLayer | The interrupt and the approve, edit, reject, respond payload | No finished review screen with evidence, an approval chain or a record. |
| Pierre diffs, GitClear Diff Digest | Fast diffs, line authorship, review depth | No tie between a reviewed diff and an approval of that exact change. |
| C2PA Content Credentials, Sigstore Rekor | Signed provenance and transparency logs | Built for media and packages, not for agent actions and approvals. |
| MCP elicitation | A schema for asking a person for input | A protocol. The client draws the form, so no one ships the safe form. |

So the distinct ground is the same in every row: **a verdict a reader can recompute, that a model cannot write, with an
approval bound to the exact thing that happens, verifiable offline.** Every improvement below should pass that test.
An improvement that only adds another chart does not.

## Improvements, in the order I would build them

### 1. AutonomyGate and AutonomyBoard
Sources read: AWS graduated autonomy (Aug 2026), Anthropic "Measuring AI agent autonomy" (Feb 2026), Knight Columbia
"Levels of Autonomy" (2025), CSA autonomy levels (Jan 2026, snippet only).

- **Demotion.** AWS: "promote slowly, demote immediately", with hysteresis so an agent at a boundary cannot flap. We only
  decide promotion. Add a `demote` verdict from the recent window (the upper bound of the last N cases below the rule),
  and a margin before promotion and after demotion.
- **A floor that is never averaged away.** AWS keeps safety as an independent floor. Let a task be marked `critical`, so a
  weak critical task blocks eligibility even when the total passes. Today a weak task is shown but does not block.
- **Rubber-stamp signal.** Anthropic found experienced users auto-approve more (about 20% to over 40% of sessions) and
  interrupt more, and that the agent stops to ask more than twice as often as people interrupt it. Show abstentions
  (agent asked) against overrides (person stopped it), and flag a run of approvals made in seconds. No dashboard shows this.
- **Roles, not only tiers.** Knight Columbia defines autonomy by the role the person takes: operator, collaborator,
  consultant, approver, observer. Show the person's role at the current and next tier beside T0 to T4.
- **Autonomy certificate.** Knight Columbia proposes certificates that state an agent's behaviour. We already sign
  records. Export the tier, the rule, the interval and the cases as a verifiable statement. Nobody ships this.
- **Controls required per tier.** CSA says higher levels need more controls (monitoring, incident response). Add a
  `requires` list a tier must have checked off before the gate says eligible.

### 2. BudgetMeter, GuaranteeCard, RetestClock
Sources read: Datadog burn rate alerts, Nobl9 error budgets.

- **Burn rate.** SRE practice states pace as a multiple: 1x uses the budget exactly over the period, 2x runs out in half.
  Ours is a straight-line projection in money. Add the multiple, since it is the number operators already use.
- **Two windows.** Datadog alerts when a short window (5 minutes) and a long window (1 hour) both exceed a threshold, so a
  spike alone does not page anyone. Add a recent-rate window beside the period average.
- **Standard thresholds.** Nobl9: warn near 25% budget left, critical near 10%. Use them as defaults.
- **Guarantees as budgets.** A guarantee that allows two breaches a quarter has an error budget. Show breaches used and
  remaining, and the burn.

### 3. EvidenceTable
Sources read: PaperTrail, CHI 2026 (arXiv 2602.21045).

- **Both directions.** PaperTrail matches answer claims to source claims and shows three states: supported, unsupported,
  and omitted from the answer. We check coverage and conflicts but not omissions. Add the source values the agent did
  not extract.
- **Quote check.** A cited excerpt must appear in the source text you supply, or the row says "quote not found". This is
  deterministic, so it costs no model and cannot be argued with.
- **Keep the burden low.** PaperTrail lowered trust but people kept relying on the model to avoid the work. Sort
  conflicts first, open the source at the exact place in one action, and show a single coverage bar.

### 4. InputRequest
Sources read: MCP elicitation spec (2026-07-28), Agent Client Protocol elicitation (snippet only).

- **Same shape as the protocol.** Form fields are flat primitives: string (with `email`, `uri`, `date`), number, boolean,
  enum. Add `fieldsFromJsonSchema()` so an MCP server's request renders directly, and return `accept`, `decline` or `cancel`.
- **Safe by construction.** The spec says a server must not ask for passwords, API keys, tokens or payment credentials in a
  form. Refuse to render a field that looks like one and show a link-out card with the domain instead.
- **Say who is asking**, and let the person review and change answers before sending. The spec requires both.

### 5. ControlChart
Sources read: QI Macros Nelson rules.

- We implement Western Electric rules 1 to 4. Add Nelson 5 to 8: six in a row trending, fifteen hugging the centre, fourteen
  alternating, eight beyond one sigma. Let the caller pick the rule set, since practitioners disagree (Wheeler against Nelson).
- Mark model releases and prompt changes from the ledger as phase lines, so a signal can be tied to a cause.

### 6. PermissionGrant
Sources read: WorkOS "AI agent permissions checklist" (Sep 2026).

- **Delegated or autonomous**, with a named owner. WorkOS: a delegated agent never exceeds the user it acts for.
- **Effective access.** Show the intersection of the agent's ceiling and the user's permissions, not only the grant.
- **Dormant grants.** Least privilege means noticing scopes never used. Add `lastUsedAt` and flag the idle ones.
- **Irreversible scopes** marked as needing out-of-band approval.

### 7. RunInspector and TraceExplorer
Sources read: Langfuse "What does a good trace look like?", LangGraph time travel.

- **Trace health.** Langfuse lists what a good trace has: each model call as its own generation, tool calls nested under
  the step that asked, thinking captured, little noise, and a warning against one parent generation wrapping a whole loop.
  Turn that into a lint on the spans you pass in. Deterministic, and no one shows it.
- **Branches.** LangGraph keeps checkpoints with parent links, so history is a tree and a person can replay or fork from
  a step. Show a run's branches and compare a fork with the original.
- **Run variants** (new component). Group many runs by the path they took: "17 followed the plan, 4 skipped the limit
  check." This is process mining's variant explorer. The Celonis page was behind a login, so I read only search snippets.

### 8. VerifyStatus, ReceiptCard, ChainGraph
Sources read: C2PA 2.4 spec, section 9.3 (the rest of it skimmed only); Sigstore Rekor docs (snippet only).

- **Valid is not trusted.** C2PA defines three nested states: Well-Formed, Valid and Trusted (any Trusted manifest is also
  Valid), and a validator can report which trust list it used. Our verifier says valid or not. Add a trusted-keys option so
  "valid, but signed by a key you do not know" is its own state, and say which key list was used.
- **A compact badge** that expands, like the Content Credentials pin, so a verified result can sit inside a table row. The
  spec also lets a consumer show the signer's logo, read from the certificate.
- **What changed.** Show the edit history of the record, as Content Credentials shows edits.

### 9. DiffViewer
Sources read: pierre diffs, GitClear Diff Digest.

- **Authorship per line**, so a reviewer knows what the agent wrote. GitClear reports 29% less review time across 49 developers
  (their own figure).
- **Moved and copied code** shown as moved, not as deleted and added. Sort files by how much they need a person.
- **Reviewed state and accept or reject per hunk**, as pierre offers.
- **Distinct:** bind the reviewed diff to the approval's plan hash, so an approval of a diff stops counting when the diff changes.

### 10. EvalMatrix
Sources read: Braintrust interpret results, LangSmith compare experiments.

- Both let you pick a source experiment, mark each metric as higher or lower is better, count regressions and improvements
  per column, and filter to only the regressions. Ours has exact intervals and a paired test but not those controls.
- **Distinct:** say whether a regression is real. They colour a drop red. We can say "not distinguishable from noise".

### 11. HandoffPacket
Sources read: Twilio, Cresta.

- Triggers should fire early: an explicit request, a high-stakes category, a second failed attempt. Record the trigger.
- Send a three-line summary, not a 40-turn transcript. Check its length.
- Distinguish a warm handoff (briefed first) from a cold one (a blank screen), and show whether the recipient is verified.

### 12. FlowCanvas
Source read: React Flow accessibility docs.

- React Flow gives tab focus, Enter to select, arrow-key moves, auto-pan and live announcements. Match that, and add what
  it lacks: arrow keys that walk along edges to the next node, and an outline view of the same graph as a nested list.

## Components I did not research deeply

DataGrid, Sankey, DeadlineGantt, ActivityHeatmap, FleetBoard, JsonTree, Swimlane, Trail, Bottlenecks, Priority, Funnel and
Compare. My searches returned library comparisons and general guidance, and I did not read pages specific enough to
justify changes. One idea each, from snippets only:

- **DeadlineGantt:** show the committed deadline as a locked baseline against the actual (monday.com and Bryntum both do).
- **DataGrid:** TanStack Table is headless and AG Grid is a full grid. Do not compete. Add cell types for provenance and verdicts.
- **FleetBoard:** agent control planes (Galileo Agent Control, Fiddler) centre on policy enforcement. Show policy hits per agent.

## Order

1. AutonomyGate demotion, critical tasks and rubber-stamp signal (item 1). It is the component with the most outside attention.
2. BudgetMeter burn rate and two windows (item 2). Small, and it uses numbers operators already know.
3. EvidenceTable omissions and quote check (item 3).
4. InputRequest to MCP elicitation (item 4).
5. ControlChart Nelson rules and phase lines (item 5).
6. The rest, by how much a buyer's risk team would ask for them.
