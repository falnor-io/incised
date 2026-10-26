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
export type BudgetStatus = 'ok' | 'watch' | 'over-pace' | 'over'
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
  return { status, share, elapsedShare, rate, projected, projectedShare, runsOutAt, text }
}
