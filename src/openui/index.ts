import { createElement, type ReactNode } from 'react'
import { createLibrary, defineComponent } from '@openuidev/react-lang'
import { z } from 'zod/v4'
import { Bottlenecks } from '../components/Bottlenecks.js'
import { ActivityHeatmap } from '../components/ActivityHeatmap.js'
import { Compare } from '../components/Compare.js'
import { ControlChart } from '../components/ControlChart.js'
import { DeadlineGantt } from '../components/DeadlineGantt.js'
import { DiffViewer } from '../components/DiffViewer.js'
import { EvalMatrix } from '../components/EvalMatrix.js'
import { FleetBoard } from '../components/FleetBoard.js'
import { ApprovalChain } from '../components/ApprovalChain.js'
import { AutonomyBoard } from '../components/AutonomyBoard.js'
import { AutonomyGate } from '../components/AutonomyGate.js'
import { BudgetMeter } from '../components/BudgetMeter.js'
import { EvidenceTable } from '../components/EvidenceTable.js'
import { HandoffPacket } from '../components/HandoffPacket.js'
import { PermissionGrant } from '../components/PermissionGrant.js'
import { PlanVsActual } from '../components/PlanVsActual.js'
import { RecordViewer } from '../components/RecordViewer.js'
import { RunInspector } from '../components/RunInspector.js'
import { FlowCanvas } from '../components/FlowCanvas.js'
import { Sankey } from '../components/Sankey.js'
import { useSource, type OrluneSources, type SourceKind } from '../components/SourcesContext.js'
import { TraceExplorer } from '../components/TraceExplorer.js'
import { ConfidenceBar } from '../components/ConfidenceBar.js'
import { Funnel } from '../components/Funnel.js'
import { GuaranteeCard } from '../components/GuaranteeCard.js'
import { LedgerTimeline } from '../components/LedgerTimeline.js'
import { Priority } from '../components/Priority.js'
import { useRecordManifest, useRecordResult } from '../components/RecordContext.js'
import { Swimlane } from '../components/Swimlane.js'
import { Trail } from '../components/Trail.js'
import { VerifyStatus } from '../components/VerifyStatus.js'
import {
  bottlenecksSchema, compareSchema, confidenceBarSchema, funnelSchema, prioritySchema, swimlaneSchema, trailSchema,
} from '../schemas.js'
import type { GuaranteeResult, GuaranteeStatus } from '../verify/types.js'

// OpenUI Lang bindings. A model may place these components and fill in plain data. It cannot set any
// verification state: VerifyStatus, LedgerTimeline and GuaranteeCard read the verifier's result from
// RecordProvider. The complex views (TraceExplorer, Sankey and so on) take a source id and read the data
// from SourcesProvider, so a model chooses which of your facts to show and never writes them.
// The judgements (AutonomyGate, PermissionGrant, BudgetMeter, AutonomyBoard, EvidenceTable, PlanVsActual,
// ApprovalChain, HandoffPacket) and RunInspector work the same way: the model picks a source id, the numbers
// come from your data. RecordViewer reads RecordProvider like VerifyStatus does.
// RetestClock, ApprovalGate, ApprovalQueue, ApprovalWorkspace, InputRequest and ReceiptCard are left out on
// purpose: they carry a decision or ask a person something, which your code should own, not a model.

// lint-allow(no-any): OpenUI hands components untyped parsed props. Each renderer validates them with its zod schema before use.
type Renderer = (args: { props: any; renderNode: (value: unknown) => ReactNode }) => ReactNode

/** Parsed child elements arrive as { props }. Flatten them so the result can go through a zod schema. */
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain)
  if (value && typeof value === 'object' && 'props' in value) return plain((value as { props: unknown }).props)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]))
  return value
}

/** Validate against the component's own schema. Anything that does not fit renders nothing. */
function guarded<S extends z.ZodType>(schema: S, render: (data: z.output<S>) => ReactNode): Renderer {
  return ({ props }) => {
    const parsed = schema.safeParse(plain(props))
    return parsed.success ? render(parsed.data) : null
  }
}

const WORST: GuaranteeStatus[] = ['breached', 'pending', 'remedied', 'honored']
function worst(results: GuaranteeResult[]): { status: GuaranteeStatus; detail?: string } {
  for (const status of WORST) {
    const hit = results.find((r) => r.status === status)
    if (hit) return { status, detail: hit.detail }
  }
  return { status: 'pending' }
}

function RecordGuarantee({ id }: { id: string }) {
  const manifest = useRecordManifest()
  const result = useRecordResult()
  const g = manifest?.guarantees.find((x) => x.id === id)
  if (!g || !result) return null
  const mine = result.guarantees.filter((r) => r.id === id)
  const { status, detail } = worst(mine)
  return createElement(GuaranteeCard, { id: g.id, statement: g.statement, check: g.check, deadlineHours: g.deadlineHours, remedy: g.remedy, status, detail })
}

