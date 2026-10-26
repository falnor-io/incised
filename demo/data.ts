import type { Span } from '../src/components/trace.js'

// A realistic invoice-exception run: planning, parallel lookups, a retried ERP call, a policy gate and a person.
export const traceSpans: Span[] = [
  { id: 'run', name: 'Handle invoice INV-2291', kind: 'agent', startMs: 0, durationMs: 9840, status: 'ok', attrs: { 'agent.version': '2.4.1', 'tenant': 'northwind' } },
  { id: 'plan', parentId: 'run', name: 'Plan next steps', kind: 'llm', startMs: 20, durationMs: 1180, status: 'ok', tokens: { in: 2410, out: 312 }, costUsd: 0.0094, attrs: { model: 'model-x' }, input: { task: 'Resolve exception on INV-2291', context: { vendor: 'Northwind Ltd', amount: 12400, currency: 'USD' } }, output: { plan: ['match to PO', 'verify vendor', 'check approval limit'], confidence: 0.91 } },
  { id: 'po', parentId: 'run', name: 'Look up purchase order', kind: 'retrieval', startMs: 1220, durationMs: 640, status: 'ok', attrs: { index: 'purchase-orders', hits: 3 }, input: { query: 'PO for Northwind, Aug' }, output: { top: { id: 'PO-8810', total: 12400 }, hits: 3 } },
  { id: 'vendor', parentId: 'run', name: 'Fetch vendor record', kind: 'tool', startMs: 1220, durationMs: 3000, status: 'error', attrs: { system: 'erp', 'http.status': 504 }, input: { vendorId: 'V-1042' }, output: { error: 'Gateway timeout after 2.1s' } },
  { id: 'vendor-retry', parentId: 'vendor', name: 'Retry with backoff', kind: 'tool', startMs: 3440, durationMs: 780, status: 'ok', attrs: { attempt: 2, 'http.status': 200 }, output: { vendor: { id: 'V-1042', name: 'Northwind Ltd', status: 'active', bank: { verified: true } } } },
  { id: 'dup', parentId: 'run', name: 'Check for duplicates', kind: 'tool', startMs: 1900, durationMs: 1320, status: 'ok', attrs: { system: 'erp' }, output: { matches: 0 } },
  { id: 'match', parentId: 'run', name: 'Match invoice lines to PO', kind: 'llm', startMs: 4260, durationMs: 1650, status: 'ok', tokens: { in: 5120, out: 640 }, costUsd: 0.0211, attrs: { model: 'model-x' }, output: { lines: 6, matched: 6, variance: 0 } },
  { id: 'limit', parentId: 'run', name: 'Payment over approval limit', kind: 'gate', startMs: 5950, durationMs: 90, status: 'blocked', attrs: { limit: 5000, amount: 12400, policy: 'AP-014 v4' }, output: { decision: 'hold', reason: 'Amount exceeds the $5,000 limit' } },
  { id: 'review', parentId: 'run', name: 'Controller review', kind: 'human', startMs: 6050, durationMs: 3410, status: 'ok', attrs: { reviewer: 'controller', channel: 'queue' }, output: { decision: 'approve', note: 'Matches PO-8810' } },
  { id: 'pay', parentId: 'run', name: 'Release payment', kind: 'tool', startMs: 9480, durationMs: 330, status: 'ok', attrs: { system: 'bank-api' }, output: { reference: 'PAY-77120' } },
  { id: 'log', parentId: 'run', name: 'Write signed record', kind: 'tool', startMs: 9520, durationMs: 290, status: 'ok', attrs: { ledger: 'seq 8' } },
]

const policyBefore = `# Payment approval policy
version: 3
owner: finance-ops

limits:
  auto_approve_under: 500
  require_controller_over: 5000
  currency: USD

rules:
  - id: duplicate
    when: invoice matches an existing invoice
    then: escalate to controller
  - id: new_vendor
    when: vendor is not on the approved list
    then: hold for review
  - id: tax_id
    when: tax id is missing
    then: hold for review

logging:
  record_every_decision: true
  retention_days: 2555

review:
  retest_after_model_release: false
`

