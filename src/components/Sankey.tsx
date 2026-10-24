import { useMemo, useState } from 'react'
import { formatCount } from './chart.js'
import { useWidth } from './hooks.js'
import { layoutSankey, type SankeyLink, type SankeyNode } from './sankeyLayout.js'
import { cx, pct } from './util.js'

export type SankeyProps = {
  title: string
  nodes: (SankeyNode & { tone?: 'good' | 'warn' | 'bad' })[]
  links: SankeyLink[]
  unit?: string
  height?: number
  className?: string
}

const TONE = { good: 'var(--ic-good)', warn: 'var(--ic-warn)', bad: 'var(--ic-bad)' } as const

/**
 * Where cases go. Bands are sized by volume on one scale. Hover a band or a node to see exactly how much
 * took that path, and any node where more came in than went out shows the cases that were not accounted for.
 */
export function Sankey({ title, nodes, links, unit = 'cases', height = 340, className }: SankeyProps) {
  const [ref, width] = useWidth<HTMLDivElement>(760)
  const layout = useMemo(() => layoutSankey(nodes, links, { width, height, padX: Math.min(150, width * 0.18) }), [nodes, links, width, height])
  const [hover, setHover] = useState<{ kind: 'link' | 'node'; key: string } | null>(null)
  const tone = new Map(nodes.map((n) => [n.id, n.tone]))
  const byId = new Map(layout.nodes.map((n) => [n.id, n]))
  const leaks = layout.nodes.filter((n) => n.leak > 0)
  const total = Math.max(...layout.nodes.filter((n) => n.column === 0).map((n) => n.value), 0)
  const linkKey = (l: SankeyLink) => `${l.source}>${l.target}`
  const active = (l: SankeyLink) => !hover || (hover.kind === 'link' ? hover.key === linkKey(l) : l.source === hover.key || l.target === hover.key)
  const hl = hover?.kind === 'link' ? layout.links.find((l) => linkKey(l) === hover.key) : undefined

  return (
    <section className={cx('ic', className)} aria-label={title}>
      <div className="ic-head-row">
        <div>
          <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
          <div className="ic-sub">{formatCount(total)} {unit} in · band height is proportional to volume</div>
        </div>
        <span className="ic-pill" data-tone={leaks.length ? 'bad' : 'good'} role="status">
          {leaks.length ? `${formatCount(leaks.reduce((a, n) => a + n.leak, 0))} ${unit} unaccounted for` : `Every ${unit.replace(/s$/, '')} accounted for`}
        </span>
      </div>
      <div ref={ref} className="ic-sankey">
        <svg width={width} height={height} role="img" aria-label={`${title}. ${layout.links.length} flows.`}>
          <g>
            {layout.links.map((l) => {
              const t = tone.get(l.target)
              return (
                <path key={linkKey(l)} d={l.path} fill="none" strokeWidth={l.width} className="ic-slink" data-active={active(l)} style={{ stroke: t ? TONE[t] : 'var(--ic-c1)' }}
                  onPointerEnter={() => setHover({ kind: 'link', key: linkKey(l) })} onPointerLeave={() => setHover(null)} />
              )
            })}
          </g>
          {layout.nodes.map((n) => {
            const left = n.column === 0
            const t = tone.get(n.id)
            return (
              <g key={n.id} onPointerEnter={() => setHover({ kind: 'node', key: n.id })} onPointerLeave={() => setHover(null)} data-leak={n.leak > 0}>
                <rect x={n.x} y={n.y} width={14} height={n.h} rx={2} className="ic-snode" style={{ fill: t ? TONE[t] : 'var(--ic-fg)' }} />
                <text x={left ? n.x - 8 : n.x + 22} y={n.y + n.h / 2 - 2} textAnchor={left ? 'end' : 'start'} className="ic-slabel">{n.label}</text>
                <text x={left ? n.x - 8 : n.x + 22} y={n.y + n.h / 2 + 12} textAnchor={left ? 'end' : 'start'} className="ic-axis-text">
                  {formatCount(n.value)}{total ? ` · ${pct(n.value / total, 0)}` : ''}{n.leak > 0 ? ` · ${formatCount(n.leak)} missing` : ''}
                </text>
              </g>
            )
          })}
        </svg>
        {hl && (
          <div className="ic-tip" role="tooltip" style={{ left: Math.min((hl.x0 + hl.x1) / 2, width - 230), top: Math.max(4, Math.min(hl.y0, hl.y1) - 64) }}>
            <strong>{byId.get(hl.source)!.label} → {byId.get(hl.target)!.label}</strong>
            <div className="ic-mono">{formatCount(hl.value)} {unit}</div>
            <div className="ic-sub">{pct(hl.value / (byId.get(hl.source)!.outflow || 1), 0)} of what left {byId.get(hl.source)!.label}</div>
          </div>
        )}
      </div>
      {leaks.length > 0 && (
        <p className="ic-sub" style={{ margin: '8px 0 0', color: 'var(--ic-bad)' }}>
          {leaks.map((n) => `${formatCount(n.leak)} ${unit} entered "${n.label}" and did not leave it`).join('. ')}. Find where they went before relying on this flow.
        </p>
      )}
      <table className="ic-sr"><caption>{title}</caption><thead><tr><th>From</th><th>To</th><th>{unit}</th></tr></thead><tbody>{layout.links.map((l) => <tr key={linkKey(l)}><td>{byId.get(l.source)!.label}</td><td>{byId.get(l.target)!.label}</td><td>{l.value}</td></tr>)}</tbody></table>
    </section>
  )
}
