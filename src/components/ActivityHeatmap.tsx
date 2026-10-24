import { useMemo, useState } from 'react'
import { useWidth } from './hooks.js'
import { layoutHeat, type Cell, type Day } from './heat.js'
import { cx } from './util.js'

export type ActivityHeatmapProps = { title: string; days: Day[]; weeks?: number; noun?: string; className?: string }

const GAP = 3
const LEFT = 30
const TOP = 20
const DAYS = ['Mon', '', 'Wed', '', 'Fri', '', '']

/** A calendar of activity. Colour is the day's quartile among active days. A red mark means a guarantee was breached that day. */
export function ActivityHeatmap({ title, days, weeks = 26, noun = 'events', className }: ActivityHeatmapProps) {
  const layout = useMemo(() => layoutHeat(days, weeks), [days, weeks])
  const [hover, setHover] = useState<Cell | null>(null)
  const [ref, avail] = useWidth<HTMLDivElement>(760)
  const CELL = Math.max(10, Math.min(22, Math.floor((avail - 36 - LEFT) / Math.max(layout.weeks, 1)) - GAP))
  const width = LEFT + layout.weeks * (CELL + GAP)
  const height = TOP + 7 * (CELL + GAP)
  const breaches = layout.cells.filter((c) => c.inRange && c.breaches > 0).length
  return (
    <section className={cx('ic', className)} aria-label={title}>
      <div className="ic-head-row">
        <div>
          <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
          <div className="ic-sub">{layout.total.toLocaleString('en')} {noun} in {layout.weeks} weeks{layout.busiest ? ` · busiest ${layout.busiest.date} (${layout.busiest.count})` : ''}</div>
        </div>
        <span className="ic-pill" data-tone={breaches ? 'warn' : 'good'}>{breaches ? `${breaches} ${breaches === 1 ? 'day' : 'days'} with a breach` : 'No breaches'} · longest run without one: {layout.breachFreeRun} days</span>
      </div>
      <div ref={ref} className="ic-scroll" style={{ position: 'relative' }}>
        <svg width={width} height={height} role="img" aria-label={`${title}. ${layout.total} ${noun}, ${breaches} days with a breach.`}>
          {layout.months.map((m) => <text key={m.week} x={LEFT + m.week * (CELL + GAP)} y={11} className="ic-axis-text">{m.label}</text>)}
          {DAYS.map((d, i) => (d ? <text key={d} x={0} y={TOP + i * (CELL + GAP) + CELL - 2} className="ic-axis-text">{d}</text> : null))}
          {layout.cells.map((c) => {
            if (!c.inRange) return null
            const cx0 = LEFT + c.week * (CELL + GAP)
            const cy0 = TOP + c.weekday * (CELL + GAP)
            return (
              <g key={c.date} onPointerEnter={() => setHover(c)} onPointerLeave={() => setHover(null)}>
                <rect x={cx0} y={cy0} width={CELL} height={CELL} rx={3} className="ic-hcell" data-level={c.level} data-hover={hover?.date === c.date} />
                {c.breaches > 0 && <circle cx={cx0 + CELL - 3} cy={cy0 + 3} r={3} className="ic-hbreach" />}
              </g>
            )
          })}
        </svg>
        {hover && (
          <div className="ic-tip" role="tooltip" style={{ left: Math.min(LEFT + hover.week * (CELL + GAP) + 18, width - 180), top: TOP + hover.weekday * (CELL + GAP) + 22 }}>
            <strong>{hover.date}</strong>
            <div className="ic-mono">{hover.count} {noun}</div>
            {hover.breaches > 0 && <div style={{ color: 'var(--ic-bad)' }}>{hover.breaches} {hover.breaches === 1 ? 'breach' : 'breaches'}</div>}
          </div>
        )}
      </div>
      <div className="ic-hlegend" aria-hidden="true">Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className="ic-hcell-sw" data-level={l} />)} More <span style={{ marginLeft: 12 }}><i className="ic-hbreach-sw" /> breach</span></div>
    </section>
  )
}
