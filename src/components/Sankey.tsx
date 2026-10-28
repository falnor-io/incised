'use client'

import { useMemo, useState } from 'react'
import { formatCount } from './chart.js'
import { useWidth } from './hooks.js'
import { PlaybackBar, usePlayback } from './playback.js'
import { gateFor, pendingRow, type Status } from './status.js'
import { layoutSankey, type SankeyLink, type SankeyNode } from './sankeyLayout.js'
import { cx, pct } from './util.js'

export type SankeyProps = {
  title: string
  nodes: (SankeyNode & { tone?: 'good' | 'warn' | 'bad' })[]
  links: SankeyLink[]
  unit?: string
  height?: number
  /** Replay the flow one column at a time. */
  playable?: boolean
  param?: string
  status?: Status
  className?: string
}

const TONE = { good: 'var(--ol-good)', warn: 'var(--ol-warn)', bad: 'var(--ol-bad)' } as const

/**
 * Where cases go. Bands are sized by volume on one scale. Hover a band or a node to see exactly how much
 * took that path, and any node where more came in than went out shows the cases that were not accounted for.
 */
export function Sankey({ title, nodes, links, unit = 'cases', height = 340, playable = false, param, status, className }: SankeyProps) {
  const [ref, width] = useWidth<HTMLDivElement>(760)
  const layout = useMemo(() => layoutSankey(nodes, links, { width, height, padX: Math.min(130, width * 0.2) }), [nodes, links, width, height])
  const columns = Math.max(0, ...layout.nodes.map((n) => n.column))
  const pb = usePlayback(columns, { param })
  const gate = gateFor(status, { title, className, rows: 4 })
  if (gate) return gate
  const [hover, setHover] = useState<{ kind: 'link' | 'node'; key: string } | null>(null)
  const tone = new Map(nodes.map((n) => [n.id, n.tone]))
  const byId = new Map(layout.nodes.map((n) => [n.id, n]))
  const leaks = layout.nodes.filter((n) => n.leak > 0)
  const total = Math.max(...layout.nodes.filter((n) => n.column === 0).map((n) => n.value), 0)
  const linkKey = (l: SankeyLink) => `${l.source}>${l.target}`
  const active = (l: SankeyLink) => !hover || (hover.kind === 'link' ? hover.key === linkKey(l) : l.source === hover.key || l.target === hover.key)
  const hl = hover?.kind === 'link' ? layout.links.find((l) => linkKey(l) === hover.key) : undefined

  return (
    <section role="group" className={cx('ol', className)} aria-label={title} aria-busy={status === 'partial' || undefined}>
      <div className="ol-head-row">
        <div>
          <h3 className="ol-title">{title}</h3>
          <div className="ol-sub">{formatCount(total)} {unit}</div>
        </div>
        <span className="ol-pill" data-tone={leaks.length ? 'bad' : 'good'} role="status">
          {leaks.length ? `${formatCount(leaks.reduce((a, n) => a + n.leak, 0))} unaccounted for` : 'All accounted for'}
        </span>
      </div>
      <div ref={ref} className="ol-sankey">
        <svg width={width} height={height} role="img" aria-label={`${title}. ${layout.links.length} flows.`}>
          <g>
            {layout.links.map((l) => {
              const t = tone.get(l.target)
              return (
                <path key={linkKey(l)} d={l.path} fill="none" strokeWidth={l.width} className="ol-slink" data-active={active(l)} data-ahead={playable && byId.get(l.source)!.column > pb.at ? 'true' : undefined} style={{ stroke: t ? TONE[t] : 'var(--ol-c1)' }}
                  onPointerEnter={() => setHover({ kind: 'link', key: linkKey(l) })} onPointerLeave={() => setHover(null)} />
              )
            })}
          </g>
          {layout.nodes.map((n) => {
            const left = n.column === 0
            const t = tone.get(n.id)
            const fit = Math.max(4, Math.floor((left ? n.x - 10 : width - n.x - 24) / 6.6))
            const label = n.label.length > fit ? `${n.label.slice(0, fit - 1)}…` : n.label
            return (
              <g key={n.id} data-ahead={playable && n.column > pb.at + 1 ? 'true' : undefined} onPointerEnter={() => setHover({ kind: 'node', key: n.id })} onPointerLeave={() => setHover(null)} data-leak={n.leak > 0}>
                <title>{n.label}</title>
                <rect x={n.x} y={n.y} width={14} height={n.h} rx={2} className="ol-snode" style={{ fill: t ? TONE[t] : 'var(--ol-fg)' }} />
                <text x={left ? n.x - 8 : n.x + 22} y={n.y + n.h / 2 - 2} textAnchor={left ? 'end' : 'start'} className="ol-slabel">{label}</text>
                <text x={left ? n.x - 8 : n.x + 22} y={n.y + n.h / 2 + 12} textAnchor={left ? 'end' : 'start'} className="ol-axis-text">
                  {formatCount(n.value)}{total ? ` · ${pct(n.value / total, 0)}` : ''}{n.leak > 0 ? ` · ${formatCount(n.leak)} missing` : ''}
                </text>
              </g>
            )
          })}
        </svg>
        {hl && (
          <div className="ol-tip" role="tooltip" style={{ left: Math.min((hl.x0 + hl.x1) / 2, width - 230), top: Math.max(4, Math.min(hl.y0, hl.y1) - 64) }}>
            <strong>{byId.get(hl.source)!.label} → {byId.get(hl.target)!.label}</strong>
            <div className="ol-mono">{formatCount(hl.value)} {unit}</div>
            <div className="ol-sub">{pct(hl.value / (byId.get(hl.source)!.outflow || 1), 0)} of what left {byId.get(hl.source)!.label}</div>
          </div>
        )}
      </div>
      {pendingRow(status)}
      {playable && columns > 1 && <PlaybackBar pb={pb} count={columns} label={title} />}
      <table className="ol-sr"><caption>{title}</caption><thead><tr><th>From</th><th>To</th><th>{unit}</th></tr></thead><tbody>{layout.links.map((l) => <tr key={linkKey(l)}><td>{byId.get(l.source)!.label}</td><td>{byId.get(l.target)!.label}</td><td>{l.value}</td></tr>)}</tbody></table>
    </section>
  )
}
