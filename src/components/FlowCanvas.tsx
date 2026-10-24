import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type WheelEvent } from 'react'
import { useWidth } from './hooks.js'
import { fitView, layoutFlow, NODE_H, NODE_W, roundedPath, zoomAt, type FlowEdge, type FlowNode, type View } from './flow.js'
import { Fit, Lock } from './icons.js'
import { cx } from './util.js'

export type FlowCanvasProps = { title: string; nodes: FlowNode[]; edges: FlowEdge[]; height?: number; defaultSelected?: string; className?: string }

const FIT_PAD = { top: 24, right: 24, bottom: 92, left: 24 }
const STATUS_LABEL = { done: 'Done', active: 'In progress', todo: 'Not started', blocked: 'Blocked' } as const
const KIND_LABEL = { start: 'Start', step: 'Step', gate: 'Decision', end: 'End' } as const

/**
 * A diagram you can move around in: drag to pan, ctrl or cmd and scroll to zoom, a minimap, zoom controls,
 * swimlanes when nodes have owners, rounded orthogonal edges, and a click on any node to trace what feeds it
 * and what it leads to. The layout is computed, so you only describe the steps and how they connect.
 */
export function FlowCanvas({ title, nodes, edges, height = 400, defaultSelected, className }: FlowCanvasProps) {
  const layout = useMemo(() => layoutFlow(nodes, edges), [nodes, edges])
  const [hostRef, width] = useWidth<HTMLDivElement>(820)
  const size = useMemo(() => ({ width, height }), [width, height])
  const [view, setView] = useState<View>(() => fitView(layout.bounds, { width: 820, height }, FIT_PAD))
  const [userMoved, setUserMoved] = useState(false)
  const [selected, setSelected] = useState<string | null>(defaultSelected ?? null)
  const [locked, setLocked] = useState(false)
  const drag = useRef<{ x: number; y: number; v: View } | null>(null)
  const uid = useId().replace(/:/g, '')

  // Keep the diagram fitted as the container resizes, until the person moves it themselves.
  useEffect(() => { if (!userMoved) setView(fitView(layout.bounds, size, FIT_PAD)) }, [layout, size, userMoved])

  const move = (v: View) => { if (!locked) { setUserMoved(true); setView(v) } }
  const zoom = (f: number) => move(zoomAt(view, f, size.width / 2, size.height / 2))
  const fit = () => { setUserMoved(false); setView(fitView(layout.bounds, size, FIT_PAD)) }

  const byId = new Map(layout.nodes.map((n) => [n.id, n]))
  const sel = selected ? byId.get(selected) : undefined
  const feeds = sel ? layout.edges.filter((e) => e.to === sel.id).map((e) => byId.get(e.from)!).filter(Boolean) : []
  const leads = sel ? layout.edges.filter((e) => e.from === sel.id).map((e) => byId.get(e.to)!).filter(Boolean) : []
  const related = new Set(sel ? [sel.id, ...feeds.map((n) => n.id), ...leads.map((n) => n.id)] : [])
  const edgeOn = (e: { from: string; to: string }) => !sel || e.from === sel.id || e.to === sel.id

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-node],[data-ui]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, v: view }
  }
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (d) move({ ...d.v, x: d.v.x + e.clientX - d.x, y: d.v.y + e.clientY - d.y })
  }
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return
    const r = e.currentTarget.getBoundingClientRect()
    move(zoomAt(view, e.deltaY > 0 ? 0.9 : 1.1, e.clientX - r.left, e.clientY - r.top))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 40
    if (e.key === '+' || e.key === '=') zoom(1.2)
    else if (e.key === '-') zoom(1 / 1.2)
    else if (e.key === '0') fit()
    else if (e.key === 'ArrowLeft') move({ ...view, x: view.x + step })
    else if (e.key === 'ArrowRight') move({ ...view, x: view.x - step })
    else if (e.key === 'ArrowUp') move({ ...view, y: view.y + step })
    else if (e.key === 'ArrowDown') move({ ...view, y: view.y - step })
    else if (e.key === 'Escape') setSelected(null)
    else return
    e.preventDefault()
  }

  return (
    <section className={cx('ic', className)} aria-label={title}>
      <div className="ic-head-row">
        <div>
          <h3 className="ic-title" style={{ margin: 0 }}>{title}</h3>
          <div className="ic-sub">{nodes.length} steps · {edges.length} connections{layout.lanes.length ? ` · ${layout.lanes.length} owners` : ''}</div>
        </div>
        <div className="ic-legendrow" aria-hidden="true">
          <span><i className="ic-ldot" data-s="done" /> Done</span><span><i className="ic-ldot" data-s="active" /> In progress</span><span><i className="ic-ldot" data-s="blocked" /> Blocked</span><span><i className="ic-ldot" data-s="todo" /> Not started</span>
        </div>
      </div>
      <div ref={hostRef} className="ic-canvas" style={{ height }} tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onWheel={onWheel} data-locked={locked}
        aria-label="Flow diagram. Drag to move. Plus and minus zoom, zero fits, arrow keys pan. Tab moves between steps.">
        <svg className="ic-dots" width="100%" height="100%" aria-hidden="true">
          <defs>
            <pattern id={`dots${uid}`} width={24 * view.k} height={24 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
              <circle cx={1} cy={1} r={Math.max(0.7, view.k)} className="ic-dot-fill" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#dots${uid})`} />
        </svg>

        <div className="ic-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          {layout.lanes.map((l, i) => (
            <div key={l.owner} className="ic-laneband" data-odd={i % 2} style={{ top: l.y, height: l.height, width: layout.bounds.width, left: layout.bounds.x }}>
              <span>{l.owner}</span>
            </div>
          ))}
          <svg className="ic-edges" width={layout.bounds.width} height={layout.bounds.height} viewBox={`0 ${layout.bounds.y} ${layout.bounds.width} ${layout.bounds.height}`} style={{ top: layout.bounds.y }} overflow="visible" aria-hidden="true">
            <defs>
              <marker id={`arr${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" className="ic-flow-arrow" /></marker>
            </defs>
            {layout.edges.map((e, i) => (
              <g key={`${e.from}>${e.to}>${i}`} data-on={edgeOn(e)} data-animated={e.animated || byId.get(e.from)?.status === 'active'}>
                <path d={roundedPath(e.points, 10)} className="ic-flow-edge" markerEnd={`url(#arr${uid})`} />
                {e.label && (
                  <g transform={`translate(${e.label_at.x} ${e.label_at.y})`}>
                    <rect x={-(e.label.length * 3.3 + 7)} y={-9} width={e.label.length * 6.6 + 14} height={18} rx={9} className="ic-edge-pill" />
                    <text textAnchor="middle" y={4} className="ic-flow-label">{e.label}</text>
                  </g>
                )}
              </g>
            ))}
          </svg>
          {layout.nodes.map((n) => (
            <button key={n.id} type="button" data-node data-kind={n.kind} data-status={n.status ?? 'todo'} data-selected={selected === n.id} data-dim={!!sel && !related.has(n.id)}
              className="ic-fnode" style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }} onClick={() => setSelected(selected === n.id ? null : n.id)}
              aria-label={`${n.label}. ${KIND_LABEL[n.kind]}. ${STATUS_LABEL[n.status ?? 'todo']}.${n.owner ? ` Owner ${n.owner}.` : ''}`} aria-pressed={selected === n.id}>
              <i className="ic-handle" data-side="l" aria-hidden="true" /><i className="ic-handle" data-side="r" aria-hidden="true" />
              <span className="ic-fkind">{KIND_LABEL[n.kind]}<i className="ic-ldot" data-s={n.status ?? 'todo'} /></span>
              <span className="ic-flabel">{n.label}</span>
            </button>
          ))}
        </div>

        <div className="ic-fctl" data-ui role="group" aria-label="View controls">
          <button type="button" onClick={() => zoom(1.2)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</button>
          <button type="button" onClick={fit} aria-label="Fit to view"><Fit /></button>
          <button type="button" onClick={() => setLocked((l) => !l)} aria-pressed={locked} aria-label={locked ? 'Unlock view' : 'Lock view'}><Lock open={!locked} /></button>
        </div>
        <MiniMap layout={layout} view={view} size={size} onMove={move} />
      </div>

      <div className="ic-detail" aria-live="polite">
        {sel ? (
          <div className="ic-fdetail">
            <div>
              <strong>{sel.label}</strong> <span className="ic-pill" data-tone={sel.status === 'done' ? 'good' : sel.status === 'blocked' ? 'bad' : sel.status === 'active' ? 'warn' : undefined}>{STATUS_LABEL[sel.status ?? 'todo']}</span>
              <div className="ic-sub">{KIND_LABEL[sel.kind]}{sel.owner ? ` · owned by ${sel.owner}` : ''}</div>
              {sel.detail && <p style={{ margin: '6px 0 0' }}>{sel.detail}</p>}
            </div>
            <div><div className="ic-sub">Comes from</div>{feeds.length ? feeds.map((n) => <button key={n.id} type="button" className="ic-linkbtn" onClick={() => setSelected(n.id)}>{n.label}</button>) : <span className="ic-sub">Nothing, this is a starting point</span>}</div>
            <div><div className="ic-sub">Leads to</div>{leads.length ? leads.map((n) => <button key={n.id} type="button" className="ic-linkbtn" onClick={() => setSelected(n.id)}>{n.label}</button>) : <span className="ic-sub">Nothing, this is an end</span>}</div>
          </div>
        ) : (
          <p className="ic-sub" style={{ margin: 0 }} title="Drag the background to move, ctrl or cmd and scroll to zoom">Select a step</p>
        )}
      </div>
    </section>
  )
}

