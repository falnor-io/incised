import { useMemo, useState, type PointerEvent as RPointerEvent } from 'react'
import { linear, niceTicks } from './chart.js'
import { useWidth } from './hooks.js'
import { pChart, RULE_TEXT, type SpcPoint } from './spc.js'
import { cx, pct } from './util.js'

export type ControlChartProps = {
  title: string
  data: SpcPoint[]
  /** Points used to set the centre line. Defaults to all of them. */
  baseline?: number
  /** Vertical markers, for example a model release. `at` is a point index. */
  markers?: { at: number; label: string }[]
  height?: number
  className?: string
}

const M = { l: 46, r: 14, t: 26, b: 30 }

/**
 * A control chart for a failure rate. It draws the centre line and the 1, 2 and 3 sigma limits for each
 * point's own sample size, and marks points that break the standard run rules. A signal means "look closer",
 * and the wording says so: it never claims something is broken, and a quiet chart never claims it is safe.
 */
export function ControlChart({ title, data, baseline, markers = [], height = 280, className }: ControlChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>(760)
  const [hover, setHover] = useState<number | null>(null)
  const r = useMemo(() => pChart(data, baseline), [data, baseline])
  const n = data.length
  const w = width - M.l - M.r
  const h = height - M.t - M.b
  const maxY = Math.max(0.02, ...r.points.map((p) => Math.max(p.ucl, p.p))) * 1.12
  const x = linear([0, Math.max(n - 1, 1)], [M.l, M.l + w])
  const y = linear([0, maxY], [M.t + h, M.t])
  const ticks = niceTicks(0, maxY, 5)
  const first = r.signals[0]
  const stepped = (key: 'ucl' | 'lcl') => r.points.map((p, i) => `${i ? 'L' : 'M'}${x(i - 0.5 < 0 ? 0 : i - 0.5)} ${y(p[key])} L${x(i + 0.5 > n - 1 ? n - 1 : i + 0.5)} ${y(p[key])}`).join(' ')
  const band = (k: number) =>
    r.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(Math.min(maxY, r.center + k * p.sigma))}`).join(' ') + ' ' +
    [...r.points].reverse().map((p, j) => `L${x(n - 1 - j)} ${y(Math.max(0, r.center - k * p.sigma))}`).join(' ') + ' Z'
  const baseEnd = baseline !== undefined ? Math.min(baseline, n) : n

  const onMove = (e: RPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(n - 1, Math.round(x.invert(e.clientX - rect.left)))))
  }
  const hp = hover !== null ? r.points[hover] : undefined

  return (
    <section className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <div>
          <h3 className="ol-title" style={{ margin: 0 }}>{title}</h3>
          <div className="ol-sub">Centre {pct(r.center)} from the first {baseEnd} points · 3 sigma limits</div>
        </div>
        <span className="ol-pill" data-tone={r.signals.length ? 'warn' : 'good'} role="status">{r.signals.length ? `${new Set(r.signals.map((s) => s.index)).size} to look at` : 'No signal'}</span>
      </div>
      <div ref={ref} className="ol-spc">
        <svg width={width} height={height} role="img" aria-label={`${title}. ${r.signals.length ? `${r.signals.length} signals. First at ${r.points[first!.index]!.label}.` : 'No signals.'}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}><line x1={M.l} x2={M.l + w} y1={y(t)} y2={y(t)} className="ol-axis-line" /><text x={M.l - 8} y={y(t) + 4} textAnchor="end" className="ol-axis-text">{pct(t, 0)}</text></g>
          ))}
          <path d={band(3)} className="ol-zone3" />
          <path d={band(2)} className="ol-zone2" />
          <path d={band(1)} className="ol-zone1" />
          <path d={stepped('ucl')} className="ol-limit" fill="none" />
          <path d={stepped('lcl')} className="ol-limit" fill="none" />
          <line x1={M.l} x2={M.l + w} y1={y(r.center)} y2={y(r.center)} className="ol-center" />
          <text x={M.l + w} y={y(r.center) - 5} textAnchor="end" className="ol-axis-text">centre {pct(r.center)}</text>
          {baseline !== undefined && baseline < n && <rect x={x(0)} y={M.t} width={x(baseline - 0.5) - x(0)} height={h} className="ol-baseline" />}
          {markers.map((m) => (
            <g key={m.label + m.at}><line x1={x(m.at)} x2={x(m.at)} y1={M.t - 6} y2={M.t + h} className="ol-marker" /><text x={x(m.at) + 4} y={M.t - 10} className="ol-axis-text">{m.label}</text></g>
          ))}
          <polyline points={r.points.map((p, i) => `${x(i)},${y(p.p)}`).join(' ')} fill="none" className="ol-series" />
          {r.points.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.p)} r={p.rules.length ? 5.5 : 3} className="ol-pt" data-signal={p.rules.length > 0} data-hover={hover === i} />
              {p.rules.length > 0 && <text x={x(i)} y={y(p.p) - 10} textAnchor="middle" className="ol-rule">{p.rules.join(',')}</text>}
            </g>
          ))}
          {r.points.map((p, i) => (i % Math.max(1, Math.ceil(n / Math.floor(w / 56))) === 0 ? <text key={`l${i}`} x={x(i)} y={height - 8} textAnchor="middle" className="ol-axis-text">{p.label}</text> : null))}
          {hp && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + h} className="ol-cross" />}
        </svg>
        {hp && hover !== null && (
          <div className="ol-tip" role="tooltip" style={{ left: Math.min(x(hover) + 12, width - 240), top: 40 }}>
            <strong>{hp.label}</strong>
            <div className="ol-mono">{pct(hp.p)} failed · {data[hover]!.failures} of {hp.n}</div>
            <div className="ol-sub">limits {pct(hp.lcl)} to {pct(hp.ucl)} · {hp.z >= 0 ? '+' : ''}{hp.z.toFixed(1)} sigma</div>
            {hp.rules.map((rule) => <div key={rule} style={{ color: 'var(--ol-warn)' }}>Rule {rule}: {RULE_TEXT[rule]}</div>)}
          </div>
        )}
      </div>
      <p className="ol-sub" style={{ margin: '8px 0 0' }} title={first ? `${RULE_TEXT[first.rule]}. A signal means look closer, not that something broke.` : 'No point breaks a run rule. That is not proof the rate is safe, only that it behaves like the baseline.'}>
        {first ? `First signal ${r.points[first.index]!.label}, rule ${first.rule}` : 'Behaving like the baseline'}
      </p>
    </section>
  )
}
