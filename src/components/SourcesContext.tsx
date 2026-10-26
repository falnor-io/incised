'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
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
import type { Handoff } from './handoff.js'
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
  grants?: Record<string, { grants: Grant[]; now?: string }>
  budgets?: Record<string, BudgetInput>
  agents?: Record<string, { agents: FleetAgent[]; now?: string }>
  runs?: Record<string, { spans: Span[]; plan?: PlanStep[]; actual?: ActualStep[]; evidence?: EvidenceRow[] }>
  evidence?: Record<string, EvidenceRow[] | { rows: EvidenceRow[]; documents?: Record<string, string>; available?: AvailableValue[] }>
  plans?: Record<string, { plan: PlanStep[]; actual: ActualStep[] }>
  chains?: Record<string, { requester: string; startedAt: string; steps: ChainStepDef[]; decisions: ChainDecision[]; now?: string }>
  handoffs?: Record<string, { handoff: Partial<Handoff>; now?: string }>
}

export type SourceKind = keyof OrluneSources

const SourcesContext = createContext<OrluneSources>({})

export function SourcesProvider({ sources, children }: { sources: OrluneSources; children: ReactNode }) {
  const value = useMemo(() => sources, [sources])
  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>
}

/** One source by kind and id, or undefined when the host has nothing under that id. */
export function useSource<K extends SourceKind>(kind: K, id: string): NonNullable<OrluneSources[K]>[string] | undefined {
  const table = useContext(SourcesContext)[kind] as Record<string, unknown> | undefined
  return table && Object.hasOwn(table, id) ? (table[id] as NonNullable<OrluneSources[K]>[string]) : undefined
}

/** The ids a model may ask for, one line per kind, ready for the prompt's `additionalRules`. */
export function describeSources(sources: OrluneSources): string[] {
  return (Object.keys(sources) as SourceKind[])
    .filter((k) => Object.keys(sources[k] ?? {}).length > 0)
    .map((k) => `${KIND_COMPONENT[k]} source ids: ${Object.keys(sources[k]!).map((id) => JSON.stringify(id)).join(', ')}. Use only these.`)
}

const KIND_COMPONENT: Record<SourceKind, string> = {
  traces: 'TraceExplorer', flows: 'FlowCanvas', rates: 'ControlChart', sankeys: 'Sankey', activity: 'ActivityHeatmap',
  deadlines: 'DeadlineGantt', evals: 'EvalMatrix', diffs: 'DiffViewer', fleets: 'FleetBoard',
  autonomy: 'AutonomyGate', grants: 'PermissionGrant', budgets: 'BudgetMeter', agents: 'AutonomyBoard', runs: 'RunInspector',
  evidence: 'EvidenceTable', plans: 'PlanVsActual', chains: 'ApprovalChain', handoffs: 'HandoffPacket',
}