function MiniMap({ layout, view, size, onMove }: { layout: ReturnType<typeof layoutFlow>; view: View; size: { width: number; height: number }; onMove: (v: View) => void }) {
  const W = 132
  const b = layout.bounds
  const pad = 80
  const s = Math.min(W / (b.width + pad * 2), 64 / (b.height + pad * 2))
  const h = (b.height + pad * 2) * s
  const toMini = (x: number, y: number) => ({ x: (x - b.x + pad) * s, y: (y - b.y + pad) * s })
  // The visible window, in world coordinates.
  const vx = -view.x / view.k
  const vy = -view.y / view.k
  const vw = size.width / view.k
  const vh = size.height / view.k
  const a = toMini(vx, vy)
  const center = (e: RPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const wx = (e.clientX - r.left) / s - pad + b.x
    const wy = (e.clientY - r.top) / s - pad + b.y
    onMove({ ...view, x: size.width / 2 - wx * view.k, y: size.height / 2 - wy * view.k })
  }
  return (
    <svg className="ic-minimap" data-ui width={W} height={h} aria-label="Overview. Click to move the view." role="img" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); center(e) }} onPointerMove={(e) => { if (e.buttons) center(e) }}>
      {layout.nodes.map((n) => {
        const p = toMini(n.x, n.y)
        return <rect key={n.id} x={p.x} y={p.y} width={NODE_W * s} height={NODE_H * s} rx={2} className="ic-mm-node" data-status={n.status ?? 'todo'} />
      })}
      <rect x={a.x} y={a.y} width={vw * s} height={vh * s} className="ic-mm-view" />
    </svg>
  )
}
