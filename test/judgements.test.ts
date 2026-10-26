import { describe, expect, it } from 'vitest'
import { judgeAutonomy, nextTier, TIERS, type AutonomyCase } from '../src/components/autonomy.js'
import { judgeEvidence, sameValue, type EvidenceRow } from '../src/components/evidence.js'
import { alignPlan } from '../src/components/planactual.js'
import { clopperPearson } from '../src/verify/stats.js'

const cases = (agree: number, override: number, task = 'invoice'): AutonomyCase[] => [
  ...Array.from({ length: agree }, (_, i) => ({ id: `${task}-a${i}`, task, outcome: 'agree' as const, at: `2026-06-01T10:${String(i % 60).padStart(2, '0')}:00Z` })),
  ...Array.from({ length: override }, (_, i) => ({ id: `${task}-o${i}`, task, outcome: 'override' as const, at: `2026-06-02T10:${String(i % 60).padStart(2, '0')}:00Z` })),
]
const rule = { rate: 0.9, minCases: 30 }

describe('judgeAutonomy', () => {
  it('waits for enough cases before saying anything', () => {
    const j = judgeAutonomy(cases(20, 0), rule)
    expect(j.status).toBe('collecting')
    expect(j.need).toBe(10)
  })
  it('does not promote on a point estimate that the interval cannot support', () => {
    // 45 of 50 is 90% observed, but the exact lower bound is under 90%.
    const j = judgeAutonomy(cases(45, 5), rule)
    expect(j.observed).toBeCloseTo(0.9)
    expect(j.status).toBe('stay')
    expect(j.lower).toBeCloseTo(clopperPearson(45, 50, 0.95).lower, 6)
  })
  it('says ready when the lower bound clears the rule', () => {
    const j = judgeAutonomy(cases(300, 5), rule)
    expect(j.status).toBe('ready')
    expect(j.lower).toBeGreaterThanOrEqual(0.9)
  })
  it('does not count abstentions as agreement or as failure', () => {
    const withAsks = [...cases(40, 1), ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, outcome: 'abstained' as const }))]
    const j = judgeAutonomy(withAsks, rule)
    expect(j.n).toBe(41)
    expect(j.abstained).toBe(10)
  })
  it('widens the interval for repeated looks', () => {
    const one = judgeAutonomy(cases(60, 2), rule, 1)
    const five = judgeAutonomy(cases(60, 2), rule, 5)
    expect(five.confidence).toBeGreaterThan(one.confidence)
    expect(five.lower).toBeLessThan(one.lower)
  })
  it('finds a weak task that the overall rate hides', () => {
    const mixed = [...cases(200, 2, 'invoice'), ...cases(3, 6, 'claims')]
    const j = judgeAutonomy(mixed, rule)
    expect(j.tasks[0]?.task).toBe('claims')
    expect(j.tasks[0]?.weak).toBe(true)
    expect(j.tasks.find((t) => t.task === 'invoice')?.weak).toBe(false)
  })
  it('lists the latest overrides first', () => {
    const j = judgeAutonomy(cases(10, 5), rule)
    expect(j.recentOverrides).toHaveLength(3)
    expect(j.recentOverrides[0]!.at! >= j.recentOverrides[2]!.at!).toBe(true)
  })
  it('handles no cases without throwing', () => {
    const j = judgeAutonomy([], rule)
    expect(j.status).toBe('collecting')
    expect(j.lower).toBe(0)
    expect(j.upper).toBe(1)
  })
  it('knows the tier after each tier', () => {
    expect(TIERS).toHaveLength(5)
    expect(nextTier('T0')).toBe('T1')
    expect(nextTier('T4')).toBeNull()
  })
})

describe('judgeEvidence', () => {
  const rows: EvidenceRow[] = [
    { id: '1', field: 'Amount', value: '$12,400.00', sources: [{ id: 's1', label: 'Invoice', read: '12400' }, { id: 's2', label: 'PO', read: '12,400.00' }] },
    { id: '2', field: 'Vendor', value: 'Northwind Ltd', sources: [{ id: 's3', label: 'ERP', read: 'northwind  ltd' }] },
    { id: '3', field: 'Bank account', value: '4821', sources: [{ id: 's4', label: 'Invoice', read: '4812' }] },
    { id: '4', field: 'Payment terms', value: 'Net 30', sources: [] },
  ]
  it('compares money as numbers and words loosely', () => {
    expect(sameValue('$12,400.00', '12400')).toBe(true)
    expect(sameValue('£1,000', '1000.00')).toBe(true)
    expect(sameValue(' Northwind  Ltd ', 'northwind ltd')).toBe(true)
    expect(sameValue('4821', '4812')).toBe(false)
  })
  it('counts sourced, unsourced and conflicting values', () => {
    const { rows: out, summary } = judgeEvidence(rows)
    expect(out.map((r) => r.status)).toEqual(['sourced', 'sourced', 'conflict', 'unsourced'])
    expect(summary).toMatchObject({ total: 4, withSource: 3, unsourced: 1, conflicts: 1 })
    expect(summary.text).toBe('3 of 4 values have a source, 1 in conflict')
  })
  it('names the conflicting source', () => {
    expect(judgeEvidence(rows).rows[2]!.conflicts.map((s) => s.id)).toEqual(['s4'])
  })
  it('handles an empty list', () => {
    expect(judgeEvidence([]).summary.text).toBe('No values yet.')
  })
})

describe('alignPlan', () => {
  const plan = ['po', 'dup', 'vendor', 'match', 'limit', 'pay', 'log'].map((id) => ({ id, action: `step ${id}` }))
  it('says so when everything ran in order', () => {
    const r = alignPlan(plan, plan.map((p) => ({ id: `a-${p.id}`, action: p.action, status: 'ok' as const })))
    expect(r.summary).toBe('Every planned step ran, in order.')
    expect(r.counts).toMatchObject({ asPlanned: 7, done: 7, skipped: 0, extra: 0, outOfOrder: 0 })
  })
  it('finds skipped, failed, blocked, out of order and extra steps', () => {
    const actual = [
      { id: 'a1', action: 'step po', status: 'ok' as const },
      { id: 'a2', action: 'step vendor', status: 'error' as const, planId: 'vendor' },
      { id: 'a3', action: 'step dup', status: 'ok' as const },
      { id: 'a4', action: 'step match', status: 'ok' as const },
      { id: 'a5', action: 'send_email', status: 'ok' as const },
      { id: 'a6', action: 'step limit', status: 'blocked' as const },
    ]
    const r = alignPlan(plan, actual)
    expect(r.rows.map((x) => x.state)).toEqual(['done', 'done', 'failed', 'done', 'blocked', 'skipped', 'skipped'])
    expect(r.rows.find((x) => x.plan.id === 'dup')?.outOfOrder).toBe(true)
    expect(r.extras.map((e) => e.action)).toEqual(['send_email'])
    expect(r.counts).toMatchObject({ planned: 7, asPlanned: 2, done: 3, failed: 1, blocked: 1, skipped: 2, outOfOrder: 1, extra: 1 })
    expect(r.summary).toBe('2 of 7 planned steps ran as planned: 2 skipped, 1 failed, 1 blocked, 1 out of order, 1 not in the plan (send_email).')
  })
  it('uses planId over the action name', () => {
    const r = alignPlan([{ id: 'a', action: 'same' }, { id: 'b', action: 'same' }], [{ id: 'x', action: 'same', status: 'ok', planId: 'b' }])
    expect(r.rows.map((x) => x.state)).toEqual(['skipped', 'done'])
  })
  it('matches one actual step to one plan step only', () => {
    const r = alignPlan([{ id: 'a', action: 'pay' }], [{ id: 'x', action: 'pay', status: 'ok' }, { id: 'y', action: 'pay', status: 'ok' }])
    expect(r.counts.done).toBe(1)
    expect(r.extras.map((e) => e.id)).toEqual(['y'])
  })
  it('reports where in the run each planned step happened', () => {
    const r = alignPlan([{ id: 'a', action: 'one' }, { id: 'b', action: 'two' }], [{ id: 'x', action: 'two', status: 'ok' }, { id: 'y', action: 'one', status: 'ok' }])
    expect(r.rows.map((x) => x.ranAs)).toEqual([2, 1])
    expect(r.rows.map((x) => x.outOfOrder)).toEqual([true, false])
  })
  it('handles an empty plan', () => {
    expect(alignPlan([], []).summary).toBe('No plan was recorded.')
    expect(alignPlan([], [{ id: 'x', action: 'pay', status: 'ok' }]).summary).toBe('No plan was recorded. 1 step ran.')
  })
})

import { summarizeRun } from '../src/components/run.js'
import type { Span } from '../src/components/trace.js'

describe('summarizeRun', () => {
  const sp = (id: string, o: Partial<Span> = {}): Span => ({ id, name: id, kind: 'tool', startMs: 0, durationMs: 100, status: 'ok', ...o })
  it('calls a clean run finished', () => {
    const r = summarizeRun([sp('run', { kind: 'agent', durationMs: 500 }), sp('a', { parentId: 'run' })])
    expect(r.outcome).toBe('finished')
    expect(r.toolCalls).toBe(1)
  })
  it('says stopped when a gate blocked', () => {
    const r = summarizeRun([sp('run', { kind: 'agent', durationMs: 500 }), sp('g', { parentId: 'run', kind: 'gate', status: 'blocked' })])
    expect(r.outcome).toBe('stopped')
    expect(r.outcomeText).toBe('The run stopped at a gate.')
  })
  it('does not call a run with a failed inner span clean', () => {
    const r = summarizeRun([sp('run', { kind: 'agent', durationMs: 500 }), sp('a', { parentId: 'run', status: 'error' })])
    expect(r.outcome).toBe('finished-with-errors')
    expect(r.toolFailures).toBe(1)
  })
  it('adds up tokens and cost and ranks the costliest span', () => {
    const r = summarizeRun([
      sp('run', { kind: 'agent', durationMs: 900 }),
      sp('l1', { parentId: 'run', kind: 'llm', tokens: { in: 100, out: 20 }, costUsd: 0.01 }),
      sp('l2', { parentId: 'run', kind: 'llm', startMs: 200, tokens: { in: 300, out: 40 }, costUsd: 0.03 }),
    ])
    expect(r.tokensIn).toBe(400)
    expect(r.costUsd).toBeCloseTo(0.04)
    expect(r.costliest[0]?.id).toBe('l2')
  })
  it('handles an empty run', () => {
    expect(summarizeRun([]).outcome).toBe('empty')
  })
})