function RecordViewerFromContext({ title }: { title: string }) {
  return createElement(RecordViewer, { title, result: useRecordResult(), manifest: useRecordManifest() })
}

// A fresh schema per component: OpenUI tags each schema with its component's name, so sharing one would make the last one win.
const sourceProps = () => z.object({ source: z.string().max(80), title: z.string().max(80) })

function Missing({ source }: { source: string }) {
  return createElement('p', { className: 'ol ol-sub' }, `No data under "${source}".`)
}

function FromSource<K extends SourceKind>({ kind, source, title, render }: {
  kind: K
  source: string
  title: string
  render: (data: NonNullable<OrluneSources[K]>[string], title: string) => ReactNode
}) {
  const data = useSource(kind, source)
  return data ? render(data, title) : createElement(Missing, { source })
}

/** A component that shows one of your sources by id. Anything that does not fit the schema renders nothing. */
function sourced<K extends SourceKind>(kind: K, render: (data: NonNullable<OrluneSources[K]>[string], title: string) => ReactNode): Renderer {
  return ({ props }) => {
    const parsed = sourceProps().safeParse(plain(props))
    return parsed.success ? createElement(FromSource<K>, { kind, source: parsed.data.source, title: parsed.data.title, render }) : null
  }
}

export const ORLUNE_COMPONENT_NAMES = [
  'Swimlane', 'Lane', 'Step', 'Trail', 'Stop', 'Bottlenecks', 'Bottleneck', 'Priority', 'PriorityItem', 'Funnel', 'FunnelStep',
  'Compare', 'CompareRow', 'ConfidenceBar', 'VerifyStatus', 'LedgerTimeline', 'GuaranteeCard',
  'TraceExplorer', 'FlowCanvas', 'ControlChart', 'Sankey', 'ActivityHeatmap', 'DeadlineGantt', 'EvalMatrix', 'DiffViewer', 'FleetBoard',
  'AutonomyGate', 'PermissionGrant', 'BudgetMeter', 'AutonomyBoard', 'RunInspector', 'EvidenceTable', 'PlanVsActual', 'ApprovalChain', 'HandoffPacket', 'RecordViewer',
] as const

