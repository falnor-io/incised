import { createElement, type ReactNode } from 'react'
import { createLibrary, defineComponent } from '@openuidev/react-lang'
import { z } from 'zod/v4'
import { Bottlenecks } from '../components/Bottlenecks.js'
import { Compare } from '../components/Compare.js'
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
// RecordProvider. RetestClock and ApprovalGate are left out on purpose, because their state is a fact
// about the world that your code should pass in, not something a model should assert.

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

export const KLYRA_COMPONENT_NAMES = [
  'Swimlane', 'Lane', 'Step', 'Trail', 'Stop', 'Bottlenecks', 'Bottleneck', 'Priority', 'PriorityItem', 'Funnel', 'FunnelStep',
  'Compare', 'CompareRow', 'ConfidenceBar', 'VerifyStatus', 'LedgerTimeline', 'GuaranteeCard',
] as const

/** The components, ready to spread into your own createLibrary call next to your other components. */
export function klyraComponents() {
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

  return [
    Step, Lane, Swimlane$, Stop, Trail$, Bottleneck, Bottlenecks$, PriorityItem, Priority$, FunnelStep, Funnel$,
    CompareRow, Compare$, ConfidenceBar$, VerifyStatus$, LedgerTimeline$, GuaranteeCard$,
  ]
}

export const KLYRA_ROOT = 'Reply'

/** A ready library with a simple Reply root. Use klyraComponents() to merge with your own components. */
export function buildKlyraLibrary() {
  const parts = klyraComponents()
  const refs = parts.filter((c) => !['Step', 'Lane', 'Stop', 'Bottleneck', 'PriorityItem', 'FunnelStep', 'CompareRow'].includes(c.name))
  const Reply = defineComponent({
    name: KLYRA_ROOT,
    description: 'The whole reply. Always the root. A list of parts shown top to bottom.',
    // lint-allow(no-any): z.union needs a non-empty tuple, and the refs come from the OpenUI library at runtime.
    props: z.object({ parts: z.array(z.union(refs.map((c) => c.ref) as [any, any, ...any[]])) }),
    component: (({ props, renderNode }) =>
      createElement('div', { style: { display: 'grid', gap: 12 } }, ...((props.parts ?? []) as unknown[]).map((p, i) => createElement('div', { key: i }, renderNode(p))))) as Renderer,
  })
  return createLibrary({ root: KLYRA_ROOT, components: [Reply, ...parts] })
}