import { judgeChain, type ChainDecision, type ChainStepDef } from '../src/components/chain.js'
import { checkHandoff } from '../src/components/handoff.js'

describe('judgeChain', () => {
  const steps: ChainStepDef[] = [
    { id: 's1', role: 'Finance review', who: 'controller', timeoutMin: 240, escalateTo: 'CFO' },
    { id: 's2', role: 'Second approval', timeoutMin: 480 },
  ]
  const base = { requester: 'agent', startedAt: '2026-06-10T08:00:00Z', steps }
  const d = (stepId: string, by: string, at: string, decision: 'approve' | 'reject' = 'approve'): ChainDecision => ({ stepId, by, decision, at })
  it('waits on the first step and says how long is left', () => {
    const r = judgeChain({ ...base, decisions: [], now: '2026-06-10T09:00:00Z' })
    expect(r.outcome).toBe('waiting')
    expect(r.currentId).toBe('s1')
    expect(r.steps.map((s) => s.status)).toEqual(['waiting', 'upcoming'])
    expect(r.text).toBe('Waiting on controller, 3 h 00 min left.')
  })
  it('opens the next step when the previous one is approved and times it from then', () => {
    const r = judgeChain({ ...base, decisions: [d('s1', 'controller', '2026-06-10T09:40:00Z')], now: '2026-06-10T12:00:00Z' })
    expect(r.steps.map((s) => s.status)).toEqual(['approved', 'waiting'])
    expect(r.steps[1]!.openedAt).toBe('2026-06-10T09:40:00.000Z')
    expect(r.steps[1]!.leftMs).toBe((5 * 60 + 40) * 60000) // 09:40 + 8 h = 17:40, and it is 12:00
  })
  it('goes overdue past the timeout and names who it escalates to', () => {
    const r = judgeChain({ ...base, decisions: [], now: '2026-06-10T13:00:00Z' })
    expect(r.outcome).toBe('overdue')
    expect(r.steps[0]!.status).toBe('overdue')
    expect(r.text).toBe('controller has not answered in time, so it goes to CFO.')
  })
  it('ignores a decision from the requester or from someone who is not the named approver', () => {
    const r = judgeChain({ ...base, decisions: [d('s1', 'agent', '2026-06-10T08:10:00Z'), d('s1', 'intern', '2026-06-10T08:20:00Z')], now: '2026-06-10T09:00:00Z' })
    expect(r.steps[0]!.status).toBe('invalid')
    expect(r.steps[0]!.why).toBe('The person who asked cannot approve their own request.')
    expect(r.outcome).toBe('waiting')
  })
  it('does not let one person approve two steps', () => {
    const r = judgeChain({ ...base, steps: [{ id: 's1', role: 'A', timeoutMin: 60 }, { id: 's2', role: 'B', timeoutMin: 60 }], decisions: [d('s1', 'raj', '2026-06-10T08:10:00Z'), d('s2', 'raj', '2026-06-10T08:20:00Z')], now: '2026-06-10T08:30:00Z' })
    expect(r.steps.map((s) => s.status)).toEqual(['approved', 'invalid'])
    expect(r.steps[1]!.why).toBe('This person already approved an earlier step.')
  })
  it('stops at a rejection and skips the rest', () => {
    const r = judgeChain({ ...base, decisions: [d('s1', 'controller', '2026-06-10T08:30:00Z', 'reject')], now: '2026-06-10T09:00:00Z' })
    expect(r.outcome).toBe('rejected')
    expect(r.steps.map((s) => s.status)).toEqual(['rejected', 'skipped'])
  })
  it('is approved only when every step is', () => {
    const r = judgeChain({ ...base, decisions: [d('s1', 'controller', '2026-06-10T08:30:00Z'), d('s2', 'cfo', '2026-06-10T09:00:00Z')], now: '2026-06-10T09:30:00Z' })
    expect(r.outcome).toBe('approved')
    expect(r.text).toBe('Approved by 2 people, in order.')
  })
})

describe('checkHandoff', () => {
  const full = {
    summary: 'Matched the invoice to the PO.', attempted: ['Looked up the PO'], stoppedBecause: 'The totals differ.',
    recommended: { action: 'Hold the payment', why: 'It could overpay.' }, needsFrom: 'Controller', deadline: '2026-06-10T14:00:00Z', evidence: [{ label: 'Invoice page 2' }],
  }
  it('is complete when a person could act without asking', () => {
    const c = checkHandoff(full, '2026-06-10T12:00:00Z')
    expect(c.complete).toBe(true)
    expect(c.leftMs).toBe(2 * 3600000)
    expect(c.late).toBe(false)
  })
  it('lists exactly what is missing', () => {
    const c = checkHandoff({ summary: 'x', stoppedBecause: ' ', attempted: [], needsFrom: 'Controller', evidence: [] }, '2026-06-10T12:00:00Z')
    expect(c.missing).toEqual(['what it tried', 'why it stopped', 'a recommendation', 'a deadline', 'evidence to check'])
    expect(c.text).toBe('Incomplete: missing what it tried, why it stopped, a recommendation, a deadline, evidence to check. A person would have to ask the agent.')
  })
  it('says when the deadline has passed', () => {
    expect(checkHandoff(full, '2026-06-10T15:00:00Z').late).toBe(true)
  })
})

import { amount, judgeGrants, type Grant } from '../src/components/permissions.js'
import { judgeBudget } from '../src/components/budget.js'

describe('judgeGrants', () => {
  const now = '2026-06-10T12:00:00Z'
  const g = (id: string, o: Partial<Grant> = {}): Grant => ({ id, scope: `scope:${id}`, grantedBy: 'cfo', grantedAt: '2026-06-01T00:00:00Z', ...o })
  it('formats money and other units', () => {
    expect(amount(5000, 'USD')).toBe('$5,000')
    expect(amount(12.5, 'GBP')).toBe('£12.5')
    expect(amount(40, 'tickets')).toBe('40 tickets')
  })
  it('tells active, expiring, used up, over, expired and revoked apart', () => {
    const { rows, summary } = judgeGrants([
      g('ok', { limit: { amount: 5000, unit: 'USD', period: 'day' }, used: 1200 }),
      g('soon', { expiresAt: '2026-06-10T20:00:00Z' }),
      g('full', { limit: { amount: 100, unit: 'USD', period: 'week' }, used: 100 }),
      g('over', { limit: { amount: 100, unit: 'USD', period: 'week' }, used: 130 }),
      g('old', { expiresAt: '2026-06-08T12:00:00Z' }),
      g('gone', { revokedAt: '2026-06-09T12:00:00Z' }),
    ], now)
    expect(Object.fromEntries(rows.map((r) => [r.grant.id, r.status]))).toEqual({ ok: 'active', soon: 'expiring', full: 'exhausted', over: 'over', old: 'expired', gone: 'revoked' })
    expect(rows.map((r) => r.grant.id)).toEqual(['over', 'full', 'soon', 'ok', 'old', 'gone'])
    expect(summary.attention).toBe(3)
    expect(summary.text).toBe('4 in force, 1 over the limit, 1 used up, 1 expiring soon, 1 expired, 1 revoked')
  })
  it('says what is left and why', () => {
    const r = judgeGrants([g('ok', { limit: { amount: 5000, unit: 'USD', period: 'day' }, used: 1200 })], now).rows[0]!
    expect(r.remaining).toBe(3800)
    expect(r.share).toBeCloseTo(0.24)
    expect(r.why).toBe('$3,800 left this day.')
  })
  it('lets revocation beat everything else', () => {
    const r = judgeGrants([g('x', { revokedAt: '2026-06-10T00:00:00Z', limit: { amount: 1, unit: 'USD', period: 'total' }, used: 5 })], now).rows[0]!
    expect(r.status).toBe('revoked')
  })
  it('does not count a revocation that is in the future', () => {
    expect(judgeGrants([g('x', { revokedAt: '2026-06-11T00:00:00Z' })], now).rows[0]!.status).toBe('active')
  })
})