/** The components, ready to spread into your own createLibrary call next to your other components. */
export function orluneComponents() {
  const Step = defineComponent({
    name: 'Step',
    description: 'One step in a lane. waiting is true where work sits.',
    props: z.object({ name: z.string(), waiting: z.boolean().optional() }),
    component: () => null,
  })
  const Lane = defineComponent({
    name: 'Lane',
    description: 'One owner and their steps, up to 6.',
    props: z.object({ owner: z.string(), steps: z.array(Step.ref) }),
    component: () => null,
  })
  const Swimlane$ = defineComponent({
    name: 'Swimlane',
    description: 'Who does what, and where it waits. Up to 4 lanes.',
    props: z.object({ title: z.string(), lanes: z.array(Lane.ref) }),
    component: guarded(swimlaneSchema, (d) => createElement(Swimlane, d)),
  })

  const Stop = defineComponent({
    name: 'Stop',
    description: 'One stop on a traced request. waitDays is how many days it typically sits there, 0 if it does not wait.',
    props: z.object({ owner: z.string(), name: z.string(), note: z.string(), waitDays: z.number() }),
    component: () => null,
  })
  const Trail$ = defineComponent({
    name: 'Trail',
    description: 'One request traced stop by stop, 2 to 8 stops in the order the work moves. The total wait is added up for you.',
    props: z.object({ title: z.string(), request: z.string(), stops: z.array(Stop.ref) }),
    component: guarded(trailSchema, (d) => createElement(Trail, d)),
  })

  const Bottleneck = defineComponent({
    name: 'Bottleneck',
    description: 'A stage and how long it waits, in the chart unit.',
    props: z.object({ stage: z.string(), amount: z.number() }),
    component: () => null,
  })
  const Bottlenecks$ = defineComponent({
    name: 'Bottlenecks',
    description: 'Where work waits most. 2 to 6 stages, only numbers you were given. Waiting time only.',
    props: z.object({ title: z.string(), unit: z.string(), items: z.array(Bottleneck.ref) }),
    component: guarded(bottlenecksSchema, (d) => createElement(Bottlenecks, d)),
  })

  const PriorityItem = defineComponent({
    name: 'PriorityItem',
    description: 'One thing to place: a short label, how much it matters (impact) and how heavy it is to change (effort).',
    props: z.object({ label: z.string(), impact: z.enum(['high', 'low']), effort: z.enum(['high', 'low']) }),
    component: () => null,
  })
  const Priority$ = defineComponent({
    name: 'Priority',
    description: 'An impact against effort grid that sorts 2 to 6 items into quick wins, big bets, fill-ins and park for now. A judgement, and the interface says so.',
    props: z.object({ title: z.string(), items: z.array(PriorityItem.ref) }),
    component: guarded(prioritySchema, (d) => createElement(Priority, d)),
  })

  const FunnelStep = defineComponent({
    name: 'FunnelStep',
    description: 'One step of a funnel: a label and how many got this far.',
    props: z.object({ label: z.string(), value: z.number() }),
    component: () => null,
  })
  const Funnel$ = defineComponent({
    name: 'Funnel',
    description: 'How many make it through each step, 2 to 6 steps, counts from largest to smallest. The share kept at each step is computed for you.',
    props: z.object({ title: z.string(), unit: z.string(), steps: z.array(FunnelStep.ref) }),
    component: guarded(funnelSchema, (d) => createElement(Funnel, d)),
  })

  const CompareRow = defineComponent({
    name: 'CompareRow',
    description: 'One row: what is compared, then the left and right text.',
    props: z.object({ label: z.string(), left: z.string(), right: z.string() }),
    component: () => null,
  })
  const Compare$ = defineComponent({
    name: 'Compare',
    description: 'Two columns, row by row, for how something runs today against how it would be organised. Up to 5 rows. Structure only, never a result.',
    props: z.object({ title: z.string(), leftLabel: z.string(), rightLabel: z.string(), rows: z.array(CompareRow.ref) }),
    component: guarded(compareSchema, (d) => createElement(Compare, d)),
  })

  const ConfidenceBar$ = defineComponent({
    name: 'ConfidenceBar',
    description:
      'An observed pass rate with its exact interval. Give passes out of n from the evaluation results you were given, never a guess. threshold is an optional target between 0 and 1. The interval and the verdict are computed for you.',
    props: z.object({ label: z.string(), passes: z.number(), n: z.number(), threshold: z.number().optional() }),
    component: guarded(confidenceBarSchema, (d) => createElement(ConfidenceBar, d)),
  })

  const VerifyStatus$ = defineComponent({
    name: 'VerifyStatus',
    description: 'The verification result for the record being discussed. Takes no arguments: the result comes from the verifier, not from you.',
    props: z.object({}),
    component: () => createElement(VerifyStatus),
  })
  const LedgerTimeline$ = defineComponent({
    name: 'LedgerTimeline',
    description: 'The signed event ledger for the record being discussed. Takes no arguments: the events come from the verifier.',
    props: z.object({}),
    component: () => createElement(LedgerTimeline),
  })
  const GuaranteeCard$ = defineComponent({
    name: 'GuaranteeCard',
    description: 'One guarantee from the record, by its id such as "G2-RETEST-48H". Its text and status come from the record and the verifier, not from you.',
    props: z.object({ id: z.string() }),
    component: guarded(z.object({ id: z.string() }), (d) => createElement(RecordGuarantee, { id: d.id })),
  })

  const view = <K extends SourceKind>(name: string, kind: K, description: string, render: (data: NonNullable<OrluneSources[K]>[string], title: string) => ReactNode) =>
    defineComponent({ name, description, props: sourceProps(), component: sourced(kind, render) })

  const RecordViewer$ = defineComponent({
    name: 'RecordViewer',
    description: 'The whole verified record: verdict, guarantees, signed events and chain. It shows the verifier\'s result and cannot be given one.',
    props: z.object({ title: z.string().max(80) }),
    component: guarded(z.object({ title: z.string().max(80) }), (d) => createElement(RecordViewerFromContext, { title: d.title })),
  })

  const views = [
    view('TraceExplorer', 'traces', 'An agent run as a flame graph, waterfall and ranked list. source is the id of a trace you were told about. Every figure is computed from the spans.',
      (spans, title) => createElement(TraceExplorer, { title, spans })),
    view('FlowCanvas', 'flows', 'A pannable process diagram laid out for you. source is the id of a flow you were told about.',
      (d, title) => createElement(FlowCanvas, { title, nodes: d.nodes, edges: d.edges })),
    view('ControlChart', 'rates', 'A failure rate over time with its control limits and any signals. source is the id of a series you were told about.',
      (d, title) => createElement(ControlChart, { title, data: d.data, baseline: d.baseline })),
    view('Sankey', 'sankeys', 'Where cases go, sized by volume, with any cases that went missing. source is the id of a flow of cases you were told about.',
      (d, title) => createElement(Sankey, { title, nodes: d.nodes, links: d.links, unit: d.unit })),
    view('ActivityHeatmap', 'activity', 'A calendar of daily activity with breach days marked. source is the id of an activity log you were told about.',
      (days, title) => createElement(ActivityHeatmap, { title, days })),
    view('DeadlineGantt', 'deadlines', 'Every deadline clock on one time axis, with what is met, running or overdue. source is the id of a set of clocks you were told about.',
      (d, title) => createElement(DeadlineGantt, { title, rows: d.rows, now: d.now })),
    view('EvalMatrix', 'evals', 'Test cases by evaluation runs, with the pass rate and exact interval per run and a paired comparison. source is the id of an evaluation you were told about.',
      (d, title) => createElement(EvalMatrix, { title, cases: d.cases, runs: d.runs })),
    view('DiffViewer', 'diffs', 'A side-by-side or unified diff of files. source is the id of a change you were told about.',
      (files, title) => createElement(DiffViewer, { title, files })),
    view('FleetBoard', 'fleets', 'One row per deployment with its status and tightest deadline. source is the id of a fleet you were told about.',
      (d, title) => createElement(FleetBoard, { title, rows: d.rows, now: d.now })),
    view('AutonomyGate', 'autonomy', 'Whether an agent has earned more autonomy: agreement with a person, an exact interval and your rule. It says eligible, never promoted. source is the id of an agent you were told about.',
      (d, title) => createElement(AutonomyGate, { title, tier: d.tier, cases: d.cases, rule: d.rule, looks: d.looks })),
    view('PermissionGrant', 'grants', 'What an agent is allowed to do, how much of each allowance is left and when it ends. source is the id of a set of grants you were told about.',
      (d, title) => createElement(PermissionGrant, { title, grants: d.grants, now: d.now })),
    view('BudgetMeter', 'budgets', 'Spend against a limit for a period, with the pace it implies. source is the id of a budget you were told about.',
      (d, title) => createElement(BudgetMeter, { title, ...d })),
    view('AutonomyBoard', 'agents', 'Every agent in one list with its tier, whether it has earned a higher one and what needs a look. source is the id of a fleet of agents you were told about.',
      (d, title) => createElement(AutonomyBoard, { title, agents: d.agents, now: d.now })),
    view('RunInspector', 'runs', 'One agent run in four views: trace, plan against actual, evidence and cost, with four questions answered first. source is the id of a run you were told about.',
      (d, title) => createElement(RunInspector, { title, spans: d.spans, plan: d.plan, actual: d.actual, evidence: d.evidence })),
    view('EvidenceTable', 'evidence', 'Each extracted value with the places it was read from, and whether each has a source or conflicts. source is the id of a set of values you were told about.',
      (d, title) => createElement(EvidenceTable, Array.isArray(d) ? { title, rows: d } : { title, rows: d.rows, documents: d.documents, available: d.available })),
    view('PlanVsActual', 'plans', 'What the agent planned next to what it did. source is the id of a run you were told about.',
      (d, title) => createElement(PlanVsActual, { title, plan: d.plan, actual: d.actual })),
    view('ApprovalChain', 'chains', 'Who has to approve, in order, with a time limit on each step. source is the id of an approval you were told about.',
      (d, title) => createElement(ApprovalChain, { title, requester: d.requester, startedAt: d.startedAt, steps: d.steps, decisions: d.decisions, now: d.now })),
    view('HandoffPacket', 'handoffs', 'What an agent handed a person when it stopped, and whether it is complete. source is the id of a handoff you were told about.',
      (d, title) => createElement(HandoffPacket, { title, handoff: d.handoff, now: d.now })),
  ]

  return [
    ...views,
    Step, Lane, Swimlane$, Stop, Trail$, Bottleneck, Bottlenecks$, PriorityItem, Priority$, FunnelStep, Funnel$,
    CompareRow, Compare$, ConfidenceBar$, VerifyStatus$, LedgerTimeline$, GuaranteeCard$, RecordViewer$,
  ]
}

export const ORLUNE_ROOT = 'Reply'

/** A ready library with a simple Reply root. Use orluneComponents() to merge with your own components. */
export function buildOrluneLibrary() {
  const parts = orluneComponents()
  const refs = parts.filter((c) => !['Step', 'Lane', 'Stop', 'Bottleneck', 'PriorityItem', 'FunnelStep', 'CompareRow'].includes(c.name))
  const Reply = defineComponent({
    name: ORLUNE_ROOT,
    description: 'The whole reply. Always the root. A list of parts shown top to bottom.',
    // lint-allow(no-any): z.union needs a non-empty tuple, and the refs come from the OpenUI library at runtime.
    props: z.object({ parts: z.array(z.union(refs.map((c) => c.ref) as [any, any, ...any[]])) }),
    component: (({ props, renderNode }) =>
      createElement('div', { style: { display: 'grid', gap: 12 } }, ...((props.parts ?? []) as unknown[]).map((p, i) => createElement('div', { key: i }, renderNode(p))))) as Renderer,
  })
  return createLibrary({ root: ORLUNE_ROOT, components: [Reply, ...parts] })
}
