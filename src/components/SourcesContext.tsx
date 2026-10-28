'use client'

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import type { Clock } from './gantt.js'
import type { Day } from './heat.js'
import type { FlowEdge, FlowNode } from './flow.js'
import type { SankeyLink, SankeyNode } from './sankeyLayout.js'
import type { SpcPoint } from './spc.js'
import type { Span } from './trace.js'
import type { DiffFile } from './DiffViewer.js'
import type { EvalMatrixProps, FleetRow } from '../schemas.js'
import type { AutonomyCase, AutonomyRule, Tier } from './autonomy.js'
import type { BudgetInput } from './budget.js'
import type { ChainDecision, ChainStepDef } from './chain.js'
import type { AvailableValue, EvidenceRow } from './evidence.js'
import type { FleetAgent } from './fleet.js'
import type { Checkpoint } from './branches.js'
import type { Handoff } from './handoff.js'
import type { VariantRun } from './variants.js'
import type { Grant } from './permissions.js'
import type { ActualStep, PlanStep } from './planactual.js'

/**
 * The facts your system holds, keyed by an id you choose. A model can ask for `TraceExplorer("run-42")`
 * through OpenUI. It never supplies the spans, so it cannot invent evidence, only choose which of yours to show.
 */
export type OrluneSources = {
  traces?: Record<string, Span[]>
  flows?: Record<string, { nodes: FlowNode[]; edges: FlowEdge[] }>
  rates?: Record<string, { data: SpcPoint[]; baseline?: number }>
  sankeys?: Record<string, { nodes: (SankeyNode & { tone?: 'good' | 'warn' | 'bad' })[]; links: SankeyLink[]; unit?: string }>
  activity?: Record<string, Day[]>
  deadlines?: Record<string, { rows: { name: string; clocks: Clock[] }[]; now: string }>
  evals?: Record<string, Pick<EvalMatrixProps, 'cases' | 'runs'>>
  diffs?: Record<string, DiffFile[]>
  fleets?: Record<string, { rows: FleetRow[]; now?: string }>
  autonomy?: Record<string, { tier: Tier; cases: AutonomyCase[]; rule: AutonomyRule; looks?: number }>
  grants?: Record<string, { grants: Grant[]; now?: string; userScopes?: Record<string, string[]>; dormantDays?: number; requireOwner?: boolean }>
  budgets?: Record<string, BudgetInput>
  agents?: Record<string, { agents: FleetAgent[]; now?: string }>
  runs?: Record<string, { spans: Span[]; plan?: PlanStep[]; actual?: ActualStep[]; evidence?: EvidenceRow[] }>
  evidence?: Record<string, EvidenceRow[] | { rows: EvidenceRow[]; documents?: Record<string, string>; available?: AvailableValue[] }>
  plans?: Record<string, { plan: PlanStep[]; actual: ActualStep[] }>
  chains?: Record<string, { requester: string; startedAt: string; steps: ChainStepDef[]; decisions: ChainDecision[]; now?: string }>
  handoffs?: Record<string, { handoff: Partial<Handoff>; now?: string }>
  branches?: Record<string, Checkpoint[]>
  variants?: Record<string, { runs: VariantRun[]; plan?: string[] }>
}

export type SourceKind = keyof OrluneSources

/** Your facts, held so they can change while the page is open. Components that read it redraw when a record is set. */
export type SourceStore = {
  get: () => OrluneSources
  /** Put one record under a kind and id, such as a run that has gained spans. */
  set: <K extends SourceKind>(kind: K, id: string, value: NonNullable<OrluneSources[K]>[string]) => void
  /** Replace everything at once. */
  replace: (next: OrluneSources) => void
  subscribe: (listener: () => void) => () => void
}

/** A store for facts that arrive over time, such as the steps of an agent that is still running. */
export function createSourceStore(initial: OrluneSources = {}): SourceStore {
  let state = initial
  const listeners = new Set<() => void>()
  const emit = () => listeners.forEach((l) => l())
  return {
    get: () => state,
    set: (kind, id, value) => { state = { ...state, [kind]: { ...(state[kind] as Record<string, unknown> | undefined), [id]: value } }; emit() },
    replace: (next) => { state = next; emit() },
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l) } },
  }
}

const fixed = (sources: OrluneSources): SourceStore => ({ get: () => sources, set: () => {}, replace: () => {}, subscribe: () => () => {} })

const SourcesContext = createContext<SourceStore>(fixed({}))

/** Give components your facts: a fixed `sources` object, or a `store` that changes while the page is open. */
export function SourcesProvider({ sources, store, children }: { sources?: OrluneSources; store?: SourceStore; children: ReactNode }) {
  const value = useMemo(() => store ?? fixed(sources ?? {}), [store, sources])
  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>
}

/** One source by kind and id, or undefined when the host has nothing under that id. Follows a store as it changes. */
export function useSource<K extends SourceKind>(kind: K, id: string): NonNullable<OrluneSources[K]>[string] | undefined {
  const store = useContext(SourcesContext)
  const all = useSyncExternalStore(store.subscribe, store.get, store.get)
  const table = all[kind] as Record<string, unknown> | undefined
  return table && Object.hasOwn(table, id) ? (table[id] as NonNullable<OrluneSources[K]>[string]) : undefined
}

/** The ids a model may ask for, one line per kind, ready for the prompt's `additionalRules`. */
export function describeSources(sources: OrluneSources): string[] {
  return (Object.keys(sources) as SourceKind[])
    .filter((k) => Object.keys(sources[k] ?? {}).length > 0)
    .map((k) => `${KIND_COMPONENT[k]} source ids: ${Object.keys(sources[k]!).map((id) => JSON.stringify(id)).join(', ')}. Use only these.`)
}

/** The component that draws each kind of source. */
export const KIND_COMPONENT: Record<SourceKind, string> = {
  traces: 'TraceExplorer', flows: 'FlowCanvas', rates: 'ControlChart', sankeys: 'Sankey', activity: 'ActivityHeatmap',
  deadlines: 'DeadlineGantt', evals: 'EvalMatrix', diffs: 'DiffViewer', fleets: 'FleetBoard',
  autonomy: 'AutonomyGate', grants: 'PermissionGrant', budgets: 'BudgetMeter', agents: 'AutonomyBoard', runs: 'RunInspector',
  evidence: 'EvidenceTable', plans: 'PlanVsActual', chains: 'ApprovalChain', handoffs: 'HandoffPacket', branches: 'RunBranches', variants: 'RunVariants',
}