describe('judgeBudget', () => {
  const period = { periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-06-11T00:00:00Z', unit: 'USD' }
  it('is fine when use is steady and well under the limit', () => {
    const r = judgeBudget({ ...period, limit: 1000, used: 300, now: '2026-06-06T00:00:00Z' })
    expect(r.status).toBe('ok')
    expect(r.projected).toBeCloseTo(600)
    expect(r.elapsedShare).toBeCloseTo(0.5)
  })
  it('warns when the straight-line rate runs out before the period ends', () => {
    const r = judgeBudget({ ...period, limit: 1000, used: 700, now: '2026-06-06T00:00:00Z' })
    expect(r.status).toBe('over-pace')
    expect(new Date(r.runsOutAt!).getTime()).toBeGreaterThan(new Date('2026-06-06T00:00:00Z').getTime())
    expect(new Date(r.runsOutAt!).getTime()).toBeLessThan(new Date('2026-06-11T00:00:00Z').getTime())
    expect(r.text).toMatch(/before the period ends/)
  })
  it('says watch when it ends close to the limit', () => {
    expect(judgeBudget({ ...period, limit: 1000, used: 450, now: '2026-06-06T00:00:00Z' }).status).toBe('watch')
  })
  it('says over once the limit is passed', () => {
    const r = judgeBudget({ ...period, limit: 1000, used: 1100, now: '2026-06-06T00:00:00Z' })
    expect(r.status).toBe('over')
    expect(r.text).toBe('Over the limit by 100 USD.')
  })
  it('uses the recent rate when there are samples, not the average', () => {
    // 100 used in the first five days, then 50 a day since: the recent rate is higher than the average.
    const samples = [
      { at: '2026-06-06T00:00:00Z', used: 100 }, { at: '2026-06-07T00:00:00Z', used: 150 },
      { at: '2026-06-08T00:00:00Z', used: 200 }, { at: '2026-06-09T00:00:00Z', used: 250 },
    ]
    const r = judgeBudget({ ...period, limit: 1000, used: 250, samples, now: '2026-06-09T00:00:00Z' })
    expect(r.rate).toBeCloseTo(50 / 24, 6)
    expect(r.projected).toBeCloseTo(250 + 2 * 50, 4)
  })
  it('never projects a negative rate', () => {
    const samples = [{ at: '2026-06-02T00:00:00Z', used: 300 }, { at: '2026-06-03T00:00:00Z', used: 200 }, { at: '2026-06-04T00:00:00Z', used: 100 }]
    expect(judgeBudget({ ...period, limit: 1000, used: 100, samples, now: '2026-06-05T00:00:00Z' }).rate).toBe(0)
  })
  it('does not divide by zero before the period starts', () => {
    const r = judgeBudget({ ...period, limit: 1000, used: 0, now: '2026-05-30T00:00:00Z' })
    expect(r.rate).toBe(0)
    expect(r.status).toBe('ok')
  })
})

import { judgeFleet, type FleetAgent } from '../src/components/fleet.js'

describe('judgeFleet', () => {
  const now = '2026-06-10T12:00:00Z'
  const cases = (agree: number, override: number, at = '2026-06-01T10:00:00Z') => [
    ...Array.from({ length: agree }, (_, i) => ({ id: `a${i}`, outcome: 'agree' as const, at })),
    ...Array.from({ length: override }, (_, i) => ({ id: `o${i}`, outcome: 'override' as const, at })),
  ]
  const agent = (id: string, o: Partial<FleetAgent> = {}): FleetAgent => ({ id, name: id, tier: 'T2', cases: cases(200, 2), rule: { rate: 0.9, minCases: 30 }, ...o })
  it('marks an agent eligible only when the gate says so, and names the next tier', () => {
    const { rows } = judgeFleet([agent('a'), agent('b', { cases: cases(10, 0) })], now)
    expect(rows.find((r) => r.agent.id === 'a')!.eligibleFor).toBe('T3')
    expect(rows.find((r) => r.agent.id === 'b')!.eligibleFor).toBeNull()
  })
  it('has nothing to be eligible for at the top tier', () => {
    expect(judgeFleet([agent('a', { tier: 'T4' })], now).rows[0]!.eligibleFor).toBeNull()
  })
  it('flags a budget that will run out, an over-limit grant and recent overrides', () => {
    const a = agent('a', {
      budget: { limit: 1000, used: 900, unit: 'USD', periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-06-11T00:00:00Z' },
      grants: [{ id: 'g', scope: 'x', grantedBy: 'cfo', grantedAt: '2026-06-01T00:00:00Z', limit: { amount: 5, unit: 'emails', period: 'day' }, used: 9 }],
      cases: [...cases(100, 0), ...cases(0, 3, '2026-06-09T10:00:00Z')],
    })
    const r = judgeFleet([a], now).rows[0]!
    expect(r.flags.map((f) => f.kind).sort()).toEqual(['budget', 'grant', 'overrides'])
    expect(r.flags.find((f) => f.kind === 'grant')!.text).toBe('1 grant over the limit.')
  })
  it('does not flag overrides for an agent that only suggests, or old ones', () => {
    expect(judgeFleet([agent('a', { tier: 'T0', cases: cases(5, 3, '2026-06-09T10:00:00Z') })], now).rows[0]!.flags).toEqual([])
    expect(judgeFleet([agent('b', { cases: [...cases(50, 0), ...cases(0, 3, '2026-05-01T10:00:00Z')] })], now).rows[0]!.flags).toEqual([])
  })
  it('sorts serious flags first, then warnings, then eligible, then the rest', () => {
    const bad = agent('bad', { grants: [{ id: 'g', scope: 'x', grantedBy: 'c', grantedAt: '2026-06-01T00:00:00Z', limit: { amount: 1, unit: 'u', period: 'day' }, used: 2 }] })
    const warn = agent('warn', { grants: [{ id: 'g', scope: 'x', grantedBy: 'c', grantedAt: '2026-06-01T00:00:00Z', expiresAt: '2026-06-10T20:00:00Z' }] })
    const eligible = agent('eligible')
    const quiet = agent('quiet', { cases: cases(5, 0) })
    expect(judgeFleet([quiet, eligible, warn, bad], now).rows.map((r) => r.agent.id)).toEqual(['bad', 'warn', 'eligible', 'quiet'])
  })
  it('summarises in words', () => {
    const { summary } = judgeFleet([agent('a'), agent('b', { cases: cases(5, 0) })], now)
    expect(summary.text).toBe('2 agents, 1 eligible for a higher tier')
  })
  it('handles an empty fleet', () => {
    expect(judgeFleet([], now).summary.text).toBe('0 agents')
  })
})

describe('unreadable input fails closed', () => {
  const now = '2026-06-10T12:00:00Z'
  it('a grant whose end date cannot be read is not counted as in force', () => {
    const r = judgeGrants([{ id: 'g', scope: 's', grantedBy: 'x', grantedAt: '2026-06-01T00:00:00Z', expiresAt: 'soon' }], now).rows[0]!
    expect(r.status).toBe('expired')
    expect(r.why).toMatch(/could not be read/)
  })
  it('a grant whose revocation date cannot be read counts as revoked', () => {
    expect(judgeGrants([{ id: 'g', scope: 's', grantedBy: 'x', grantedAt: '2026-06-01T00:00:00Z', revokedAt: '??' }], now).rows[0]!.status).toBe('revoked')
  })
  it('a zero limit is used up when nothing is used and over when anything is', () => {
    const lim = { amount: 0, unit: 'USD', period: 'day' as const }
    expect(judgeGrants([{ id: 'a', scope: 's', grantedBy: 'x', grantedAt: '2026-06-01T00:00:00Z', limit: lim, used: 0 }], now).rows[0]!.status).toBe('exhausted')
    expect(judgeGrants([{ id: 'a', scope: 's', grantedBy: 'x', grantedAt: '2026-06-01T00:00:00Z', limit: lim, used: 3 }], now).rows[0]!.status).toBe('over')
  })
  it('a budget with unreadable dates says so and works out no pace', () => {
    const r = judgeBudget({ limit: 100, used: 40, unit: 'USD', periodStart: 'x', periodEnd: 'y', now })
    expect(r.status).toBe('unreadable')
    expect(r.rate).toBe(0)
  })
  it('a chain with an unreadable start time checks no time limit and says why', async () => {
    const { judgeChain } = await import('../src/components/chain.js')
    const r = judgeChain({ requester: 'a', startedAt: 'nope', steps: [{ id: 's', role: 'cfo', timeoutMin: 60 }], decisions: [], now })
    expect(r.outcome).toBe('waiting')
    expect(r.steps[0]!.leftMs).toBeUndefined()
    expect(r.problem).toMatch(/start time could not be read/)
  })
})

import { cleanValues, initialValues, validateInput, type Field } from '../src/components/inputform.js'

describe('input request validation', () => {
  const fields: Field[] = [
    { name: 'pay', label: 'Payment', type: 'select', required: true, options: ['a', 'b'] },
    { name: 'amount', label: 'Amount', type: 'currency', required: true, min: 1, max: 100 },
    { name: 'ok', label: 'Ok', type: 'checkbox', required: true },
    { name: 'note', label: 'Note', type: 'textarea' },
    { name: 'qty', label: 'Qty', type: 'number' },
  ]
  it('starts empty, with a checkbox unchecked and defaults kept', () => {
    expect(initialValues([...fields, { name: 'x', label: 'x', type: 'text', default: 'hi' }])).toMatchObject({ ok: false, x: 'hi', pay: undefined })
  })
  it('names each field that is missing or wrong', () => {
    expect(validateInput(fields, initialValues(fields))).toEqual({ pay: 'Required.', amount: 'Required.', ok: 'This has to be ticked.' })
    expect(validateInput(fields, { pay: 'c', amount: 'abc', ok: true })).toEqual({ pay: 'Choose one of the options.', amount: 'Enter a number.' })
    expect(validateInput(fields, { pay: 'a', amount: 0, ok: true })).toEqual({ amount: 'At least 1.' })
    expect(validateInput(fields, { pay: 'a', amount: 101, ok: true })).toEqual({ amount: 'At most 100.' })
    expect(validateInput(fields, { pay: 'a', amount: -5, ok: true, qty: Infinity })).toEqual({ amount: 'An amount cannot be negative.', qty: 'Enter a number.' })
  })
  it('treats spaces as blank', () => {
    expect(validateInput(fields, { pay: '  ', amount: 5, ok: true }).pay).toBe('Required.')
  })
  it('does not accept two fields with one name', () => {
    expect(validateInput([{ name: 'a', label: 'A', type: 'text' }, { name: 'a', label: 'B', type: 'text' }], {})).toEqual({ a: 'Two fields share this name.' })
  })
  it('cleans numbers and text, and leaves out a blank optional field', () => {
    expect(cleanValues(fields, { pay: 'a', amount: '12.50', ok: true, note: '  hello  ', qty: '' })).toEqual({ pay: 'a', amount: 12.5, ok: true, note: 'hello' })
  })
  it('refuses to clean an invalid form', () => {
    expect(() => cleanValues(fields, {})).toThrow(/not valid/)
  })
})

import { autonomyStatement, previousTier } from '../src/components/autonomy.js'

describe('autonomy: stepping down, blockers and the statement', () => {
  const day = (i: number) => `2026-06-${String(1 + Math.floor(i / 10)).padStart(2, '0')}T${String(8 + (i % 10)).padStart(2, '0')}:00:00Z`
  /** Oldest first: `early` agree, then `late` cases of which `lateAgree` agree. */
  const history = (early: number, late: number, lateAgree: number, task = 't'): AutonomyCase[] => [
    ...Array.from({ length: early }, (_, i) => ({ id: `e${i}`, task, outcome: 'agree' as const, at: day(i) })),
    ...Array.from({ length: late }, (_, i) => ({ id: `l${i}`, task, outcome: i < lateAgree ? ('agree' as const) : ('override' as const), at: day(early + i) })),
  ]
  const rule = { rate: 0.9, minCases: 30 }

  it('steps down when even the best case over the latest window misses the rule', () => {
    const j = judgeAutonomy(history(200, 30, 18), rule, 1, 'T3')
    expect(j.status).toBe('demote')
    expect(j.recent!.n).toBe(30)
    expect(j.recent!.upper).toBeLessThan(0.9)
    expect(j.reason).toMatch(/Step down/)
  })
  it('does not step down on a bad patch that could still be noise', () => {
    // 27 of 30 is 90% observed: its upper bound is well over the rule.
    expect(judgeAutonomy(history(200, 30, 27), rule, 1, 'T3').status).not.toBe('demote')
  })
  it('does not step down at T0, without a tier, or with less than a full window', () => {
    expect(judgeAutonomy(history(200, 30, 10), rule, 1, 'T0').status).not.toBe('demote')
    expect(judgeAutonomy(history(200, 30, 10), rule).status).not.toBe('demote')
    expect(judgeAutonomy(history(0, 20, 5), rule, 1, 'T3').status).not.toBe('demote')
  })
  it('leaves a gap between promoting and stepping down, so an agent does not flap', () => {
    // Lower bound under the rule (cannot promote) but upper bound over it (cannot step down).
    const j = judgeAutonomy(history(0, 40, 36), rule, 1, 'T2')
    expect(j.lower).toBeLessThan(0.9)
    expect(j.upper).toBeGreaterThan(0.9)
    expect(j.status).toBe('stay')
  })
  it('judges the latest cases by time even when they arrive out of order', () => {
    const shuffled = [...history(200, 30, 18)].reverse()
    expect(judgeAutonomy(shuffled, rule, 1, 'T3').status).toBe('demote')
  })
  it('blocks a pass when a critical task is weak, however good the total is', () => {
    const cases = [...history(300, 0, 0, 'invoices'), ...Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, task: 'disputes', outcome: i < 5 ? ('agree' as const) : ('override' as const), at: day(i) }))]
    const j = judgeAutonomy(cases, { ...rule, critical: ['disputes'] }, 1, 'T2')
    expect(j.status).toBe('stay')
    expect(j.blockers[0]).toBe('disputes is a critical task and agrees 50% of the time, under the 90% rule.')
    expect(judgeAutonomy(cases, rule, 1, 'T2').status).toBe('ready')
  })
  it('blocks a pass for a critical task it has barely seen', () => {
    const j = judgeAutonomy(history(300, 0, 0), { ...rule, critical: ['disputes'] }, 1, 'T2')
    expect(j.status).toBe('stay')
    expect(j.blockers[0]).toMatch(/0 of 5 cases needed/)
  })
  it('blocks a pass until the required controls are in place', () => {
    const j = judgeAutonomy(history(300, 0, 0), { ...rule, controls: [{ label: 'incident process', done: false }, { label: 'monitoring', done: true }] }, 1, 'T2')
    expect(j.status).toBe('stay')
    expect(j.blockers).toEqual(['Not in place yet: incident process.'])
  })
  it('does not count approvals made too fast to be a review', () => {
    const timed = history(100, 0, 0).map((c, i) => ({ ...c, reviewMs: i % 10 === 0 ? 20000 : 1500 }))
    const j = judgeAutonomy(timed, { ...rule, reviewFloor: { underMs: 5000, maxShare: 0.5 } }, 1, 'T2')
    expect(j.status).toBe('stay')
    expect(j.hurried).toEqual({ fast: 27, of: 30, underMs: 5000 })
    expect(j.blockers[0]).toMatch(/too fast to be a review/)
    const careful = history(100, 0, 0).map((c) => ({ ...c, reviewMs: 20000 }))
    expect(judgeAutonomy(careful, { ...rule, reviewFloor: { underMs: 5000, maxShare: 0.5 } }, 1, 'T2').status).toBe('ready')
  })
  it('reports how often the agent asked and how often a person overrode it', () => {
    const cases = [...history(40, 10, 5), ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, outcome: 'abstained' as const }))]
    const j = judgeAutonomy(cases, rule)
    expect(j.askRate).toBeCloseTo(10 / 60)
    expect(j.overrideRate).toBeCloseTo(5 / 50)
  })
  it('names the tier below', () => {
    expect(previousTier('T3')).toBe('T2')
    expect(previousTier('T0')).toBeNull()
  })
  it('makes a statement with a digest that changes when any case does', async () => {
    const base = { agent: 'invoice', tier: 'T2' as const, rule, issuedAt: '2026-06-10T00:00:00Z' }
    const a = await autonomyStatement({ ...base, cases: history(100, 0, 0) })
    const b = await autonomyStatement({ ...base, cases: history(100, 0, 0) })
    const c = await autonomyStatement({ ...base, cases: history(99, 1, 0) })
    expect(a.digest).toBe(b.digest)
    expect(a.digest).not.toBe(c.digest)
    expect(a.body).toMatchObject({ verdict: 'ready', next: 'T3', tier: 'T2' })
    expect(a.digest).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('budget burn rate', () => {
  const period = { periodStart: '2026-06-01T00:00:00Z', periodEnd: '2026-06-11T00:00:00Z', unit: 'USD', limit: 1000 }
  it('is 1x when spending exactly the steady rate and 2x when spending twice that', () => {
    expect(judgeBudget({ ...period, used: 500, now: '2026-06-06T00:00:00Z' }).burnLong).toBeCloseTo(1)
    expect(judgeBudget({ ...period, used: 1000 - 1, now: '2026-06-06T00:00:00Z' }).burnLong).toBeCloseTo(1.998, 2)
  })
  it('reads the recent window apart from the period average', () => {
    const samples = [{ at: '2026-06-04T00:00:00Z', used: 100 }, { at: '2026-06-05T00:00:00Z', used: 150 }, { at: '2026-06-06T00:00:00Z', used: 400 }]
    const r = judgeBudget({ ...period, used: 400, samples, now: '2026-06-06T00:00:00Z' })
    expect(r.burnLong).toBeCloseTo(0.8)
    expect(r.burnShort).toBeCloseTo(1.5)
    expect(r.burnShort).toBeGreaterThan(r.burnLong)
  })
  it('is only critical when both windows are at twice the pace, so a spike alone is not', () => {
    const spike = [{ at: '2026-06-04T00:00:00Z', used: 100 }, { at: '2026-06-05T00:00:00Z', used: 110 }, { at: '2026-06-06T00:00:00Z', used: 300 }]
    expect(judgeBudget({ ...period, used: 300, samples: spike, now: '2026-06-06T00:00:00Z' }).level).toBe('ok')
    const sustained = [{ at: '2026-06-02T00:00:00Z', used: 100 }, { at: '2026-06-03T00:00:00Z', used: 350 }, { at: '2026-06-04T00:00:00Z', used: 650 }]
    const r = judgeBudget({ ...period, used: 650, samples: sustained, now: '2026-06-04T00:00:00Z' })
    expect(r.burnLong).toBeGreaterThan(2)
    expect(r.burnShort).toBeGreaterThan(2)
    expect(r.level).toBe('critical')
  })
  it('warns at 25% left and is critical at 10% left whatever the pace', () => {
    expect(judgeBudget({ ...period, used: 760, now: '2026-06-10T12:00:00Z' }).level).toBe('warn')
    expect(judgeBudget({ ...period, used: 910, now: '2026-06-10T12:00:00Z' }).level).toBe('critical')
    expect(judgeBudget({ ...period, used: 100, now: '2026-06-10T12:00:00Z' }).remainingShare).toBeCloseTo(0.9)
  })
  it('has no burn rate for a zero limit and does not throw', () => {
    const r = judgeBudget({ ...period, limit: 0, used: 0, now: '2026-06-06T00:00:00Z' })
    expect(r.burnLong).toBe(0)
    expect(Number.isFinite(r.burnShort)).toBe(true)
  })
})

import { checkSource } from '../src/components/evidence.js'

describe('evidence: quotes and omissions', () => {
  const docs = { inv: 'Invoice no. INV-2291\nTotal due 12,400.00 USD\nDue 10 Jul 2026', po: 'Sum of lines 12,040.00' }
  const row = (id: string, field: string, value: string, sources: EvidenceRow['sources']): EvidenceRow => ({ id, field, value, sources })
  it('finds a quote in its document, ignoring case, line breaks and curly quotes', () => {
    expect(checkSource({ id: 's', label: 'x', docId: 'inv', excerpt: 'total   DUE 12,400.00\nusd' }, docs).quote).toBe('found')
    expect(checkSource({ id: 's', label: 'x', docId: 'q', excerpt: 'it’s' }, { q: "It's here" }).quote).toBe('found')
  })
  it('flags a quote that is not in the document', () => {
    expect(checkSource({ id: 's', label: 'x', docId: 'inv', excerpt: 'Total due 14,400.00 USD' }, docs).quote).toBe('not-found')
  })
  it('does not guess when there is nothing to look in', () => {
    expect(checkSource({ id: 's', label: 'x', excerpt: 'anything' }, docs).quote).toBe('unchecked')
    expect(checkSource({ id: 's', label: 'x', docId: 'missing', excerpt: 'anything' }, docs).quote).toBe('unchecked')
    expect(checkSource({ id: 's', label: 'x', docId: 'inv' }, docs).quote).toBe('unchecked')
  })
  it('checks that the quote contains the value the source is said to read', () => {
    expect(checkSource({ id: 's', label: 'x', excerpt: 'Total due 12,400.00 USD', read: '12400' }).excerptHasRead).toBe(true)
    expect(checkSource({ id: 's', label: 'x', excerpt: 'Total due 12,400.00 USD', read: '14,400.00' }).excerptHasRead).toBe(false)
    expect(checkSource({ id: 's', label: 'x', excerpt: 'Pay to Northwind Ltd', read: 'northwind' }).excerptHasRead).toBe(true)
    expect(checkSource({ id: 's', label: 'x', read: '5' }).excerptHasRead).toBeNull()
  })
  it('marks a row unverified when a quote is not in its document, below conflict in rank', () => {
    const rows = [
      row('a', 'Amount', '$12,400.00', [{ id: 's1', label: 'PDF', docId: 'inv', excerpt: 'Total due 99.00 USD', read: '99' }]),
      row('b', 'Due', '2026-07-10', [{ id: 's2', label: 'PDF', docId: 'inv', excerpt: 'Due 10 Jul 2026' }]),
    ]
    const r = judgeEvidence(rows, { documents: docs })
    expect(r.rows[0]!.status).toBe('conflict')
    expect(r.rows[1]!.status).toBe('sourced')
    const only = judgeEvidence([row('a', 'Amount', '$99', [{ id: 's1', label: 'PDF', docId: 'inv', excerpt: 'Total due 99.00 USD' }])], { documents: docs })
    expect(only.rows[0]!.status).toBe('unverified')
    expect(only.summary.unverified).toBe(1)
    expect(only.summary.text).toBe('1 of 1 values have a source, 1 with a quote that is not in the document')
  })
  it('names values in the source that were not extracted', () => {
    const r = judgeEvidence([row('a', 'Amount', '5', [])], { available: [{ id: 'x1', field: 'amount', value: '5' }, { id: 'x2', field: 'Currency', value: 'USD', locator: 'page 2' }] })
    expect(r.omitted.map((o) => o.field)).toEqual(['Currency'])
    expect(r.summary.omitted).toBe(1)
    expect(r.summary.text).toBe('0 of 1 values have a source, 1 in the source not extracted')
  })
  it('behaves as before with no options', () => {
    expect(judgeEvidence([row('a', 'A', '1', [{ id: 's', label: 'x' }])]).summary.text).toBe('1 of 1 values have a source')
  })
})

import { fieldsFromJsonSchema, linkInfo, looksSecret, splitSecretFields } from '../src/components/inputform.js'

describe('input request and MCP elicitation', () => {
  const schema = {
    type: 'object',
    required: ['name', 'color'],
    properties: {
      name: { type: 'string', title: 'Display name', minLength: 3, maxLength: 50, description: 'Shown to others.' },
      email: { type: 'string', format: 'email' },
      site: { type: 'string', format: 'uri' },
      born: { type: 'string', format: 'date' },
      age: { type: 'integer', minimum: 18, maximum: 99 },
      news: { type: 'boolean', default: true },
      color: { type: 'string', enum: ['Red', 'Green'], default: 'Red' },
      tier: { type: 'string', oneOf: [{ const: 'p', title: 'Pro' }, { const: 'f', title: 'Free' }] },
      when: { type: 'string', format: 'date-time' },
      address: { type: 'object' },
      tags: { type: 'array' },
    },
  }
  it('reads flat properties into fields and names what it could not show', () => {
    const { fields, unsupported } = fieldsFromJsonSchema(schema)
    expect(fields.map((f) => [f.name, f.type])).toEqual([
      ['name', 'text'], ['email', 'email'], ['site', 'url'], ['born', 'date'], ['age', 'number'], ['news', 'checkbox'], ['color', 'select'], ['tier', 'select'],
    ])
    expect(unsupported).toEqual(['when', 'address', 'tags'])
  })
  it('keeps required, limits, defaults, help and option titles', () => {
    const f = Object.fromEntries(fieldsFromJsonSchema(schema).fields.map((x) => [x.name, x]))
    expect(f.name).toMatchObject({ label: 'Display name', required: true, minLength: 3, maxLength: 50, help: 'Shown to others.' })
    expect(f.age).toMatchObject({ min: 18, max: 99, required: false })
    expect(f.news!.default).toBe(true)
    expect(f.color).toMatchObject({ options: ['Red', 'Green'], default: 'Red', required: true })
    expect(f.tier).toMatchObject({ options: ['p', 'f'], optionLabels: { p: 'Pro', f: 'Free' } })
  })
  it('checks the new field types', () => {
    const { fields } = fieldsFromJsonSchema(schema)
    const ok = { name: 'Sam', email: 'a@b.co', site: 'https://x.io', born: '1990-02-03', age: 30, news: true, color: 'Red', tier: 'p' }
    expect(validateInput(fields, ok)).toEqual({})
    expect(validateInput(fields, { ...ok, name: 'Al', email: 'nope', site: 'ftp:/x', born: '1990-13-45', age: 12 })).toEqual({
      name: 'At least 3 characters.', email: 'Enter an email address.', site: 'Enter a web address starting with http:// or https://.', born: 'That is not a real date.', age: 'At least 18.',
    })
    expect(validateInput(fields, { ...ok, born: '3 Feb 1990' }).born).toBe('Use the form 2026-06-10.')
  })
  it('refuses to collect anything that looks like a secret', () => {
    for (const label of ['Password', 'API key', 'Access token', 'Card number', 'CVV', 'Private key', 'Social security number', 'PIN']) {
      expect(looksSecret({ name: 'x', label })).toBe(true)
    }
    expect(looksSecret({ name: 'api_key', label: 'Key' })).toBe(true)
    for (const label of ['Display name', 'Email', 'Payment to reverse', 'Spinning']) expect(looksSecret({ name: 'x', label })).toBe(false)
    const { allowed, refused } = splitSecretFields([{ name: 'a', label: 'Name', type: 'text' }, { name: 'p', label: 'Password', type: 'text' }])
    expect(allowed.map((f) => f.name)).toEqual(['a'])
    expect(refused.map((f) => f.name)).toEqual(['p'])
  })
  it('offers only plain https links to a named site, and says where it goes', () => {
    expect(linkInfo('https://auth.example.com/connect?x=1')).toEqual({ ok: true, host: 'auth.example.com', href: 'https://auth.example.com/connect?x=1' })
    expect(linkInfo('http://example.com')).toMatchObject({ ok: false })
    expect(linkInfo('https://good.com@evil.example/')).toMatchObject({ ok: false, reason: expect.stringMatching(/hides where it goes/) })
    expect(linkInfo('https://192.168.0.1/login')).toMatchObject({ ok: false })
    expect(linkInfo('javascript:alert(1)')).toMatchObject({ ok: false })
    expect(linkInfo('not a url')).toMatchObject({ ok: false })
  })
})

import { covers } from '../src/components/permissions.js'

describe('permission grants: delegation, dormancy and setup', () => {
  const now = '2026-06-10T12:00:00Z'
  const base = { id: 'g', scope: 'payments:release', grantedBy: 'cfo', grantedAt: '2026-05-01T00:00:00Z' }
  it('matches a scope exactly, by prefix wildcard or by *', () => {
    expect(covers(['payments:*'], 'payments:release')).toBe(true)
    expect(covers(['payments:release'], 'payments:release')).toBe(true)
    expect(covers(['*'], 'anything:x')).toBe(true)
    expect(covers(['payments:*'], 'paymentsx:release')).toBe(false)
    expect(covers(['invoices:read'], 'payments:release')).toBe(false)
    expect(covers([], 'payments:release')).toBe(false)
  })
  it('limits a delegated agent to what the person it acts for may do', () => {
    const g = { ...base, mode: 'delegated' as const, forUser: 'raj' }
    const r = judgeGrants([g], now, { userScopes: { raj: ['invoices:read'] } })
    expect(r.rows[0]!.effective).toBe('none')
    expect(r.rows[0]!.problems[0]).toBe('raj cannot do this, so an agent acting for them cannot either.')
    expect(r.summary.blocked).toBe(1)
    expect(r.summary.attention).toBe(1)
    expect(judgeGrants([g], now, { userScopes: { raj: ['payments:*'] } }).rows[0]!.effective).toBe('full')
  })
  it('does not check an autonomous grant against a person, or a delegated one with nobody to check', () => {
    expect(judgeGrants([{ ...base, mode: 'autonomous' }], now, { userScopes: {} }).rows[0]!.effective).toBeUndefined()
    expect(judgeGrants([{ ...base, mode: 'delegated', forUser: 'raj' }], now).rows[0]!.effective).toBeUndefined()
  })
  it('says when a delegated grant does not name its user', () => {
    expect(judgeGrants([{ ...base, mode: 'delegated' }], now).rows[0]!.problems).toEqual(['It acts for a user but does not say which.'])
  })
  it('flags a scope not used for 30 days, from last use or from the grant if never used', () => {
    expect(judgeGrants([{ ...base, lastUsedAt: '2026-04-01T00:00:00Z' }], now).rows[0]!.dormant).toBe(true)
    expect(judgeGrants([{ ...base, lastUsedAt: '2026-06-09T00:00:00Z' }], now).rows[0]!.dormant).toBe(false)
    expect(judgeGrants([{ ...base }], now).rows[0]!.dormant).toBe(true)
    expect(judgeGrants([{ ...base, grantedAt: '2026-06-01T00:00:00Z' }], now).rows[0]!.dormant).toBe(false)
    expect(judgeGrants([{ ...base, lastUsedAt: '2026-04-01T00:00:00Z' }], now, { dormantDays: 90 }).rows[0]!.dormant).toBe(false)
  })
  it('does not call an expired or revoked grant dormant', () => {
    expect(judgeGrants([{ ...base, revokedAt: '2026-06-01T00:00:00Z' }], now).rows[0]!.dormant).toBe(false)
  })
  it('flags something that cannot be undone and is not approved each time', () => {
    expect(judgeGrants([{ ...base, irreversible: true }], now).rows[0]!.problems).toEqual(['It cannot be undone and nobody approves each use.'])
    expect(judgeGrants([{ ...base, irreversible: true, needsApproval: true }], now).rows[0]!.problems).toEqual([])
  })
  it('asks for an owner only when told to', () => {
    expect(judgeGrants([base], now).rows[0]!.problems).toEqual([])
    expect(judgeGrants([base], now, { requireOwner: true }).rows[0]!.problems).toEqual(['No named owner.'])
  })
  it('mentions dormant and blocked grants in the summary', () => {
    const g = { ...base, mode: 'delegated' as const, forUser: 'raj', lastUsedAt: '2026-04-01T00:00:00Z' }
    expect(judgeGrants([g], now, { userScopes: { raj: [] } }).summary.text).toBe('1 in force, 1 more than the user may do, 1 not used lately')
  })
})

import { traceHealth } from '../src/components/tracehealth.js'

describe('trace health', () => {
  const sp = (id: string, o: Partial<Span> = {}): Span => ({ id, name: `step ${id}`, kind: 'agent', startMs: 0, durationMs: 100, status: 'ok', ...o })
  const good: Span[] = [
    sp('run', { name: 'invoice run', durationMs: 900 }),
    sp('l1', { parentId: 'run', name: 'plan', kind: 'llm', startMs: 0, durationMs: 200, tokens: { in: 10, out: 5 } }),
    sp('t1', { parentId: 'run', name: 'lookup po', kind: 'tool', startMs: 200, durationMs: 300 }),
    sp('l2', { parentId: 'run', name: 'decide', kind: 'llm', startMs: 500, durationMs: 200, tokens: { in: 20, out: 5 } }),
  ]
  const checks = (spans: Span[], o = {}) => traceHealth(spans, o).findings.map((f) => f.check)
  it('has nothing to say about a well-formed trace', () => {
    const h = traceHealth(good)
    expect(h.findings).toEqual([])
    expect(h.text).toMatch(/Nothing to fix/)
  })
  it('flags one model call that wraps the loop', () => {
    const wrapped = [sp('run'), sp('big', { parentId: 'run', kind: 'llm', name: 'agent loop', tokens: { in: 1, out: 1 }, durationMs: 90 }), sp('a', { parentId: 'big', kind: 'tool', name: 'a' }), sp('b', { parentId: 'big', kind: 'llm', name: 'b', tokens: { in: 1, out: 1 } })]
    const f = traceHealth(wrapped).findings.find((x) => x.check === 'loop-wrapped')!
    expect(f.severity).toBe('fix')
    expect(f.spans).toEqual(['big'])
    expect(f.text).toMatch(/2 calls inside it/)
  })
  it('does not flag a model call with a single tool call inside it', () => {
    expect(checks([sp('run'), sp('m', { parentId: 'run', kind: 'llm', tokens: { in: 1, out: 1 } }), sp('t', { parentId: 'm', kind: 'tool' })])).not.toContain('loop-wrapped')
  })
  it('flags a tool call at the top while other steps exist', () => {
    const f = traceHealth([...good, sp('stray', { kind: 'tool', name: 'send email', startMs: 800, durationMs: 50 })]).findings.find((x) => x.check === 'tool-at-root')!
    expect(f.spans).toEqual(['stray'])
  })
  it('flags a span whose parent is not in the trace', () => {
    expect(traceHealth([...good, sp('lost', { parentId: 'gone', name: 'lost step' })]).findings.find((x) => x.check === 'orphan')!.spans).toEqual(['lost'])
  })
  it('notes model calls with no token counts', () => {
    const f = traceHealth([sp('run'), sp('m', { parentId: 'run', kind: 'llm', name: 'decide' })]).findings.find((x) => x.check === 'no-usage')!
    expect(f.severity).toBe('note')
    expect(f.text).toMatch(/1 of 1 model calls/)
  })
  it('looks for reasoning only when asked', () => {
    const spans = [sp('run'), sp('m', { parentId: 'run', kind: 'llm', name: 'decide', tokens: { in: 1, out: 1 } })]
    expect(checks(spans)).not.toContain('no-thinking')
    expect(checks(spans, { expectThinking: true })).toContain('no-thinking')
    expect(checks([sp('run'), sp('m', { parentId: 'run', kind: 'llm', name: 'decide', tokens: { in: 1, out: 1 }, attrs: { thinking: 'The PO has two lines' } })], { expectThinking: true })).not.toContain('no-thinking')
  })
  it('notes names that say nothing', () => {
    const f = traceHealth([sp('run', { name: 'span' }), sp('x', { parentId: 'run', name: '' })]).findings.find((x) => x.check === 'generic-name')!
    expect(f.spans.sort()).toEqual(['run', 'x'])
  })
  it('notes a flood of tiny spans with one name', () => {
    const noise = Array.from({ length: 25 }, (_, i) => sp(`n${i}`, { parentId: 'run', name: 'heartbeat', durationMs: 0.2 }))
    expect(traceHealth([sp('run', { durationMs: 500 }), ...noise]).findings.find((x) => x.check === 'noise')!.spans).toHaveLength(25)
    expect(checks([sp('run'), ...noise.slice(0, 5)])).not.toContain('noise')
  })
  it('flags a failed step that says nothing about why', () => {
    expect(traceHealth([sp('run'), sp('bad', { parentId: 'run', status: 'error', name: 'pay' })]).findings.find((x) => x.check === 'error-silent')!.spans).toEqual(['bad'])
    expect(checks([sp('run'), sp('bad', { parentId: 'run', status: 'error', name: 'pay', output: 'timeout' })])).not.toContain('error-silent')
  })
  it('notes a child that ends after its parent', () => {
    expect(traceHealth([sp('run', { durationMs: 100 }), sp('late', { parentId: 'run', name: 'late', startMs: 50, durationMs: 200 })]).findings.find((x) => x.check === 'outlives-parent')!.spans).toEqual(['late'])
  })
  it('lists what to fix before what to note, and counts both', () => {
    const h = traceHealth([sp('run'), sp('m', { parentId: 'run', kind: 'llm', name: 'decide' }), sp('bad', { parentId: 'run', status: 'error', name: 'pay' })])
    expect(h.findings[0]!.severity).toBe('fix')
    expect(h.text).toBe('1 to fix, 1 to note.')
  })
  it('copes with no spans', () => {
    expect(traceHealth([]).text).toBe('No spans to check.')
  })
})

import { compareBranches, diffValues, forkPoints, leaves, pathTo, type Checkpoint } from '../src/components/branches.js'
import { groupVariants } from '../src/components/variants.js'

describe('run branches', () => {
  const cp = (id: string, parentId: string | undefined, values: Record<string, unknown> = {}): Checkpoint => ({ id, parentId, label: `step ${id}`, at: '2026-06-10T10:00:00Z', values })
  //  a - b - c - d          original
  //          \\ e - f        fork from c with a changed amount
  const history = [cp('a', undefined, { n: 1 }), cp('b', 'a', { n: 2 }), cp('c', 'b', { n: 3, amount: 100 }), cp('d', 'c', { n: 4, amount: 100 }), cp('e', 'c', { n: 4, amount: 90 }), cp('f', 'e', { n: 5, amount: 90, note: 'x' })]
  it('walks a path from the start, and survives a cycle or a missing parent', () => {
    expect(pathTo(history, 'f').map((c) => c.id)).toEqual(['a', 'b', 'c', 'e', 'f'])
    expect(pathTo([cp('x', 'y'), cp('y', 'x')], 'x').map((c) => c.id)).toEqual(['y', 'x'])
    expect(pathTo([cp('z', 'gone')], 'z').map((c) => c.id)).toEqual(['z'])
    expect(pathTo(history, 'nope')).toEqual([])
  })
  it('finds the ends and the fork points', () => {
    expect(leaves(history).map((c) => c.id)).toEqual(['d', 'f'])
    expect(forkPoints(history).map((c) => c.id)).toEqual(['c'])
  })
  it('names where two paths split and what only each took', () => {
    const r = compareBranches(history, 'd', 'f')
    expect(r.divergedAt!.id).toBe('c')
    expect(r.common.map((c) => c.id)).toEqual(['a', 'b', 'c'])
    expect(r.onlyA.map((c) => c.id)).toEqual(['d'])
    expect(r.onlyB.map((c) => c.id)).toEqual(['e', 'f'])
    expect(r.text).toBe('The paths split after "step c". One took 1 more step and the other 2. They end with 3 differences in state.')
  })
  it('diffs the saved states of the two ends', () => {
    expect(compareBranches(history, 'd', 'f').changes).toEqual([
      { path: 'amount', kind: 'changed', before: 100, after: 90 },
      { path: 'n', kind: 'changed', before: 4, after: 5 },
      { path: 'note', kind: 'added', after: 'x' },
    ])
  })
  it('says so when one path continues from the other, or they are the same', () => {
    expect(compareBranches(history, 'c', 'f').text).toBe('One path continues from the other after "step c".')
    expect(compareBranches(history, 'd', 'd').text).toBe('These are the same checkpoint.')
    expect(compareBranches(history, 'd', 'nope').text).toBe('One of the two checkpoints is not in the history.')
    expect(compareBranches([cp('p', undefined), cp('q', undefined)], 'p', 'q').text).toBe('These two paths never meet.')
  })
  it('diffs nested objects and lists, and says what was added, removed or changed', () => {
    expect(diffValues({ a: { b: 1, c: [1, 2] }, gone: 1 }, { a: { b: 2, c: [1, 2, 3] }, new: true })).toEqual([
      { path: 'a.b', kind: 'changed', before: 1, after: 2 },
      { path: 'a.c[2]', kind: 'added', after: 3 },
      { path: 'gone', kind: 'removed', before: 1 },
      { path: 'new', kind: 'added', after: true },
    ])
    expect(diffValues({ a: 1 }, { a: 1 })).toEqual([])
    expect(diffValues(1, 2)).toEqual([{ path: '(whole state)', kind: 'changed', before: 1, after: 2 }])
  })
})

describe('run variants', () => {
  const plan = ['look up the po', 'check duplicates', 'check limit', 'release payment']
  const run = (id: string, steps: string[], failed = false) => ({ id, steps, failed })
  const full = plan
  it('groups runs that took the same steps, most common first, ignoring case and spacing', () => {
    const r = groupVariants([run('1', full), run('2', full.map((s) => s.toUpperCase())), run('3', ['look up the po', 'release payment'])], plan)
    expect(r.variants.map((v) => v.count)).toEqual([2, 1])
    expect(r.variants[0]!.share).toBeCloseTo(2 / 3)
    expect(r.text).toBe('3 runs took 2 different paths. 2 followed the plan.')
  })
  it('names what a path skipped, added or did in the wrong order', () => {
    const r = groupVariants([
      run('1', ['look up the po', 'release payment']),
      run('2', [...full, 'phone the vendor']),
      run('3', ['check duplicates', 'look up the po', 'check limit', 'release payment']),
    ], plan)
    const by = Object.fromEntries(r.variants.map((v) => [v.runs[0], v]))
    expect(by['1']!.missing).toEqual(['check duplicates', 'check limit'])
    expect(by['1']!.conforms).toBe(false)
    expect(by['2']!.extra).toEqual(['phone the vendor'])
    expect(by['3']!.outOfOrder).toBe(true)
    expect(r.conforming).toBe(0)
  })
  it('puts an exact interval on each path failure rate', () => {
    const runs = [run('1', full, true), run('2', full, true), run('3', full, true), run('4', full), ...Array.from({ length: 400 }, (_, i) => run(`o${i}`, ['look up the po'], i < 300))]
    const r = groupVariants(runs)
    const small = r.variants.find((v) => v.count === 4)!
    const big = r.variants.find((v) => v.count === 400)!
    expect(small.failRate).toBe(0.75)
    expect(big.failRate).toBe(0.75)
    expect(small.upper - small.lower).toBeGreaterThan(big.upper - big.lower)
    expect(small.lower).toBeLessThan(0.3)
    expect(big.lower).toBeGreaterThan(0.7)
  })
  it('does not judge against a plan it was not given, and copes with no runs', () => {
    const r = groupVariants([run('1', full)])
    expect(r.variants[0]!.conforms).toBeNull()
    expect(r.conforming).toBeNull()
    expect(groupVariants([]).text).toBe('No runs.')
  })
})

import { authorOf, authorship, countChanges, diffSeq, markMoves, numberLines } from '../src/components/diff.js'

describe('diff: moved code and authorship', () => {
  const lines = (a: string[], b: string[]) => numberLines(diffSeq(a, b))
  const block = ['const total = lines.reduce((n, l) => n + l.amount, 0)', 'const tax = total * rate', 'return total + tax']
  it('calls a block removed in one file and added in another moved, not rewritten', () => {
    const from = lines(['top', ...block, 'bottom'], ['top', 'bottom'])
    const to = lines(['x'], ['x', ...block])
    const [a, b] = markMoves([from, to])
    expect(a!.filter((l) => l.moved)).toHaveLength(3)
    expect(b!.filter((l) => l.moved)).toHaveLength(3)
    expect(countChanges(a!)).toEqual({ added: 0, removed: 0, moved: 3 })
  })
  it('does not call one short line moved, but does call one long line moved', () => {
    const shortMove = markMoves([lines(['}', 'a'], ['a']), lines(['b'], ['b', '}'])])
    expect(shortMove.flat().some((l) => l.moved)).toBe(false)
    const longLine = 'throw new Error(`The invoice ${id} does not match its purchase order`)'
    const longMove = markMoves([lines(['a', longLine], ['a']), lines(['b'], ['b', longLine])])
    expect(longMove.flat().filter((l) => l.moved)).toHaveLength(2)
  })
  it('keeps a rewrite as a rewrite', () => {
    const r = markMoves([lines(['const total = compute(lines)'], ['const total = computeAll(lines)'])])
    expect(r[0]!.some((l) => l.moved)).toBe(false)
    expect(countChanges(r[0]!)).toEqual({ added: 1, removed: 1, moved: 0 })
  })
  it('does not change the lines it was given', () => {
    const from = lines(['top', ...block], ['top'])
    markMoves([from, lines(['x'], ['x', ...block])])
    expect(from.some((l) => l.moved)).toBe(false)
  })
  it('says who wrote each added line from the ranges, and never guesses for the rest', () => {
    const ranges = [{ from: 1, to: 2, by: 'invoice-agent', kind: 'agent' as const }, { from: 3, to: 3, by: 'raj', kind: 'human' as const }]
    const l = lines(['keep'], ['keep', 'one', 'two', 'three', 'four'])
    expect(authorOf(l.find((x) => x.newNo === 2)!, ranges)!.by).toBe('invoice-agent')
    expect(authorOf(l.find((x) => x.newNo === 4)!, ranges)).toBeUndefined()
    expect(authorship(l, ranges)).toEqual({ agent: 1, human: 1, unknown: 2 })
  })
})

import { compareRuns, flipsNeededFor } from '../src/components/evalcompare.js'

describe('comparing two evaluation runs', () => {
  const cases = Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, label: `case ${i}` }))
  const run = (label: string, pass: (i: number) => boolean) => ({ label, results: Object.fromEntries(cases.map((c, i) => [c.id, pass(i)])) })
  it('needs at least six flips, all one way, to ever reach 5%', () => {
    expect(flipsNeededFor()).toBe(6)
  })
  it('calls a lopsided drop a regression and gives the p-value', () => {
    const r = compareRuns(cases, run('before', () => true), run('after', (i) => i >= 9))
    expect(r.verdict).toBe('regression')
    expect(r.regressed).toBe(9)
    expect(r.text).toMatch(/^Regression: 9 worse, 0 better\. Too lopsided to be chance \(p = 0\.004\)\.$/)
  })
  it('does not call a small drop real, and says why it cannot be told', () => {
    const r = compareRuns(cases, run('before', () => true), run('after', (i) => i >= 3))
    expect(r.verdict).toBe('possible-drift')
    expect(r.text).toBe('Possible drift: 3 worse, 0 better. This could be chance (p = 0.25). With 3 cases flipped it cannot be shown either way: it takes at least 6, all one way.')
  })
  it('does not add the cannot-be-shown line when enough cases flipped but they split', () => {
    const r = compareRuns(cases, run('before', (i) => i < 20), run('after', (i) => i >= 6 && i < 20 ? false : i >= 20 && i < 28))
    expect(r.regressed).toBeGreaterThan(r.improved)
    expect(r.text).not.toMatch(/cannot be shown/)
  })
  it('mirrors for gains, and says so when it moved equally both ways or not at all', () => {
    expect(compareRuns(cases, run('b', () => false), run('a', (i) => i < 9)).verdict).toBe('improvement')
    expect(compareRuns(cases, run('b', () => false), run('a', (i) => i < 2)).verdict).toBe('possible-gain')
    expect(compareRuns(cases, run('b', (i) => i < 5), run('a', (i) => i >= 5 && i < 10)).verdict).toBe('mixed')
    const none = compareRuns(cases, run('b', (i) => i < 5), run('a', (i) => i < 5))
    expect(none.verdict).toBe('no-change')
    expect(none.unchanged).toBe(40)
  })
  it('lists which cases flipped, in which direction', () => {
    const r = compareRuns(cases, run('b', (i) => i === 0 || i === 1), run('a', (i) => i === 1 || i === 2))
    expect([...r.flips]).toEqual([['c0', 'regressed'], ['c2', 'improved']])
  })
  it('does not compare a run with itself', () => {
    expect(compareRuns(cases, run('b', () => true), run('b', () => true), true).verdict).toBe('same-run')
  })
})