const policyAfter = `# Payment approval policy
version: 4
owner: finance-ops

limits:
  auto_approve_under: 200
  require_controller_over: 5000
  currency: USD

rules:
  - id: duplicate
    when: invoice matches an existing invoice
    then: escalate to controller
  - id: total_mismatch
    when: invoice total differs from the purchase order
    then: escalate to controller
  - id: new_vendor
    when: vendor is not on the approved list
    then: hold for review
  - id: tax_id
    when: tax id is missing
    then: hold for review

logging:
  record_every_decision: true
  retention_days: 2555

review:
  retest_after_model_release: true
  retest_deadline_hours: 48
`

const promptBefore = `You approve or hold supplier invoices.
Match each invoice to a purchase order before anything else.
If the amounts differ, explain the difference.
Never release a payment yourself.`

const promptAfter = `You approve or hold supplier invoices.
Match each invoice to a purchase order before anything else.
If the amounts differ, hold the invoice and ask the controller.
Never release a payment yourself.
Quote the policy rule id for every decision.`

export const diffFiles = [
  { path: 'policies/payment-approval.yaml', before: policyBefore, after: policyAfter },
  { path: 'prompts/invoice-agent.txt', before: promptBefore, after: promptAfter },
]
export const diffComments = [
  { path: 'policies/payment-approval.yaml', line: 6, author: 'controller', text: 'Lowering this to $200 doubles what reaches my queue. Agreed for the first month, then review.' },
]

export const flowNodes = [
  { id: 'in', label: 'Invoice received', kind: 'start', owner: 'Agent', status: 'done', detail: 'Parsed from the supplier portal and the mailbox.' },
  { id: 'match', label: 'Match to purchase order', kind: 'step', owner: 'Agent', status: 'done', detail: 'Six lines matched with no variance.' },
  { id: 'dup', label: 'Check for duplicates', kind: 'step', owner: 'Agent', status: 'done' },
  { id: 'limit', label: 'Over the approval limit?', kind: 'gate', owner: 'Agent', status: 'active', detail: 'Policy AP-014 v4: anything over $5,000 goes to the controller.' },
  { id: 'review', label: 'Controller review', kind: 'step', owner: 'Controller', status: 'active', detail: 'Sees the match, the evidence and the exact amount being approved.' },
  { id: 'decide', label: 'Approve?', kind: 'gate', owner: 'Controller', status: 'todo' },
  { id: 'pay', label: 'Release payment', kind: 'end', owner: 'Bank', status: 'todo', detail: 'Paid through the bank API. A signed receipt is written to the record.' },
  { id: 'hold', label: 'Hold and notify supplier', kind: 'end', owner: 'Bank', status: 'todo' },
] as const
export const flowEdges = [
  { from: 'in', to: 'match' }, { from: 'in', to: 'dup' },
  { from: 'match', to: 'limit' }, { from: 'dup', to: 'limit' },
  { from: 'limit', to: 'review', label: 'yes', animated: true }, { from: 'limit', to: 'pay', label: 'no' },
  { from: 'review', to: 'decide' },
  { from: 'decide', to: 'pay', label: 'approved' }, { from: 'decide', to: 'hold', label: 'declined' },
] as const

