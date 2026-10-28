'use client'

import { useEffect, useState } from 'react'
import type { RetestClockProps } from '../schemas.js'
import { clamp, cx, formatHours } from './util.js'

/**
 * A deadline against a clock. Pass `now` for a fixed reading (tests, server render), or `live` to tick.
 * Outcome words come from the dates, not from the caller.
 */
export function RetestClock({ label, startedAt, deadlineHours, resolvedAt, result, remedied, now, live, className }: RetestClockProps & { now?: string | Date; live?: boolean; className?: string }) {
  const [tick, setTick] = useState<number | null>(null)
  useEffect(() => {
    if (!live || resolvedAt) return
    setTick(Date.now())
    const id = setInterval(() => setTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [live, resolvedAt])

  const start = new Date(startedAt).getTime()
  const end = resolvedAt ? new Date(resolvedAt).getTime() : now ? new Date(now).getTime() : tick
  const elapsed = end === null || Number.isNaN(start) || Number.isNaN(end) ? null : (end - start) / 36e5

  let state: 'open' | 'ok' | 'late' | 'unknown' = 'unknown'
  let words = `${deadlineHours}h window`
  if (elapsed !== null) {
    if (resolvedAt) {
      state = elapsed <= deadlineHours ? 'ok' : 'late'
      words = elapsed <= deadlineHours ? `Met in ${formatHours(elapsed)}` : `Missed by ${formatHours(elapsed - deadlineHours)}`
    } else if (elapsed > deadlineHours) {
      state = 'late'
      words = `Overdue by ${formatHours(elapsed - deadlineHours)}`
    } else {
      state = 'open'
      words = `${formatHours(deadlineHours - elapsed)} left`
    }
  }
  const fill = elapsed === null ? 0 : clamp(elapsed / deadlineHours, 0, 1) * 100

  return (
    <section role="group" className={cx('ol', className)} aria-label={label}>
      <div className="ol-head-row">
        <strong>{label}</strong>
        <span className="ol-pill" data-tone={state === 'ok' ? 'good' : state === 'late' ? 'bad' : undefined}>{words}</span>
      </div>
      <div className="ol-progress" data-state={state} role="progressbar" aria-label={`${label}: time used`} aria-valuemin={0} aria-valuemax={deadlineHours} aria-valuenow={elapsed === null ? undefined : Math.min(elapsed, deadlineHours)}>
        <span style={{ width: `${fill}%` }} />
      </div>
      <p className="ol-sub">
        {deadlineHours}h deadline
        {result && ` · result: ${result}`}
        {state === 'late' && (remedied ? ' · remedy delivered' : ' · remedy outstanding')}
      </p>
    </section>
  )
}
