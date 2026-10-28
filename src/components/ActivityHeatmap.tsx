'use client'

import { useMemo, useState } from 'react'
import { after } from './theatre.js'
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
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title">{title}</h3>
        <dl className="ol-figs" aria-label="Summary">
          <div><dt>{noun}</dt><dd>{layout.total.toLocaleString('en')}</dd></div>
          <div data-bad={breaches > 0}><dt>{breaches === 1 ? 'day with a breach' : 'days with a breach'}</dt><dd>{breaches}</dd></div>
          <div><dt>longest run without one, in days</dt><dd>{layout.breachFreeRun}</dd></div>
        </dl>
      </div>
      <div ref={ref} className="ol-scroll" style={{ position: 'relative' }}>
        <svg width={width} height={height} role="img" aria-label={`${title}. ${layout.total} ${noun}, ${breaches} days with a breach.`}>
          {layout.months.map((m) => <text key={m.week} x={LEFT + m.week * (CELL + GAP)} y={11} className="ol-axis-text">{m.label}</text>)}
          {DAYS.map((d, i) => (d ? <text key={d} x={0} y={TOP + i * (CELL + GAP) + CELL - 2} className="ol-axis-text">{d}</text> : null))}
          {layout.cells.map((c) => {
            if (!c.inRange) return null
            const cx0 = LEFT + c.week * (CELL + GAP)
            const cy0 = TOP + c.weekday * (CELL + GAP)
            return (
              <g key={c.date} onPointerEnter={() => setHover(c)} onPointerLeave={() => setHover(null)}>
                <rect x={cx0} y={cy0} width={CELL} height={CELL} rx={3} className="ol-hcell ol-pop" style={after(c.week)} data-level={c.level} data-hover={hover?.date === c.date} />
                {c.breaches > 0 && <circle cx={cx0 + CELL - 3} cy={cy0 + 3} r={3} className="ol-hbreach" />}
              </g>
            )
          })}
        </svg>
        {hover && (
          <div className="ol-tip" role="tooltip" style={{ left: Math.min(LEFT + hover.week * (CELL + GAP) + 18, width - 180), top: TOP + hover.weekday * (CELL + GAP) + 22 }}>
            <strong>{hover.date}</strong>
            <div className="ol-mono">{hover.count} {noun}</div>
            {hover.breaches > 0 && <div className="ol-text-bad">{hover.breaches} {hover.breaches === 1 ? 'breach' : 'breaches'}</div>}
          </div>
        )}
      </div>
      <div className="ol-hlegend" aria-hidden="true">Less {[0, 1, 2, 3, 4].map((l) => <i key={l} className="ol-hcell-sw" data-level={l} />)} More <span className="ol-ml-3"><i className="ol-hbreach-sw" /> breach</span></div>
    </section>
  )
}
