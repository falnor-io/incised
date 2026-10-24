import { useMemo, useState } from 'react'
import { formatDuration, linear } from './chart.js'
import { useWidth } from './hooks.js'
import { clockMath, ganttDomain, timeTicks, type Clock, type ClockState } from './gantt.js'
import { cx } from './util.js'

export type DeadlineGanttProps = {
  title: string
  rows: { name: string; clocks: Clock[] }[]
  now: string | Date
  className?: string
}

const L = 168
const ROW = 30
const STATE_WORD: Record<ClockState, string> = { met: 'Met', open: 'Running', overdue: 'Overdue', late: 'Missed', remedied: 'Missed, remedy delivered' }

const fmt = (ms: number) => { const d = new Date(ms); return `${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` }
const tickLabel = (ms: number) => { const d = new Date(ms); return d.getUTCHours() === 0 ? `${d.toLocaleString('en', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}` : `${String(d.getUTCHours()).padStart(2, '0')}:00` }

/**
 * Every deadline clock on one time axis. A bar runs from the start to the finish (or to now, if still open),
 * a diamond marks the deadline, and any time spent past the deadline is hatched red. Met, running, overdue,
 * and missed-but-remedied are worked out from the dates, never passed in.
 */
export function DeadlineGantt({ title, rows, now, className }: DeadlineGanttProps) {
  const [ref, width] = useWidth<HTMLDivElement>(760)
  const t = new Date(now).getTime()
  const all = rows.flatMap((r) => r.clocks)
  const [lo, hi] = useMemo(() => ganttDomain(all, t), [all, t])
  const w = width - L - 16
  const x = linear([lo, hi], [L, L + w])
  const [hover, setHover] = useState<{ row: number; clock: number } | null>(null)
  const flat = rows.flatMap((r, ri) => r.clocks.map((c, ci) => ({ r, ri, c, ci, m: clockMath(c, t) })))
  const counts = { open: 0, overdue: 0, met: 0, late: 0, remedied: 0 }
  for (const f of flat) counts[f.m.state]++
  const ticks = timeTicks(lo, hi, Math.max(3, Math.floor(w / 90)))

  let y = 30
  const layout = rows.map((r) => {
    const top = y
    y += 26 + r.clocks.length * ROW
    return { top }
  })
  const height = y + 6
  const hv = hover ? flat.find((f) => f.ri === hover.row && f.ci === hover.clock) : undefined

  return (
    <section className={cx('ic', className)} aria-label={title}>
      <div className="ic-head-row">
        <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
        <div className="ic-chips" aria-label="Summary">
          <span className="ic-pill">{counts.open} running</span>
          <span className="ic-pill" data-tone={counts.overdue ? 'bad' : undefined}>{counts.overdue} overdue</span>
          <span className="ic-pill" data-tone="good">{counts.met} met</span>
          <span className="ic-pill" data-tone={counts.late ? 'bad' : undefined}>{counts.late + counts.remedied} missed{counts.remedied ? `, ${counts.remedied} remedied` : ''}</span>
        </div>
      </div>
      <div ref={ref} className="ic-gantt">
        <svg width={width} height={height} role="img" aria-label={`${title}. ${flat.length} clocks, ${counts.overdue} overdue.`}>
          <defs>
            <pattern id="ic-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" className="ic-hatch-bg" /><line x1="0" y1="0" x2="0" y2="6" className="ic-hatch-line" /></pattern>
          </defs>
          {ticks.map((tk) => (<g key={tk}><line x1={x(tk)} x2={x(tk)} y1={22} y2={height} className="ic-axis-line" /><text x={x(tk)} y={14} textAnchor="middle" className="ic-axis-text" data-day={new Date(tk).getUTCHours() === 0}>{tickLabel(tk)}</text></g>))}
          {rows.map((r, ri) => (
            <g key={r.name}>
              <text x={8} y={layout[ri]!.top + 14} className="ic-slabel">{r.name}</text>
              {r.clocks.map((c, ci) => {
                const m = clockMath(c, t)
                const cy = layout[ri]!.top + 26 + ci * ROW
                const bx0 = x(m.start)
                const dx = x(m.deadline)
                const ex = x(m.end)
                const within = Math.min(ex, dx)
                return (
                  <g key={c.label + ci} data-state={m.state} onPointerEnter={() => setHover({ row: ri, clock: ci })} onPointerLeave={() => setHover(null)}>
                    <text x={L - 8} y={cy + 13} textAnchor="end" className="ic-axis-text">{c.label}</text>
                    <rect x={bx0} y={cy + 4} width={Math.max(within - bx0, 1)} height={14} rx={3} className="ic-gbar" data-state={m.state} />
                    {ex > dx && <rect x={dx} y={cy + 4} width={ex - dx} height={14} rx={3} className="ic-gover" />}
                    <path d={`M${dx} ${cy} l6 11 l-6 11 l-6 -11 z`} className="ic-diamond" data-state={m.state} />
                  </g>
                )
              })}
            </g>
          ))}
          <line x1={x(t)} x2={x(t)} y1={20} y2={height} className="ic-now" />
          <text x={x(t)} y={height - 0} textAnchor="middle" className="ic-now-text" dy="-2">now</text>
        </svg>
        {hv && (
          <div className="ic-tip" role="tooltip" style={{ left: Math.min(Math.max(x(hv.m.end), L), width - 240), top: layout[hv.ri]!.top + 30 + hv.ci * ROW }}>
            <strong>{hv.r.name}: {hv.c.label}</strong>
            <div>{STATE_WORD[hv.m.state]}{hv.m.state === 'open' ? ` · ${formatDuration(hv.m.remainingMs)} left` : hv.m.overdueMs > 0 ? ` · ${formatDuration(hv.m.overdueMs)} past the deadline` : ''}</div>
            <div className="ic-sub">{hv.c.deadlineHours}h window from {fmt(hv.m.start)}</div>
          </div>
        )}
      </div>
      <div className="ic-hlegend" aria-hidden="true">
        <svg width="14" height="14"><path d="M7 1 l5 6 l-5 6 l-5 -6 z" className="ic-diamond" /></svg> deadline
        <i className="ic-hatch-sw" style={{ marginLeft: 12 }} /> time past the deadline
        <i className="ic-now-sw" style={{ marginLeft: 12 }} /> now
        <i className="ic-hcell-sw" style={{ marginLeft: 12, background: 'var(--ic-good)' }} /> met
        <i className="ic-hcell-sw" style={{ background: 'var(--ic-c1)' }} /> running
        <i className="ic-hcell-sw" style={{ background: 'var(--ic-warn)' }} /> missed, remedy delivered
      </div>
    </section>
  )
}
