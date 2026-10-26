// Rules for projecting a budget. The point of each: "on pace" and "runs out on" come from what has been used and the
// time left, using a plain straight-line rate, and the method is simple enough to check by hand.
import { pct } from './util.js'

export type BudgetSample = { at: string; used: number }
export type BudgetInput = {
  limit: number
  used: number
  unit: string
  periodStart: string
  periodEnd: string
  /** Cumulative use over time. With three or more, the recent rate is fitted; with fewer, the average so far is used. */
  samples?: BudgetSample[]
  now?: string | Date
}
export type BudgetStatus = 'ok' | 'watch' | 'over-pace' | 'over' | 'unreadable'
export type BudgetReport = {
  status: BudgetStatus
  share: number
  elapsedShare: number
  /** Use per hour. */
  rate: number
  projected: number
  projectedShare: number
  /** When the limit is reached at this rate, if that is before the period ends. */
  runsOutAt?: string
  /** Pace as a multiple of the steady rate that would use exactly the limit over the whole period. 1 is on pace, 2 runs out in half the time. */
  burnLong: number
  /** The same multiple over only the latest samples. Without samples it equals the long one. */
  burnShort: number
  /** Budget left as a share of the limit. */
  remainingShare: number
  /** Critical at 10% left or both windows at twice the pace, warn at 25% left or both windows over the pace. */
  level: 'ok' | 'warn' | 'critical'
  text: string
}

const HOUR = 3600000

/** Least-squares slope of used against hours, over the most recent samples. */
function slope(samples: BudgetSample[]): number {
  const pts = samples.slice(-8).map((s) => [new Date(s.at).getTime() / HOUR, s.used] as const)
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p[0], 0) / n
  const my = pts.reduce((a, p) => a + p[1], 0) / n
  const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0)
  const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0)
  return den === 0 ? 0 : num / den
}

export function judgeBudget(b: BudgetInput): BudgetReport {
  const now = (b.now ? new Date(b.now) : new Date()).getTime()
  const start = new Date(b.periodStart).getTime()
  const end = new Date(b.periodEnd).getTime()
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end)) {
    return { status: 'unreadable', burnLong: 0, burnShort: 0, remainingShare: b.limit > 0 ? Math.max(0, 1 - b.used / b.limit) : 0, level: 'warn', share: b.limit > 0 ? b.used / b.limit : 0, elapsedShare: 0, rate: 0, projected: b.used, projectedShare: b.limit > 0 ? b.used / b.limit : 0, text: 'The period dates could not be read, so no pace was worked out.' }
  }
  const total = Math.max(1, end - start)
  const elapsed = Math.min(Math.max(now - start, 0), total)
  const elapsedShare = elapsed / total
  const sampled = (b.samples ?? []).slice().sort((x, y) => x.at.localeCompare(y.at))
  const fitted = sampled.length >= 3 ? slope(sampled) : null
  const rate = Math.max(0, fitted ?? (elapsed > 0 ? b.used / (elapsed / HOUR) : 0))
  const hoursLeft = Math.max(0, end - now) / HOUR
  const projected = b.used + rate * hoursLeft
  const share = b.limit > 0 ? b.used / b.limit : 0
  const projectedShare = b.limit > 0 ? projected / b.limit : 0
  const runsOutMs = rate > 0 && b.used < b.limit ? now + ((b.limit - b.used) / rate) * HOUR : undefined
  const runsOutAt = runsOutMs !== undefined && runsOutMs < end ? new Date(runsOutMs).toISOString() : undefined
  let status: BudgetStatus
  let text: string
  if (b.used > b.limit) {
    status = 'over'
    text = `Over the limit by ${(b.used - b.limit).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${b.unit}.`
  } else if (runsOutAt) {
    status = 'over-pace'
    const early = Math.round((end - new Date(runsOutAt).getTime()) / HOUR)
    text = `At this rate the limit is reached ${early < 48 ? `${Math.max(1, early)} h` : `${Math.round(early / 24)} days`} before the period ends.`
  } else if (projectedShare > 0.85) {
    status = 'watch'
    text = `On pace for ${pct(projectedShare, 0)} of the limit by the end. ${pct(elapsedShare, 0)} of the period has gone.`
  } else {
    status = 'ok'
    text = `${pct(share, 0)} used with ${pct(elapsedShare, 0)} of the period gone. On pace for ${pct(projectedShare, 0)}.`
  }
  const totalHours = total / HOUR
  const steady = b.limit > 0 ? b.limit / totalHours : 0
  const longRate = elapsed > 0 ? b.used / (elapsed / HOUR) : 0
  const shortRate = sampled.length >= 2 ? Math.max(0, slope(sampled.slice(-3))) : longRate
  const burnLong = steady > 0 ? longRate / steady : 0
  const burnShort = steady > 0 ? shortRate / steady : 0
  const remainingShare = b.limit > 0 ? Math.max(0, 1 - b.used / b.limit) : 0
  const level: BudgetReport['level'] =
    status === 'over' || remainingShare <= 0.1 || (burnLong >= 2 && burnShort >= 2) ? 'critical'
    : status === 'over-pace' || remainingShare <= 0.25 || (burnLong > 1 && burnShort > 1) ? 'warn'
    : 'ok'
  return { status, share, elapsedShare, rate, projected, projectedShare, runsOutAt, burnLong, burnShort, remainingShare, level, text }
}
