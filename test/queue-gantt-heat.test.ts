import { describe, expect, it } from 'vitest'
import { cannotDecide, judgeItem, planDigest, type QueueItem } from '../src/components/approval.js'
import { clockMath, ganttDomain } from '../src/components/gantt.js'
import { layoutHeat, levelsFor } from '../src/components/heat.js'

const NOW = new Date('2026-06-10T12:00:00Z')
const base = (over: Partial<QueueItem> = {}): QueueItem => ({ id: 'q', action: 'Pay', summary: '', requester: 'agent', risk: 'high', plan: { amount: 12400 }, evidence: [], reversible: false, needs: 1, decisions: [], ...over })

describe('planDigest', () => {
  it('is stable across key order and changes when the plan changes', async () => {
    expect(await planDigest({ a: 1, b: 2 })).toBe(await planDigest({ b: 2, a: 1 }))
    expect(await planDigest({ amount: 12400 })).not.toBe(await planDigest({ amount: 12401 }))
  })
})

describe('judgeItem', () => {
  const H = 'hash-now'
  const dec = (by: string, decision: 'approve' | 'reject' | 'escalate' = 'approve', planHash = H) => ({ by, decision, at: '2026-06-10T10:00:00Z', planHash })
  it('is pending with no decisions, and explains a two-person rule', () => {
    expect(judgeItem(base(), H, NOW).status).toBe('pending')
    expect(judgeItem(base({ needs: 2 }), H, NOW).reason).toMatch(/2 approvals from different people/)
  })
  it('approves once enough different people approve the current plan', () => {
    expect(judgeItem(base({ decisions: [dec('ana')] }), H, NOW).status).toBe('approved')
    expect(judgeItem(base({ needs: 2, decisions: [dec('ana')] }), H, NOW).status).toBe('partial')
    expect(judgeItem(base({ needs: 2, decisions: [dec('ana'), dec('raj')] }), H, NOW).status).toBe('approved')
  })
  it('does not count the same person twice', () => {
    const j = judgeItem(base({ needs: 2, decisions: [dec('ana'), dec('ana')] }), H, NOW)
    expect(j.status).toBe('partial')
    expect(j.ignored).toHaveLength(1)
  })
  it('never lets the requester approve their own request', () => {
    const j = judgeItem(base({ decisions: [dec('agent')] }), H, NOW)
    expect(j.status).toBe('pending')
    expect(j.ignored[0]!.why).toMatch(/cannot approve their own/)
  })
  it('an approval of an older plan goes stale instead of counting', () => {
    const j = judgeItem(base({ decisions: [dec('ana', 'approve', 'hash-old')] }), H, NOW)
    expect(j.status).toBe('stale')
    expect(j.reason).toMatch(/different version/)
  })
  it('a reject on the current plan wins over approvals', () => {
    expect(judgeItem(base({ needs: 2, decisions: [dec('ana'), dec('raj', 'reject')] }), H, NOW).status).toBe('rejected')
  })
  it('expires when nobody decided in time, but a decision made first still stands', () => {
    const exp = '2026-06-10T09:00:00Z'
    expect(judgeItem(base({ expiresAt: exp }), H, NOW).status).toBe('expired')
    expect(judgeItem(base({ expiresAt: exp, decisions: [dec('ana')] }), H, NOW).status).toBe('approved')
  })
  it('says why a reviewer cannot decide', () => {
    const item = base({ decisions: [dec('ana')], needs: 2 })
    const j = judgeItem(item, H, NOW)
    expect(cannotDecide(item, j, 'ana')).toMatch(/already decided/)
    expect(cannotDecide(item, j, 'agent')).toMatch(/asked for this/)
    expect(cannotDecide(item, j, 'raj')).toBeNull()
    expect(cannotDecide(base({ expiresAt: '2026-06-10T09:00:00Z' }), judgeItem(base({ expiresAt: '2026-06-10T09:00:00Z' }), H, NOW), 'raj')).toMatch(/expired/)
  })
})

