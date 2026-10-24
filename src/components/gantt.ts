// Time layout for deadline clocks. A clock runs from `startedAt` for `deadlineHours`, then is met or overdue.

export type Clock = { label: string; startedAt: string; deadlineHours: number; resolvedAt?: string; remedied?: boolean }
export type ClockState = 'met' | 'open' | 'overdue' | 'late' | 'remedied'
export type ClockMath = { start: number; deadline: number; end: number; state: ClockState; overdueMs: number; remainingMs: number }

const HOUR = 3_600_000

/**
 * `met`: resolved in time. `late`: resolved after the deadline. `remedied`: late but a remedy was delivered.
 * `open`: still running inside the window. `overdue`: still running past the deadline.
 */
export function clockMath(c: Clock, now: number): ClockMath {
  const start = new Date(c.startedAt).getTime()
  const deadline = start + c.deadlineHours * HOUR
  const resolved = c.resolvedAt ? new Date(c.resolvedAt).getTime() : null
  const end = resolved ?? now
  let state: ClockState
  if (resolved !== null) state = resolved <= deadline ? 'met' : c.remedied ? 'remedied' : 'late'
  else state = now <= deadline ? 'open' : 'overdue'
  return { start, deadline, end, state, overdueMs: Math.max(0, end - deadline), remainingMs: Math.max(0, deadline - now) }
}

export function ganttDomain(clocks: Clock[], now: number, pad = 0.04): [number, number] {
  const times = clocks.flatMap((c) => {
    const m = clockMath(c, now)
    return [m.start, m.deadline, m.end]
  })
  times.push(now)
  const lo = Math.min(...times)
  const hi = Math.max(...times)
  const span = Math.max(hi - lo, HOUR)
  return [lo - span * pad, hi + span * pad]
}

const STEPS_H = [1, 2, 3, 4, 6, 12, 24, 48, 168]

/** Tick times on round UTC boundaries (every 6 hours, every day, and so on), about `target` of them. */
export function timeTicks(lo: number, hi: number, target = 6): number[] {
  const span = (hi - lo) / HOUR
  const step = STEPS_H.find((h) => span / h <= target) ?? STEPS_H[STEPS_H.length - 1]!
  const out: number[] = []
  for (let t = Math.ceil(lo / (step * HOUR)) * step * HOUR; t <= hi; t += step * HOUR) out.push(t)
  return out
}
