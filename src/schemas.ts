import { z } from 'zod/v4'

// One schema per component. The model fills these in and nothing else, so every string is bounded and
// derived figures (shares, intervals, totals) are not part of any schema: the components compute them.

const text = (max: number) => z.string().max(max)

export const swimlaneSchema = z.object({
  title: text(80),
  lanes: z
    .array(z.object({ owner: text(30), steps: z.array(z.object({ name: text(40), waiting: z.boolean().optional() })).max(6) }))
    .max(4),
})

export const trailSchema = z.object({
  title: text(80),
  request: text(60),
  stops: z.array(z.object({ owner: text(30), name: text(40), note: text(80), waitDays: z.number().min(0).max(999) })).min(2).max(8),
})

export const bottlenecksSchema = z.object({
  title: text(80),
  unit: text(14),
  items: z.array(z.object({ stage: text(40), amount: z.number().min(0).max(99999) })).min(2).max(6),
})

export const prioritySchema = z.object({
  title: text(80),
  items: z.array(z.object({ label: text(40), impact: z.enum(['high', 'low']), effort: z.enum(['high', 'low']) })).min(2).max(6),
})

export const funnelSchema = z.object({
  title: text(80),
  unit: text(14),
  steps: z.array(z.object({ label: text(40), value: z.number().min(0).max(999999) })).min(2).max(6),
})

export const compareSchema = z.object({
  title: text(80),
  leftLabel: text(24),
  rightLabel: text(24),
  rows: z.array(z.object({ label: text(40), left: text(80), right: text(80) })).min(1).max(5),
})

export const guaranteeStatusSchema = z.enum(['honored', 'pending', 'breached', 'remedied'])

export const guaranteeCardSchema = z.object({
  id: text(40),
  statement: text(240),
  check: text(240),
  deadlineHours: z.number().positive().optional(),
  remedy: text(240),
  status: guaranteeStatusSchema,
  detail: text(160).optional(),
})

export const retestClockSchema = z.object({
  label: text(80),
  startedAt: z.string(),
  deadlineHours: z.number().positive(),
  resolvedAt: z.string().optional(),
  result: z.enum(['pass', 'fail']).optional(),
  remedied: z.boolean().optional(),
})

export const confidenceBarSchema = z.object({
  label: text(80),
  passes: z.number().int().min(0),
  n: z.number().int().min(1),
  confidence: z.number().min(0.5).max(0.999).optional(),
  threshold: z.number().min(0).max(1).optional(),
})

export const approvalGateSchema = z.object({
  action: text(120),
  approver: text(40),
  state: z.enum(['pending', 'approved', 'escalated', 'rejected']),
  note: text(160).optional(),
  at: z.string().optional(),
})

export const componentSchemas = {
  Swimlane: swimlaneSchema,
  Trail: trailSchema,
  Bottlenecks: bottlenecksSchema,
  Priority: prioritySchema,
  Funnel: funnelSchema,
  Compare: compareSchema,
  GuaranteeCard: guaranteeCardSchema,
  RetestClock: retestClockSchema,
  ConfidenceBar: confidenceBarSchema,
  ApprovalGate: approvalGateSchema,
} as const

export type SwimlaneProps = z.input<typeof swimlaneSchema>
export type TrailProps = z.input<typeof trailSchema>
export type BottlenecksProps = z.input<typeof bottlenecksSchema>
export type PriorityProps = z.input<typeof prioritySchema>
export type FunnelProps = z.input<typeof funnelSchema>
export type CompareProps = z.input<typeof compareSchema>
export type GuaranteeCardProps = z.input<typeof guaranteeCardSchema>
export type RetestClockProps = z.input<typeof retestClockSchema>
export type ConfidenceBarProps = z.input<typeof confidenceBarSchema>
export type ApprovalGateProps = z.input<typeof approvalGateSchema>

// Complex components. These take data from your own systems (traces, eval runs, fleet state), not from a
// model, so they are not part of the OpenUI set. The schemas are here so you can validate what you pass in.

export const traceSpanSchema = z.object({
  id: text(40),
  parentId: text(40).optional(),
  name: text(80),
  kind: z.enum(['llm', 'tool', 'retrieval', 'gate', 'human']),
  startMs: z.number().min(0),
  durationMs: z.number().min(0),
  status: z.enum(['ok', 'error', 'blocked']),
  detail: text(240).optional(),
})
export const agentTraceSchema = z.object({ title: text(80), spans: z.array(traceSpanSchema).min(1).max(200) })

export const evalMatrixSchema = z.object({
  title: text(80),
  cases: z.array(z.object({ id: text(40), label: text(80) })).min(1).max(200),
  runs: z.array(z.object({ label: text(40), results: z.record(z.string(), z.boolean()) })).min(2).max(8),
})

export const fleetRowSchema = z.object({
  name: text(60),
  model: text(40).optional(),
  status: z.enum(['ok', 'watch', 'breached']),
  clocks: z.array(z.object({ label: text(60), startedAt: z.string(), deadlineHours: z.number().positive() })).max(10),
})
export const fleetBoardSchema = z.object({ title: text(80), rows: z.array(fleetRowSchema).min(1).max(200) })

export const evidenceDiffSchema = z.object({
  title: text(80),
  before: z.string().max(40000),
  after: z.string().max(40000),
  beforeLabel: text(40).optional(),
  afterLabel: text(40).optional(),
})

export const approvalFlowSchema = z.object({
  title: text(80),
  nodes: z.array(z.object({ id: text(30), label: text(40), kind: z.enum(['step', 'gate', 'end']) })).min(2).max(24),
  edges: z.array(z.object({ from: text(30), to: text(30), label: text(24).optional() })).max(48),
  completed: z.array(z.string()).optional(),
  active: z.string().optional(),
})

export const receiptCardSchema = z.object({
  title: text(80),
  issuedAt: z.string(),
  rows: z.array(z.object({ label: text(40), value: text(120) })).min(1).max(12),
  hash: text(128),
  signers: z.array(z.object({ party: text(40), valid: z.boolean() })).min(1).max(6),
})

export type AgentTraceProps = z.input<typeof agentTraceSchema>
export type TraceSpan = z.input<typeof traceSpanSchema>
export type EvalMatrixProps = z.input<typeof evalMatrixSchema>
export type FleetBoardProps = z.input<typeof fleetBoardSchema>
export type FleetRow = z.input<typeof fleetRowSchema>
export type EvidenceDiffProps = z.input<typeof evidenceDiffSchema>
export type ApprovalFlowProps = z.input<typeof approvalFlowSchema>
export type ReceiptCardProps = z.input<typeof receiptCardSchema>