import type { Handoff } from '../src/components/handoff.js'

describe('handoff: trigger, summary length and recipient', () => {
  const full: Handoff = {
    summary: 'Invoice INV-2291 is over the limit. I matched it to the PO.', attempted: ['Matched the PO'], stoppedBecause: 'Over the approval limit',
    recommended: { action: 'Approve', why: 'Six of six lines match' }, needsFrom: 'Controller', deadline: '2026-06-10T18:00:00Z', evidence: [{ label: 'PO-8810' }],
    trigger: { kind: 'high-stakes' }, transfer: 'warm', recipient: { name: 'Priya', verified: true },
  }
  const now = '2026-06-10T12:00:00Z'
  it('has no notes for a short, triggered, warm handoff to a checked person', () => {
    const c = checkHandoff(full, now)
    expect(c.complete).toBe(true)
    expect(c.notes).toEqual([])
  })
  it('notes a long summary, by sentence count or length, without making it incomplete', () => {
    const wordy = checkHandoff({ ...full, summary: 'One. Two. Three. Four. Five.' }, now)
    expect(wordy.notes).toEqual(['The summary is long. Three lines get read, a transcript does not.'])
    expect(wordy.complete).toBe(true)
    expect(checkHandoff({ ...full, summary: 'x'.repeat(401) }, now).notes).toHaveLength(1)
  })
  it('notes a missing trigger and a cold handoff', () => {
    const { trigger: _t, ...noTrigger } = full
    expect(checkHandoff(noTrigger, now).notes).toEqual(['It does not say what made the agent hand off.'])
    expect(checkHandoff({ ...full, transfer: 'cold' }, now).notes[0]).toMatch(/cold handoff/)
  })
  it('is incomplete when the recipient has not been checked', () => {
    const c = checkHandoff({ ...full, recipient: { name: 'Priya', verified: false } }, now)
    expect(c.complete).toBe(false)
    expect(c.missing).toEqual([])
    expect(c.text).toBe('Incomplete: Priya has not been checked as the right person.')
    expect(c.notes[0]).toBe('Priya has not been checked as the right person to receive this.')
  })
  it('still lists what is missing first', () => {
    expect(checkHandoff({ ...full, deadline: undefined }, now).text).toMatch(/missing a deadline/)
  })
})

