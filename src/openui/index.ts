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
import { RunBranches } from '../components/RunBranches.js'
import { RunVariants } from '../components/RunVariants.js'
import { RunInspector } from '../components/RunInspector.js'
import { FlowCanvas } from '../components/FlowCanvas.js'
import { Sankey } from '../components/Sankey.js'
import { useSource, type OrluneSources, type SourceKind } from '../components/SourcesContext.js'
import { TraceExplorer } from '../components/TraceExplorer.js'
import { ConfidenceBar } from '../components/ConfidenceBar.js'
import { Funnel } from '../components/Funnel.js'
import { Sketch } from '../components/Sketch.js'
import { Tour, type TourStep as TourStepData } from '../components/Tour.js'
import { GuaranteeCard } from '../components/GuaranteeCard.js'
import { LedgerTimeline } from '../components/LedgerTimeline.js'
import { Priority } from '../components/Priority.js'
import { useRecordManifest, useRecordResult } from '../components/RecordContext.js'
import { Swimlane } from '../components/Swimlane.js'
import { Trail } from '../components/Trail.js'
import { VerifyStatus } from '../components/VerifyStatus.js'
import {
  bottlenecksSchema, compareSchema, confidenceBarSchema, funnelSchema, prioritySchema, sketchSchema, swimlaneSchema, tourSchema, trailSchema,
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

/** One thing that was wrong with what a model wrote for a component. */
export type OrluneInvalid = { component: string; issues: { path: string; message: string }[] }
type Report = (issues: readonly { path: PropertyKey[]; message: string }[]) => void

/** Validate against the component's own schema. Anything that does not fit renders nothing. */
function guarded<S extends z.ZodType>(report: Report | undefined, schema: S, render: (data: z.output<S>) => ReactNode): Renderer {
  return ({ props }) => {
    const { rest, tour } = splitTour(props)
    const parsed = schema.safeParse(rest)
    if (!parsed.success) report?.(parsed.error.issues)
    return parsed.success ? withTour(render(parsed.data), tour) : null
  }
}

/** A model may add a walk-through to any component it places. It is checked on its own, so a bad tour never takes the component down with it. */
function splitTour(props: unknown): { rest: unknown; tour: TourStepData[] | undefined } {
  const flat = plain(props)
  if (flat && typeof flat === 'object' && !Array.isArray(flat) && 'tour' in flat) {
    const { tour, ...rest } = flat as Record<string, unknown>
    const parsed = tourSchema.safeParse(tour)
    return { rest, tour: parsed.success ? parsed.data : undefined }
  }
  return { rest: flat, tour: undefined }
}
const withTour = (node: ReactNode, tour?: TourStepData[]): ReactNode => (tour?.length ? createElement(Tour, { steps: tour, children: node }) : node)

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
function sourced<K extends SourceKind>(report: Report | undefined, kind: K, render: (data: NonNullable<OrluneSources[K]>[string], title: string) => ReactNode): Renderer {
  return ({ props }) => {
    const { rest, tour } = splitTour(props)
    const parsed = sourceProps().safeParse(rest)
    if (!parsed.success) report?.(parsed.error.issues)
    return parsed.success ? withTour(createElement(FromSource<K>, { kind, source: parsed.data.source, title: parsed.data.title, render }), tour) : null
  }
}

export const ORLUNE_COMPONENT_NAMES = [
  'Swimlane', 'Lane', 'Step', 'Trail', 'Stop', 'Bottlenecks', 'Bottleneck', 'Priority', 'PriorityItem', 'Funnel', 'FunnelStep', 'Sketch', 'SketchNode', 'SketchArrow', 'SketchStep', 'TourStep',
  'Compare', 'CompareRow', 'ConfidenceBar', 'VerifyStatus', 'LedgerTimeline', 'GuaranteeCard',
  'TraceExplorer', 'FlowCanvas', 'ControlChart', 'Sankey', 'ActivityHeatmap', 'DeadlineGantt', 'EvalMatrix', 'DiffViewer', 'FleetBoard',
  'AutonomyGate', 'PermissionGrant', 'BudgetMeter', 'AutonomyBoard', 'RunInspector', 'EvidenceTable', 'PlanVsActual', 'ApprovalChain', 'HandoffPacket', 'RecordViewer', 'RunBranches', 'RunVariants',
] as const

/** The components, ready to spread into your own createLibrary call next to your other components. */
/** Sets of components to offer a model, in the way Hashbrown's UI Kits package them. A smaller set means a shorter prompt and fewer ways to go wrong. */
export const ORLUNE_KITS = {
  workflow: ['Swimlane', 'Trail', 'Bottlenecks', 'Priority', 'Funnel', 'Compare'],
  explain: ['Sketch'],
  record: ['VerifyStatus', 'LedgerTimeline', 'GuaranteeCard', 'ConfidenceBar', 'RecordViewer'],
  review: ['ApprovalChain', 'AutonomyGate', 'AutonomyBoard', 'EvidenceTable', 'PlanVsActual', 'HandoffPacket', 'PermissionGrant', 'BudgetMeter', 'RunInspector'],
  inspect: ['TraceExplorer', 'FlowCanvas', 'ControlChart', 'Sankey', 'ActivityHeatmap', 'DeadlineGantt', 'EvalMatrix', 'DiffViewer', 'FleetBoard', 'RunBranches', 'RunVariants'],
} as const
export type OrluneKit = keyof typeof ORLUNE_KITS

/** The parts of a component that are written inside it and never placed alone. */
const CHILDREN: Record<string, string[]> = {
  Swimlane: ['Lane', 'Step'], Trail: ['Stop'], Bottlenecks: ['Bottleneck'], Priority: ['PriorityItem'], Funnel: ['FunnelStep'], Compare: ['CompareRow'], Sketch: ['SketchNode', 'SketchArrow', 'SketchStep'],
}

export type OrluneComponentsOptions = {
  /** Offer only some of the components: a kit name, several, or a list of component names. Omit for all of them. */
  kit?: OrluneKit | OrluneKit[] | string[]
  /**
   * Called when what a model wrote for a component does not fit its schema, which renders nothing. Send it back to the
   * model (see `toA2uiError`) so it can correct itself. While a reply is still streaming, props are incomplete and
   * will fail, so act on it only once the stream has finished.
   */
  onInvalid?: (invalid: OrluneInvalid) => void
}

export function orluneComponents(options: OrluneComponentsOptions = {}) {
  // Each distinct problem is reported once, and after the render that found it, so the callback is never run mid-render.
  const told = new Set<string>()
  const report = (component: string): Report | undefined => options.onInvalid
    ? (issues) => {
        const invalid = { component, issues: issues.map((i) => ({ path: i.path.map(String).join('/'), message: i.message })) }
        const key = JSON.stringify(invalid)
        if (told.has(key)) return
        told.add(key)
        queueMicrotask(() => options.onInvalid!(invalid))
      }
    : undefined
  const TourStep = defineComponent({
    name: 'TourStep',
    description: 'One step of a walk through a component you placed: what to say, and what to point at. target is words shown on screen written as "text:Weekly re-test", or a row id. text is a short note beside it. kind is circle, sticky, pin or tag.',
    props: z.object({ say: z.string(), target: z.string().optional(), text: z.string().optional(), kind: z.enum(['circle', 'sticky', 'pin', 'tag']).optional() }),
    component: () => null,
  })
  // Every component a model places can take a `tour`: a walk through it, one step at a time.
  const tourProps = () => ({ tour: z.array(TourStep.ref).optional() })

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
    props: z.object({ title: z.string(), lanes: z.array(Lane.ref) }).extend(tourProps()),
    component: guarded(report('Swimlane'), swimlaneSchema, (d) => createElement(Swimlane, d)),
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
    props: z.object({ title: z.string(), request: z.string(), stops: z.array(Stop.ref) }).extend(tourProps()),
    component: guarded(report('Trail'), trailSchema, (d) => createElement(Trail, d)),
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
    props: z.object({ title: z.string(), unit: z.string(), items: z.array(Bottleneck.ref) }).extend(tourProps()),
    component: guarded(report('Bottlenecks'), bottlenecksSchema, (d) => createElement(Bottlenecks, d)),
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
    props: z.object({ title: z.string(), items: z.array(PriorityItem.ref) }).extend(tourProps()),
    component: guarded(report('Priority'), prioritySchema, (d) => createElement(Priority, d)),
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
    props: z.object({ title: z.string(), unit: z.string(), steps: z.array(FunnelStep.ref) }).extend(tourProps()),
    component: guarded(report('Funnel'), funnelSchema, (d) => createElement(Funnel, d)),
  })

  const SketchNode = defineComponent({
    name: 'SketchNode',
    description: 'One box on the grid: an id other parts refer to, its label, its column (0 to 5) and row (0 to 4). kind is input, output or plain.',
    props: z.object({ id: z.string(), label: z.string(), col: z.number(), row: z.number(), kind: z.enum(['input', 'output', 'plain']).optional() }),
    component: () => null,
  })
  const SketchArrow = defineComponent({
    name: 'SketchArrow',
    description: 'An arrow from the box with one id to the box with another, with an optional short label.',
    props: z.object({ from: z.string(), to: z.string(), label: z.string().optional() }),
    component: () => null,
  })
  const SketchStep = defineComponent({
    name: 'SketchStep',
    description: 'What to say at this point, and the ids of the boxes that come in with it. Arrows appear when both their boxes have.',
    props: z.object({ say: z.string(), show: z.array(z.string()) }),
    component: () => null,
  })
  const Sketch$ = defineComponent({
    name: 'Sketch',
    description: 'A diagram that explains something, drawn like a notebook page, 2 to 12 boxes on a grid with arrows between them. Give boxes a column and row, never pixels. Use steps to draw it in order while explaining. It is your explanation, not a measured result: never put a figure in it that a source did not give you.',
    props: z.object({ title: z.string(), heading: z.string().optional(), subtitle: z.string().optional(), nodes: z.array(SketchNode.ref), arrows: z.array(SketchArrow.ref), steps: z.array(SketchStep.ref).optional() }),
    component: guarded(report('Sketch'), sketchSchema, (d) => createElement(Sketch, d)),
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
    props: z.object({ title: z.string(), leftLabel: z.string(), rightLabel: z.string(), rows: z.array(CompareRow.ref) }).extend(tourProps()),
    component: guarded(report('Compare'), compareSchema, (d) => createElement(Compare, d)),
  })

  const ConfidenceBar$ = defineComponent({
    name: 'ConfidenceBar',
    description:
      'An observed pass rate with its exact interval. Give passes out of n from the evaluation results you were given, never a guess. threshold is an optional target between 0 and 1. The interval and the verdict are computed for you.',
    props: z.object({ label: z.string(), passes: z.number(), n: z.number(), threshold: z.number().optional() }).extend(tourProps()),
    component: guarded(report('ConfidenceBar'), confidenceBarSchema, (d) => createElement(ConfidenceBar, d)),
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
    props: z.object({ id: z.string() }).extend(tourProps()),
    component: guarded(report('GuaranteeCard'), z.object({ id: z.string() }), (d) => createElement(RecordGuarantee, { id: d.id })),
  })

  const view = <K extends SourceKind>(name: string, kind: K, description: string, render: (data: NonNullable<OrluneSources[K]>[string], title: string) => ReactNode) =>
    defineComponent({ name, description, props: sourceProps().extend(tourProps()), component: sourced(report(name), kind, render) })

  const RecordViewer$ = defineComponent({
    name: 'RecordViewer',
    description: 'The whole verified record: verdict, guarantees, signed events and chain. It shows the verifier\'s result and cannot be given one.',
    props: z.object({ title: z.string().max(80) }).extend(tourProps()),
    component: guarded(report('RecordViewer'), z.object({ title: z.string().max(80) }), (d) => createElement(RecordViewerFromContext, { title: d.title })),
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
      (d, title) => createElement(PermissionGrant, { title, ...d })),
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
    view('RunBranches', 'branches', 'One run as a tree of saved states, with any two ends compared: where they split and which values differ. source is the id of a run you were told about.',
      (cps, title) => createElement(RunBranches, { title, checkpoints: cps })),
    view('RunVariants', 'variants', 'Many runs grouped by the path they took, with how many followed the plan and how often each path failed. source is the id of a set of runs you were told about.',
      (d, title) => createElement(RunVariants, { title, runs: d.runs, plan: d.plan })),
    view('HandoffPacket', 'handoffs', 'What an agent handed a person when it stopped, and whether it is complete. source is the id of a handoff you were told about.',
      (d, title) => createElement(HandoffPacket, { title, handoff: d.handoff, now: d.now })),
  ]

  return [
    ...views,
    Step, Lane, Swimlane$, Stop, Trail$, Bottleneck, Bottlenecks$, PriorityItem, Priority$, FunnelStep, Funnel$, TourStep, SketchNode, SketchArrow, SketchStep, Sketch$,
    CompareRow, Compare$, ConfidenceBar$, VerifyStatus$, LedgerTimeline$, GuaranteeCard$, RecordViewer$,
  ]
}

export const ORLUNE_ROOT = 'Reply'

/** A ready library with a simple Reply root. Use orluneComponents() to merge with your own components. */
/** The component names a `kit` option stands for, with the parts written inside them, or null for all. */
function offered(kit: OrluneComponentsOptions['kit']): Set<string> | null {
  if (!kit) return null
  const list = (Array.isArray(kit) ? kit : [kit]) as string[]
  const names = new Set(list.flatMap((k) => (k in ORLUNE_KITS ? [...ORLUNE_KITS[k as OrluneKit]] : [k])))
  names.add('TourStep')
  for (const n of [...names]) for (const c of CHILDREN[n] ?? []) names.add(c)
  return names
}

export function buildOrluneLibrary(options: OrluneComponentsOptions = {}) {
  const only = offered(options.kit)
  const parts = orluneComponents(options).filter((c) => !only || only.has(c.name))
  const refs = parts.filter((c) => !['Step', 'Lane', 'Stop', 'Bottleneck', 'PriorityItem', 'FunnelStep', 'CompareRow', 'SketchNode', 'SketchArrow', 'SketchStep', 'TourStep'].includes(c.name))
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
