# Roadmap: from small widgets to workspaces

The first 26 components are single-purpose views: a bar, a card, a chart. That is the right base, but it is the
lowest level of a library. This plan adds two levels above it, and says how each level is built and checked.

## What the other libraries do at the higher level

| Library | Higher-level thing | What it bundles | Lesson for Orlune |
| --- | --- | --- | --- |
| shadcn/ui blocks | Dashboard, sidebar, login, calendar | A whole screen layout from smaller parts, copied into your project | Distribute composed screens as `registry:block`, not only atoms. Thousands of third-party blocks exist, so layout alone is not a moat. |
| Ant Design ProComponents | `ProTable`, `ProForm`, `ProDescriptions`, `ProList`, `ProLayout` | A table that also owns its search form, toolbar, batch actions, pagination and a `request` function | The step up from atom to "pro" is owning the whole job: data contract, states, actions and layout together. |
| shadcn AI Elements, assistant-ui, Vercel AI Elements | Chat, reasoning, tool, plan, queue | Conversation parts, not review or proof | Chat is covered and now first-party. Orlune stays out of it. |
| tool-ui (archived Sep 2026) | Approval card, plan, option list | Tool-call UI with schema-checked payloads and "receipts" | Its receipt idea was right and unfinished. Orlune's verified record is the finished version. |
| HextaUI | Chat thread, tool approvals, diff review | Finished screens with the hard states handled (failed, stopped, retried) | People pay for finished screens with edge cases done. Orlune's workspaces must ship every state. |
| LangChain Agent Inbox | An inbox of agent interrupts | Per-item actions (accept, edit, respond, ignore), a thread per item, one list for many agents | The inbox is the shape of a review workspace. It has no evidence view, no approval rules and no record. |
| Langfuse, Arize Phoenix, LangSmith, Braintrust | Trace list and trace detail, sessions, eval comparison, cost dashboards | Whole products | They answer four questions: did it finish, did it take an acceptable path, were the tool calls right, did it have the right context. Orlune can ship those four as components. |
| Carbon, Polaris, Atlassian | Patterns (empty states, data tables, audit log) | Guidance plus a few composed pieces | Write down the states contract once and enforce it. |

My search for enterprise "pattern" libraries returned little, so the Carbon, Polaris and Atlassian row rests on
general knowledge, not on pages I read.

## The gap

No library ships the accountability layer as finished screens: an approval workspace with evidence and an audit
trail, a run inspector that sets the plan against what happened, or a view of when an agent has earned more
autonomy. Those are the screens a buyer's risk or operations team actually opens.

## Three levels

| Level | What it is | Examples | State |
| --- | --- | --- | --- |
| 1. Parts | One view, plain data in | `VerifyStatus`, `ConfidenceBar`, `ApprovalQueue` | 26 shipped |
| 2. Judgements | One view that reaches a verdict from raw cases, with exact statistics and the rule shown | `AutonomyGate`, `EvidenceTable`, `PlanVsActual`, `ApprovalChain`, `HandoffPacket` | Shipped (phases 1, 3 and 4) |
| 3. Workspaces | A composed screen with its own states, layout and keyboard model | `RunInspector`, `ApprovalWorkspace`, `AutonomyBoard` | `RunInspector`, `ApprovalWorkspace`, `AutonomyBoard` and `RecordViewer` shipped |

Level 2 is the new idea. A part shows a number. A judgement takes the raw cases and a rule, does the arithmetic,
and says what follows. That is where a model must not be allowed to write the answer.

## Rules for every new component

1. **Data in, verdict out.** Props are plain data plus a rule. The component computes everything derived.
2. **Logic first.** The arithmetic lives in a pure file (`autonomy.ts`) with tests. The view only draws it.
3. **All the states.** Empty, loading, error, partial and "not enough data" are designed, not left to the caller.
4. **Say why.** Every verdict carries the number and the rule behind it, in words.
5. **Model-safe.** Say whether a model may place it. Anything stating a fact about the world (a decision, a grant, a verification) stays out of the model's reach.
6. **Gates.** Each one ships with: unit tests for the logic, a demo specimen, light and dark screenshots, a docs page, an axe pass, a registry entry, and the Next.js server-render check.

## Phase 1: judgements (shipped)

| Component | Takes | Computes |
| --- | --- | --- |
| `AutonomyGate` | The agent's tier, paired agent-versus-human cases, and a rule such as "90% over at least 30 cases" | Agreement with an exact interval, widened for repeated looks; per-task weak spots; a verdict: collecting, stay, or eligible |
| `EvidenceTable` | Extracted values, each with the sources it was read from | Coverage ("11 of 12 values have a source"), conflicts between sources, unsourced values |
| `PlanVsActual` | A plan and the steps the agent took | Which planned steps ran, were skipped, failed or ran out of order, and which steps were not in the plan |

Autonomy tiers follow the five-tier scale in the arXiv agent reliability profile for financial services
(T0 suggest only to T4 acts inside a blocked envelope), where a tier is defined by what the agent does and who
provides the fallback.

## Phase 2: first workspace (shipped)

`RunInspector`: one run, seen four ways. Tabs for the trace (`TraceExplorer`), plan against actual
(`PlanVsActual`), evidence (`EvidenceTable`) and cost. It answers the four observability questions in one place:
did it finish, did it take an acceptable path, were the tool calls right, did it have the right context.

## Phase 3: review workspace (shipped)

`ApprovalWorkspace`: an inbox (many agents, one list), the selected item's plan, evidence and approval chain,
actions that match the item (approve, edit, respond, escalate), and the signed record beside it. New parts it
needs: `ApprovalChain` (who approves in order, with timeouts) and `HandoffPacket` (what an agent hands a person).
Adapters: LangGraph interrupt to queue item (shipped in `orlune/adapters`). The queue can also reject with a reason, reply without running, and edit the plan.

## Phase 4: control (shipped)

`AutonomyBoard`: a fleet of agents, each with its tier, its `AutonomyGate` verdict, its open deadlines and its
control chart. `PermissionGrant` (scopes, limits, expiry, remaining budget). `BudgetMeter`.

## Phase 5: record and trust (shipped)

`RecordViewer`: the verifier result, ledger, chain, receipts and guarantees on one page, with an export. Adapters
from OpenTelemetry spans and AI SDK message parts so the parts above can be fed without hand mapping.

## Order and why

1. Phase 1 first: small, testable, and the statistics are the part that is easy to get wrong.
2. Phase 2 next: it proves the workspace pattern with parts that already exist.
3. Phase 3 is the one a buyer sees. It waits for the approval chain and handoff packet.
4. Phases 4 and 5 follow demand.

## How we will know it worked

- Each new component is installable with one shadcn command and renders in a fresh Next.js server page.
- A reader can tell from the docs page what the component refuses to do.
- Every verdict a component states is reproducible from the data on the page with a calculator.

## Risks

- **Scope.** Workspaces are large. Each ships only when all its states are designed.
- **Statistics.** An interval used to promote an agent is a decision aid. `AutonomyGate` says so, and a person approves any promotion.
- **Overlap.** Chat and plan parts are now first-party in shadcn. Orlune does not compete there.
- **Maintenance.** Adapters track other projects' formats and will need upkeep.