import { layoutFlow, neighbour, outlineOf, type FlowNode } from '../src/components/flow.js'

describe('flow: walking the diagram and its outline', () => {
  const nodes: FlowNode[] = [
    { id: 'start', label: 'Invoice in', kind: 'start' },
    { id: 'match', label: 'Match the PO', kind: 'step' },
    { id: 'dup', label: 'Check duplicates', kind: 'step' },
    { id: 'limit', label: 'Over the limit?', kind: 'gate' },
    { id: 'pay', label: 'Release payment', kind: 'end', status: 'done' },
    { id: 'hold', label: 'Hold for approval', kind: 'end' },
    { id: 'loose', label: 'Left over', kind: 'step' },
  ]
  const edges = [
    { from: 'start', to: 'match' }, { from: 'start', to: 'dup' }, { from: 'match', to: 'limit' }, { from: 'dup', to: 'limit' },
    { from: 'limit', to: 'pay', label: 'No' }, { from: 'limit', to: 'hold', label: 'Yes' },
  ]
  const layout = layoutFlow(nodes, edges)
  it('goes along an edge to what a step leads to, and back to what feeds it', () => {
    expect(['match', 'dup']).toContain(neighbour(layout.nodes, edges, 'start', 'next'))
    expect(neighbour(layout.nodes, edges, 'match', 'next')).toBe('limit')
    expect(['match', 'dup']).toContain(neighbour(layout.nodes, edges, 'limit', 'previous'))
  })
  it('goes up and down within the same step, and stops at the ends', () => {
    const a = layout.nodes.find((n) => n.id === 'match')!
    const b = layout.nodes.find((n) => n.id === 'dup')!
    const [top, bottom] = a.y <= b.y ? [a, b] : [b, a]
    expect(neighbour(layout.nodes, edges, top.id, 'down')).toBe(bottom.id)
    expect(neighbour(layout.nodes, edges, bottom.id, 'up')).toBe(top.id)
    expect(neighbour(layout.nodes, edges, top.id, 'up')).toBeUndefined()
  })
  it('has nowhere to go from an end, from a start going back, or from an unknown step', () => {
    expect(neighbour(layout.nodes, edges, 'pay', 'next')).toBeUndefined()
    expect(neighbour(layout.nodes, edges, 'start', 'previous')).toBeUndefined()
    expect(neighbour(layout.nodes, edges, 'nope', 'next')).toBeUndefined()
  })
  it('lists a step reached by two paths once in full and then as see above', () => {
    const tree = outlineOf(layout.nodes, edges)
    expect(tree.map((t) => t.id)).toEqual(['start', 'loose'])
    const flat: { id: string; seen: boolean }[] = []
    const walk = (items: typeof tree) => items.forEach((i) => { flat.push({ id: i.id, seen: i.seen }); walk(i.children) })
    walk(tree)
    expect(flat.filter((f) => f.id === 'limit')).toEqual([{ id: 'limit', seen: false }, { id: 'limit', seen: true }])
    expect(flat.map((f) => f.id)).toContain('pay')
  })
  it('carries the edge label and leaves no step out, including one nothing leads to', () => {
    const tree = outlineOf(layout.nodes, edges)
    const limit = JSON.stringify(tree)
    expect(limit).toContain('"edgeLabel":"Yes"')
    expect(new Set(JSON.stringify(tree).match(/"id":"[a-z]+"/g)).size).toBe(nodes.length)
  })
  it('survives a cycle and a self-loop', () => {
    const cyc = layoutFlow(nodes.slice(0, 3), [{ from: 'start', to: 'match' }, { from: 'match', to: 'dup' }, { from: 'dup', to: 'start' }, { from: 'dup', to: 'dup' }])
    expect(() => outlineOf(cyc.nodes, [{ from: 'start', to: 'match' }, { from: 'match', to: 'dup' }, { from: 'dup', to: 'start' }, { from: 'dup', to: 'dup' }])).not.toThrow()
  })
})