describe('clockMath', () => {
  const now = new Date('2026-06-10T12:00:00Z').getTime()
  const c = { label: 'Re-test', startedAt: '2026-06-09T00:00:00Z', deadlineHours: 48 }
  it('classifies the five states', () => {
    expect(clockMath({ ...c, resolvedAt: '2026-06-10T00:00:00Z' }, now).state).toBe('met')
    expect(clockMath({ ...c, resolvedAt: '2026-06-12T00:00:00Z' }, now).state).toBe('late')
    expect(clockMath({ ...c, resolvedAt: '2026-06-12T00:00:00Z', remedied: true }, now).state).toBe('remedied')
    expect(clockMath(c, now).state).toBe('open')
    expect(clockMath({ ...c, startedAt: '2026-06-07T00:00:00Z' }, now).state).toBe('overdue')
  })
  it('works out time left and time over', () => {
    expect(clockMath(c, now).remainingMs).toBe(12 * 3_600_000)
    expect(clockMath({ ...c, startedAt: '2026-06-07T00:00:00Z' }, now).overdueMs).toBe(36 * 3_600_000)
  })
  it('a domain always includes now, every start and every deadline', () => {
    const [lo, hi] = ganttDomain([c], now)
    expect(lo).toBeLessThan(new Date(c.startedAt).getTime())
    expect(hi).toBeGreaterThan(now)
  })
})

describe('heatmap', () => {
  it('levels use quartiles of the active days', () => {
    const lv = levelsFor([0, 1, 2, 3, 4, 5, 6, 7, 8, 100])
    expect(lv(0)).toBe(0)
    expect(lv(1)).toBe(1)
    expect(lv(100)).toBe(4)
    expect(levelsFor([0, 0])(0)).toBe(0)
  })
  it('lays out whole Monday-first weeks ending on the last date', () => {
    const l = layoutHeat([{ date: '2026-06-10', count: 3 }, { date: '2026-06-08', count: 1 }], 4)
    expect(l.cells).toHaveLength(28)
    expect(l.cells.find((c) => c.date === '2026-06-08')!.weekday).toBe(0)
    expect(l.cells.find((c) => c.date === '2026-06-10')!.weekday).toBe(2)
    expect(l.cells.find((c) => c.date === '2026-06-11')!.inRange).toBe(false)
    expect(l.total).toBe(4)
    expect(l.busiest).toMatchObject({ date: '2026-06-10', count: 3 })
  })
  it('counts the longest run without a breach', () => {
    const days = Array.from({ length: 10 }, (_, i) => ({ date: `2026-06-${String(i + 1).padStart(2, '0')}`, count: 1, breaches: i === 3 ? 1 : 0 }))
    expect(layoutHeat(days, 2).breachFreeRun).toBe(6)
  })
  it('copes with no data', () => {
    expect(layoutHeat([]).cells).toEqual([])
  })
})

import { timeTicks } from '../src/components/gantt.js'
import { formatDuration } from '../src/components/chart.js'
describe('timeTicks and long durations', () => {
  it('puts ticks on round UTC boundaries', () => {
    const lo = Date.UTC(2026, 5, 6, 19, 17)
    const hi = Date.UTC(2026, 5, 11, 4, 0)
    const ticks = timeTicks(lo, hi, 6)
    expect(ticks.length).toBeGreaterThanOrEqual(3)
    expect(ticks.length).toBeLessThanOrEqual(8)
    for (const t of ticks) { const d = new Date(t); expect(d.getUTCMinutes()).toBe(0); expect(d.getUTCHours() % 12).toBe(0) }
    expect(ticks.every((t) => t >= lo && t <= hi)).toBe(true)
  })
  it('formats hours and days instead of piling up minutes', () => {
    expect(formatDuration(6 * 3_600_000)).toBe('6 h 00 m')
    expect(formatDuration(30 * 3_600_000 + 5 * 60_000)).toBe('1 d 6 h')
    expect(formatDuration(2.5 * 60_000)).toBe('2 m 30 s')
    expect(formatDuration(0)).toBe('0')
  })
})
