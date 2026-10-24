import { useId, useMemo } from 'react'
import type { ApprovalFlowProps } from '../schemas.js'
import { cx } from './util.js'

const W = 136
const H = 48
const GAP_X = 72
const GAP_Y = 22
const PAD = 12

type Placed = { id: string; label: string; kind: 'step' | 'gate' | 'end'; x: number; y: number; layer: number }

/** Layers each node one past its deepest parent. Edges that would close a loop are ignored for layering. */
export function layerNodes(ids: string[], edges: { from: string; to: string }[]): Map<string, number> {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  const hasIn = new Set<string>()
  for (const e of edges) {
    if (out.has(e.from) && out.has(e.to) && e.from !== e.to) {
      out.get(e.from)!.push(e.to)
      hasIn.add(e.to)
    }
  }
  const layer = new Map<string, number>()
  const stack = new Set<string>()
  const visit = (id: string, depth: number) => {
    if (stack.has(id)) return
    if ((layer.get(id) ?? -1) >= depth) return
    layer.set(id, depth)
    stack.add(id)
    for (const next of out.get(id) ?? []) visit(next, depth + 1)
    stack.delete(id)
  }
  const roots = ids.filter((id) => !hasIn.has(id))
  for (const id of roots.length ? roots : ids.slice(0, 1)) visit(id, 0)
  for (const id of ids) if (!layer.has(id)) visit(id, 0)
  return layer
}

/** A left-to-right diagram of how an approval moves: steps, gates where a person decides, and where it ends. */
export function ApprovalFlow({ title, nodes, edges, completed = [], active, className }: ApprovalFlowProps & { className?: string }) {
  const marker = useId().replace(/:/g, '')
  const { placed, width, height, arcs } = useMemo(() => {
    const layers = layerNodes(nodes.map((n) => n.id), edges)
    // Edges that jump over a column arc above the diagram, so they never run behind the nodes in between.
    const arcs = new Map<number, number>()
    edges.forEach((e, i) => {
      const a = layers.get(e.from)
      const b = layers.get(e.to)
      if (a !== undefined && b !== undefined && b - a > 1) arcs.set(i, arcs.size)
    })
    const top = PAD + (arcs.size ? 8 + arcs.size * 16 : 0)
    const columns = new Map<number, typeof nodes>()
    for (const n of nodes) columns.set(layers.get(n.id) ?? 0, [...(columns.get(layers.get(n.id) ?? 0) ?? []), n])
    const maxRows = Math.max(...[...columns.values()].map((c) => c.length), 1)
    const colCount = Math.max(...columns.keys(), 0) + 1
    const placed = new Map<string, Placed>()
    for (const [layer, col] of columns) {
      const offset = ((maxRows - col.length) * (H + GAP_Y)) / 2
      col.forEach((n, row) => placed.set(n.id, { ...n, layer, x: PAD + layer * (W + GAP_X), y: top + offset + row * (H + GAP_Y) }))
    }
    return { placed, arcs, width: PAD * 2 + colCount * W + (colCount - 1) * GAP_X, height: top + PAD + maxRows * H + (maxRows - 1) * GAP_Y }
  }, [nodes, edges])

  const state = (id: string) => (id === active ? 'active' : completed.includes(id) ? 'done' : 'todo')
  return (
    <section className={cx('ic', className)} aria-label={title}>
      <h3 className="ic-title">{title}</h3>
      <div className="ic-scroll">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${nodes.length} steps`} className="ic-flow">
          <defs>
            <marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" className="ic-flow-arrow" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const a = placed.get(e.from)
            const b = placed.get(e.to)
            if (!a || !b) return null
            const x1 = a.x + W
            const y1 = a.y + H / 2
            const x2 = b.x
            const y2 = b.y + H / 2
            const mx = (x1 + x2) / 2
            const arc = arcs.get(i)
            const lane = arc === undefined ? 0 : PAD + arc * 16
            const d =
              arc !== undefined
                ? `M${x1} ${y1} C${x1 + 36} ${lane} ${x2 - 36} ${lane} ${x2 - 2} ${y2}`
                : x2 > x1
                  ? `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2 - 2} ${y2}`
                  : `M${x1} ${y1} C${x1 + 40} ${y1 - 50} ${x2 - 40} ${y2 - 50} ${x2 - 2} ${y2}`
            const labelY = arc !== undefined ? lane + 3 : (y1 + y2) / 2 - 6
            return (
              <g key={`${e.from}-${e.to}-${i}`}>
                <path d={d} className="ic-flow-edge" markerEnd={`url(#${marker})`} />
                {e.label && <text x={mx} y={labelY} textAnchor="middle" className="ic-flow-label">{e.label}</text>}
              </g>
            )
          })}
          {[...placed.values()].map((n) => (
            <g key={n.id} data-state={state(n.id)} data-kind={n.kind}>
              <rect x={n.x} y={n.y} width={W} height={H} rx={n.kind === 'end' ? H / 2 : 8} className="ic-flow-node" />
              <text x={n.x + W / 2} y={n.y + H / 2 + (n.kind === 'gate' ? 8 : 4)} textAnchor="middle" className="ic-flow-text">{n.label}</text>
              {n.kind === 'gate' && <text x={n.x + W / 2} y={n.y + 15} textAnchor="middle" className="ic-flow-tag">DECISION</text>}
            </g>
          ))}
        </svg>
      </div>
      <ol className="ic-sr">
        {nodes.map((n) => <li key={n.id}>{n.label} ({n.kind}, {state(n.id)}) leads to {edges.filter((e) => e.from === n.id).map((e) => placed.get(e.to)?.label ?? e.to).join(', ') || 'nothing'}</li>)}
      </ol>
    </section>
  )
}