import { clampIndex, countUp, loupeAt, minutesDone, minutesLeft, stateOf, type Stage } from '../src/components/theatre.js'

describe('run theatre: playhead, time and loupe', () => {
  const stages: Stage[] = [
    { id: 'a', title: 'Read', minutes: 2 },
    { id: 'b', title: 'Match', minutes: 5 },
    { id: 'c', title: 'Limit', minutes: 1, focus: { x: 0.6, y: 0.4, label: '$12,400' } },
    { id: 'd', title: 'Release', minutes: 3 },
  ]
  it('keeps the playhead on a real step', () => {
    expect(clampIndex(-3, 4)).toBe(0)
    expect(clampIndex(9, 4)).toBe(3)
    expect(clampIndex(1.6, 4)).toBe(2)
    expect(clampIndex(NaN, 4)).toBe(0)
    expect(clampIndex(2, 0)).toBe(0)
  })
  it('adds up the time still to come, and the time already done', () => {
    expect(minutesLeft(stages, 0)).toBe(11)
    expect(minutesLeft(stages, 2)).toBe(4)
    expect(minutesDone(stages, 2)).toBe(7)
    expect(minutesLeft(stages, 99)).toBe(3)
  })
  it('ignores a missing or negative time rather than adding it', () => {
    expect(minutesLeft([{ id: 'x', title: 'x' }, { id: 'y', title: 'y', minutes: -4 }, { id: 'z', title: 'z', minutes: 2 }], 0)).toBe(2)
  })
  it('marks each step done, current or still to come', () => {
    expect([0, 1, 2, 3].map((i) => stateOf(1, i))).toEqual(['done', 'current', 'todo', 'todo'])
  })
  it('places the loupe beside its point, on the side with room, inside the stage', () => {
    const left = loupeAt({ x: 0.1, y: 0.5 }, { w: 400, h: 240 }, 50)
    expect(left.cx).toBeGreaterThan(left.tipX)
    const right = loupeAt({ x: 0.9, y: 0.5 }, { w: 400, h: 240 }, 50)
    expect(right.cx).toBeLessThan(right.tipX)
    for (const p of [left, right, loupeAt({ x: 0, y: 0 }, { w: 400, h: 240 }, 50), loupeAt({ x: 1, y: 1 }, { w: 400, h: 240 }, 50)]) {
      expect(p.cx - p.r).toBeGreaterThanOrEqual(0)
      expect(p.cx + p.r).toBeLessThanOrEqual(400)
      expect(p.cy - p.r).toBeGreaterThanOrEqual(0)
      expect(p.cy + p.r).toBeLessThanOrEqual(240)
    }
  })
  it('keeps the loupe usable in a tiny or broken stage', () => {
    const p = loupeAt({ x: NaN, y: 0.5 }, { w: 0, h: 0 }, 2)
    expect(Number.isFinite(p.cx) && Number.isFinite(p.cy) && p.r >= 24).toBe(true)
  })
  it('counts up with easing, and lands exactly on the target', () => {
    expect(countUp(100, 0)).toBe(0)
    expect(countUp(100, 1)).toBe(100)
    expect(countUp(100, 0.5)).toBeGreaterThan(50)
    expect(countUp(100, 2)).toBe(100)
    expect(countUp(100, -1)).toBe(0)
  })
})