// Deterministic fake runs, so screenshots and tests are stable.
function rng(seed: number) { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
const rand = rng(7)
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!
export type RunRow = { id: string; deployment: string; model: string; status: string; durationMs: number; costUsd: number; passRate: number; trend: number[]; startedAt: string; steps: number }
export const runRows: RunRow[] = Array.from({ length: 2400 }, (_, i) => {
  const status = rand() < 0.86 ? 'ok' : rand() < 0.6 ? 'blocked' : 'error'
  const base = 40 + rand() * 40
  return {
    id: `run-${String(2400 - i).padStart(4, '0')}`,
    deployment: pick(['AP exceptions', 'Claims intake', 'Referral triage', 'Renewals follow-up', 'Vendor onboarding']),
    model: pick(['model-x', 'model-x.1', 'model-y']),
    status,
    durationMs: Math.round(800 + rand() * 14000 + (status === 'error' ? 9000 : 0)),
    costUsd: Math.round((0.002 + rand() * 0.06) * 10000) / 10000,
    passRate: Math.round((0.72 + rand() * 0.27) * 100) / 100,
    trend: Array.from({ length: 12 }, (_, k) => Math.round(base + Math.sin(k / 2 + i) * 12 + rand() * 8)),
    startedAt: new Date(Date.UTC(2026, 5, 10, 12, 0, 0) - i * 7 * 60_000).toISOString(),
    steps: 3 + Math.floor(rand() * 14),
  }
})

export const spcData = [
  [4, 120], [6, 140], [5, 110], [7, 150], [4, 130], [6, 125], [5, 135], [7, 120], [6, 145], [5, 115], [4, 130], [6, 140],
  [8, 130], [9, 120], [11, 135], [10, 125], [12, 140], [13, 130], [12, 145], [15, 120], [14, 135], [17, 130],
].map(([failures, n], i) => ({ label: `Jun ${i + 1}`, failures: failures!, n: n! }))

export const sankeyNodes = [
  { id: 'in', label: 'Invoices received' },
  { id: 'auto', label: 'Handled by the agent' },
  { id: 'esc', label: 'Sent to a person' },
  { id: 'paid', label: 'Paid', tone: 'good' as const },
  { id: 'held', label: 'Held on a check', tone: 'warn' as const },
  { id: 'ok', label: 'Approved', tone: 'good' as const },
  { id: 'no', label: 'Declined', tone: 'warn' as const },
  { id: 'exp', label: 'Expired unanswered', tone: 'bad' as const },
]
export const sankeyLinks = [
  { source: 'in', target: 'auto', value: 1520 }, { source: 'in', target: 'esc', value: 380 },
  { source: 'auto', target: 'paid', value: 1462 }, { source: 'auto', target: 'held', value: 40 },
  { source: 'esc', target: 'ok', value: 301 }, { source: 'esc', target: 'no', value: 61 }, { source: 'esc', target: 'exp', value: 11 },
]

export const NOW_ISO = '2026-06-10T12:00:00Z'
export const ganttRows = [
  { name: 'AP exceptions', clocks: [
    { label: 'Re-test after release', startedAt: '2026-06-09T06:00:00Z', deadlineHours: 48 },
    { label: 'Root cause, incident 5', startedAt: '2026-06-08T12:00:00Z', deadlineHours: 24, resolvedAt: '2026-06-09T02:00:00Z' },
  ] },
  { name: 'Claims intake', clocks: [
    { label: 'Re-test after release', startedAt: '2026-06-07T00:00:00Z', deadlineHours: 48, resolvedAt: '2026-06-08T18:00:00Z' },
    { label: 'Root cause, incident 7', startedAt: '2026-06-08T08:00:00Z', deadlineHours: 24, resolvedAt: '2026-06-09T20:00:00Z', remedied: true },
  ] },
  { name: 'Referral triage', clocks: [
    { label: 'Re-test after release', startedAt: '2026-06-07T18:00:00Z', deadlineHours: 48 },
  ] },
]

export const heatDays = (() => {
  const r = rng(11)
  const out: { date: string; count: number; breaches: number }[] = []
  const end = Date.UTC(2026, 5, 10)
  for (let i = 0; i < 26 * 7; i++) {
    const ms = end - i * 86_400_000
    const wd = (new Date(ms).getUTCDay() + 6) % 7
    const base = wd >= 5 ? 0.15 : 1
    const count = r() < 0.12 ? 0 : Math.round(base * (2 + r() * 14 + (i < 20 ? 6 : 0)))
    out.push({ date: new Date(ms).toISOString().slice(0, 10), count, breaches: [141, 96, 40, 11].includes(i) ? 1 : 0 })
  }
  return out
})()

export async function buildQueue(digest: (plan: unknown) => Promise<string>) {
  const pay = { action: 'release_payment', invoice: 'INV-2291', amount: 12400, currency: 'USD', to: { vendor: 'Northwind Ltd', account: '••••4821' }, reference: 'PO-8810' }
  const limitV2 = { action: 'change_limit', policy: 'AP-014', field: 'auto_approve_under', from: 500, to: 200 }
  const limitV1 = { ...limitV2, to: 250 }
  const [hPay, hLimit, hLimitOld, hLetter, hFee] = await Promise.all([digest(pay), digest(limitV2), digest(limitV1), digest({ action: 'send_letter', template: 'dispute-short', to: 'ap@northwind.example' }), digest({ action: 'pay_fee', amount: 85 })])
  return [
    { id: 'q1', action: 'Release payment of $12,400.00 to Northwind Ltd', summary: 'Invoice INV-2291 matches PO-8810 on all six lines. It is over the $5,000 limit, so two different people must approve it.', requester: 'agent', amountLabel: '$12,400.00', risk: 'high' as const, plan: pay, needs: 2, reversible: false as const,
      expiresAt: '2026-06-10T18:00:00Z', approveLabel: 'Approve payment of $12,400.00',
      evidence: [{ label: 'Invoice matches the purchase order', ok: true, detail: '6 of 6 lines' }, { label: 'Not a duplicate', ok: true }, { label: 'Vendor bank details verified', ok: true, detail: 'last verified 3 days ago' }, { label: 'Within the vendor payment history', ok: true }],
      decisions: [{ by: 'controller', decision: 'approve' as const, at: '2026-06-10T09:40:00Z', planHash: hPay }] },
    { id: 'q2', action: 'Lower the auto-approve limit from $500 to $200', summary: 'Policy AP-014. Doubles what reaches the controller queue.', requester: 'finance-ops', risk: 'medium' as const, plan: limitV2, needs: 1, reversible: { undoUntil: '2026-06-17T00:00:00Z' },
      evidence: [{ label: 'Change recorded in the policy diff', ok: true }, { label: 'Controller comment resolved', ok: false, detail: 'open since Jun 5' }],
      decisions: [{ by: 'cfo', decision: 'approve' as const, at: '2026-06-09T15:00:00Z', planHash: hLimitOld }] },
    { id: 'q3', action: 'Send the supplier dispute letter', summary: 'Short template, to the supplier accounts address.', requester: 'agent', risk: 'low' as const, plan: { action: 'send_letter', template: 'dispute-short', to: 'ap@northwind.example' }, needs: 1, reversible: false as const,
      evidence: [{ label: 'Template approved', ok: true }, { label: 'Recipient on the supplier record', ok: true }], decisions: [] },
    { id: 'q4', action: 'Pay a late fee of $85.00', summary: 'Asked for yesterday morning and not decided.', requester: 'agent', amountLabel: '$85.00', risk: 'low' as const, plan: { action: 'pay_fee', amount: 85 }, needs: 1, reversible: { undoUntil: '2026-06-11T00:00:00Z' }, expiresAt: '2026-06-10T08:00:00Z',
      evidence: [{ label: 'Fee appears on the supplier statement', ok: true }], decisions: [] },
  ].map((i, k) => ({ ...i, _h: [hPay, hLimit, hLetter, hFee][k] }))
}

// Shadow-mode record for the autonomy gate: what the agent proposed, and what a person decided.
const gateCase = (task: string, i: number, outcome: 'agree' | 'override' | 'abstained', day: number) => ({
  id: `${task.toLowerCase().replace(/ /g, '-')}-${i}`, task, outcome, at: `2026-06-${String(day).padStart(2, '0')}T${String(8 + (i % 9)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00Z`,
})
const run = (task: string, agree: number, override: number, asked = 0) => [
  ...Array.from({ length: agree }, (_, i) => gateCase(task, i, 'agree', 1 + (i % 9))),
  ...Array.from({ length: override }, (_, i) => gateCase(task, agree + i, 'override', 3 + ((i * 2) % 7))),
  ...Array.from({ length: asked }, (_, i) => gateCase(task, agree + override + i, 'abstained', 2 + (i % 5))),
]
export const gateCases = [...run('Invoice matching', 32, 2, 4), ...run('Vendor checks', 17, 1, 2), ...run('Dispute letters', 5, 4)]
export const gateCasesReady = [...run('Invoice matching', 188, 4), ...run('Vendor checks', 74, 1)]

export const evidenceRows = [
  { id: 'e1', field: 'Invoice number', value: 'INV-2291', sources: [{ id: 's1', label: 'Invoice PDF', locator: 'page 1', excerpt: 'Invoice no. INV-2291', read: 'INV-2291', readAt: '2026-06-05T07:58:00Z' }] },
  { id: 'e2', field: 'Vendor', value: 'Northwind Ltd', sources: [
    { id: 's2', label: 'Invoice PDF', locator: 'page 1', excerpt: 'Northwind Ltd, 14 Dock Road', read: 'Northwind Ltd' },
    { id: 's3', label: 'Vendor record V-1042', locator: 'name', read: 'northwind  ltd' },
  ] },
  { id: 'e3', field: 'Amount', value: '$12,400.00', sources: [
    { id: 's4', label: 'Invoice PDF', locator: 'page 2, total', excerpt: 'Total due 12,400.00 USD', read: '12,400.00' },
    { id: 's5', label: 'Purchase order PO-8810', locator: 'line total', excerpt: 'Sum of lines 12,040.00', read: '12,040.00' },
  ] },
  { id: 'e4', field: 'Purchase order', value: 'PO-8810', sources: [{ id: 's6', label: 'Invoice PDF', locator: 'page 1', read: 'PO-8810' }, { id: 's7', label: 'ERP', locator: 'open orders', read: 'PO-8810' }] },
  { id: 'e5', field: 'Bank account', value: 'ending 4821', sources: [{ id: 's8', label: 'Vendor record V-1042', locator: 'bank', read: 'ending 4821' }, { id: 's9', label: 'Invoice PDF', locator: 'page 3', read: 'ending 4821' }] },
  { id: 'e6', field: 'Payment terms', value: 'Net 30', sources: [] },
  { id: 'e7', field: 'Currency', value: 'USD', sources: [{ id: 's10', label: 'Invoice PDF', locator: 'page 2', read: 'USD' }] },
  { id: 'e8', field: 'Due date', value: '2026-07-10', sources: [{ id: 's11', label: 'Invoice PDF', locator: 'page 1', excerpt: 'Due 10 Jul 2026' }] },
]

export const planSteps = [
  { id: 'po', action: 'Look up the purchase order' },
  { id: 'dup', action: 'Check for duplicates' },
  { id: 'vendor', action: 'Fetch the vendor record' },
  { id: 'match', action: 'Match invoice lines to the PO' },
  { id: 'limit', action: 'Check the approval limit' },
  { id: 'pay', action: 'Release the payment' },
  { id: 'log', action: 'Write the signed record' },
]
export const actualSteps = [
  { id: 'a1', action: 'Look up the purchase order', status: 'ok' as const },
  { id: 'a2', action: 'Fetch the vendor record', status: 'error' as const, planId: 'vendor' },
  { id: 'a3', action: 'Check for duplicates', status: 'ok' as const },
  { id: 'a4', action: 'Match invoice lines to the PO', status: 'ok' as const },
  { id: 'a5', action: 'Send a reminder email', status: 'ok' as const },
  { id: 'a6', action: 'Check the approval limit', status: 'blocked' as const },
]

// Extras for the approval workspace. q1 has everything, q3 has an incomplete handoff, the others have nothing extra.
export const chainSteps = [
  { id: 's1', role: 'Finance review', who: 'controller', timeoutMin: 240, escalateTo: 'CFO' },
  { id: 's2', role: 'Second approval', who: 'cfo', timeoutMin: 480 },
]
export const chainDecisions = [{ stepId: 's1', by: 'controller', decision: 'approve' as const, at: '2026-06-10T09:40:00Z' }]
export const lateChainDecisions = [
  { stepId: 's1', by: 'agent', decision: 'approve' as const, at: '2026-06-10T08:05:00Z' },
]
export const handoffFull = {
  summary: 'Matched invoice INV-2291 to PO-8810 and prepared the payment.',
  attempted: ['Looked up PO-8810', 'Checked vendor record V-1042', 'Compared invoice and PO totals'],
  stoppedBecause: 'The invoice total is $360 higher than the PO, and the payment is over the $5,000 limit.',
  recommended: { action: 'Hold the payment and ask the vendor for a corrected invoice', why: 'The PO total is lower, so paying the invoice could overpay by $360.' },
  needsFrom: 'Controller',
  deadline: '2026-06-10T14:00:00Z',
  evidence: [{ label: 'Invoice PDF', ref: 'page 2, total' }, { label: 'Purchase order PO-8810', ref: 'line total' }],
}
export const handoffThin = { summary: 'Prepared a dispute letter to the supplier.', stoppedBecause: 'Letters to suppliers need a person to send them.', needsFrom: 'Finance operations' }
export const workspaceExtras: Record<string, { chain?: { startedAt: string; steps: typeof chainSteps; decisions: typeof chainDecisions }; evidence?: typeof evidenceRows; handoff?: Record<string, unknown> }> = {
  q1: { chain: { startedAt: '2026-06-10T08:00:00Z', steps: chainSteps, decisions: chainDecisions }, evidence: evidenceRows, handoff: handoffFull },
  q3: { handoff: handoffThin },
}

export const grantRows = [
  { id: 'g1', scope: 'payments:release', resource: 'accounts payable', limit: { amount: 15000, unit: 'USD', period: 'day' as const }, used: 12400, grantedBy: 'CFO', grantedAt: '2026-06-01T09:00:00Z' },
  { id: 'g2', scope: 'vendors:update-bank', resource: 'vendor records', grantedBy: 'Controller', grantedAt: '2026-06-03T09:00:00Z', expiresAt: '2026-06-10T20:00:00Z' },
  { id: 'g3', scope: 'email:send', resource: 'vendor contacts', limit: { amount: 50, unit: 'emails', period: 'day' as const }, used: 58, grantedBy: 'Operations lead', grantedAt: '2026-06-02T09:00:00Z' },
  { id: 'g4', scope: 'invoices:read', resource: 'document store', grantedBy: 'Controller', grantedAt: '2026-05-20T09:00:00Z' },
  { id: 'g5', scope: 'payments:release', resource: 'international wires', grantedBy: 'CFO', grantedAt: '2026-05-01T09:00:00Z', revokedAt: '2026-06-08T15:00:00Z' },
]
export const budgetSamples = [
  { at: '2026-06-02T00:00:00Z', used: 90 }, { at: '2026-06-04T00:00:00Z', used: 210 }, { at: '2026-06-06T00:00:00Z', used: 380 },
  { at: '2026-06-08T00:00:00Z', used: 610 }, { at: '2026-06-10T00:00:00Z', used: 860 },
]

export const fleetAgents = [
  { id: 'inv', name: 'Invoice agent', tier: 'T2' as const, cases: gateCasesReady, rule: { rate: 0.9, minCases: 30 }, grants: grantRows,
    budget: { limit: 1500, used: 860, unit: 'USD', periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-07-01T00:00:00Z', samples: budgetSamples } },
  { id: 'ven', name: 'Vendor checks', tier: 'T1' as const, cases: run('Vendor checks', 74, 1), rule: { rate: 0.9, minCases: 30 },
    grants: [{ id: 'v1', scope: 'vendors:read', resource: 'vendor records', grantedBy: 'Controller', grantedAt: '2026-05-20T09:00:00Z' }],
    budget: { limit: 400, used: 90, unit: 'USD', periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-07-01T00:00:00Z' } },
  { id: 'dis', name: 'Dispute letters', tier: 'T3' as const, cases: [...run('Dispute letters', 5, 0), ...run('Dispute letters', 6, 4).slice(6)], rule: { rate: 0.9, minCases: 30 } },
  { id: 'int', name: 'Intake triage', tier: 'T0' as const, cases: run('Intake', 11, 1), rule: { rate: 0.9, minCases: 30 } },
]
