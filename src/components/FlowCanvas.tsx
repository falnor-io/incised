'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type WheelEvent } from 'react'
import { useWidth } from './hooks.js'
import { fitView, layoutFlow, neighbour, NODE_H, NODE_W, outlineOf, roundedPath, zoomAt, type Dir, type FlowEdge, type FlowNode, type OutlineItem, type View } from './flow.js'
import { PlaybackBar, usePlayback } from './playback.js'
import { gateFor, pendingRow, type Status } from './status.js'
import { Fit, Lock } from './icons.js'
import { cx } from './util.js'

export type FlowCanvasProps = { title: string; nodes: FlowNode[]; edges: FlowEdge[]; height?: number; defaultSelected?: string; /** Walk the nodes one at a time, selecting each. */ playable?: boolean; param?: string; status?: Status; className?: string }

const FIT_PAD = { top: 24, right: 24, bottom: 92, left: 24 }
const STATUS_LABEL = { done: 'Done', active: 'In progress', todo: 'Not started', blocked: 'Blocked' } as const
const KIND_LABEL = { start: 'Start', step: 'Step', gate: 'Decision', end: 'End' } as const

/**
 * A diagram you can move around in: drag to pan, ctrl or cmd and scroll to zoom, a minimap, zoom controls,
 * swimlanes when nodes have owners, rounded orthogonal edges, and a click on any node to trace what feeds it
 * and what it leads to. The layout is computed, so you only describe the steps and how they connect.
 */
export function FlowCanvas({ title, nodes, edges, height = 400, defaultSelected, playable = false, param, status, className }: FlowCanvasProps) {
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
  const walk = (dir: Dir) => {
    const to = selected ? neighbour(layout.nodes, layout.edges, selected, dir) : undefined
    if (!to) return false
    setSelected(to)
    const n = byId.get(to)!
    // Bring it into view if it is off screen, then give it focus so a screen reader reads it.
    const x = n.x * view.k + view.x
    const y = n.y * view.k + view.y
    if (x < 0 || y < 0 || x + NODE_W * view.k > size.width || y + NODE_H * view.k > size.height) move({ ...view, x: size.width / 2 - (n.x + NODE_W / 2) * view.k, y: size.height / 2 - (n.y + NODE_H / 2) * view.k })
    hostRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(to)}"]`)?.focus()
    return true
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = 40
    // With a step selected the arrows walk the diagram: right to what it leads to, left to what feeds it, up and down within the step.
    const dir = ({ ArrowRight: 'next', ArrowLeft: 'previous', ArrowUp: 'up', ArrowDown: 'down' } as const)[e.key as 'ArrowRight']
    if (dir && selected && !e.shiftKey && walk(dir)) { e.preventDefault(); return }
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

  const pb = usePlayback(layout.nodes.length, { param })
  // Playing walks the nodes in layout order, selecting each and bringing it into view.
  useEffect(() => {
    const n = playable ? layout.nodes[pb.at] : undefined
    if (!n) return
    setSelected(n.id)
    setView((v) => {
      const x = n.x * v.k + v.x
      const y = n.y * v.k + v.y
      const inside = x >= 0 && y >= 0 && x + NODE_W * v.k <= size.width && y + NODE_H * v.k <= size.height
      return inside ? v : { ...v, x: size.width / 2 - (n.x + NODE_W / 2) * v.k, y: size.height / 2 - (n.y + NODE_H / 2) * v.k }
    })
  }, [playable, pb.at, layout, size])
  const gate = gateFor(status, { title, className, rows: 4 })
  if (gate) return gate

  return (
    <section role="group" className={cx('ol', className)} aria-label={title} aria-busy={status === 'partial' || undefined}>
      <div className="ol-head-row">
        <div>
          <h3 className="ol-title">{title}</h3>
          <div className="ol-sub">{nodes.length} steps · {edges.length} connections{layout.lanes.length ? ` · ${layout.lanes.length} owners` : ''}</div>
        </div>
        <div className="ol-legendrow" aria-hidden="true">
          <span><i className="ol-ldot" data-s="done" /> Done</span><span><i className="ol-ldot" data-s="active" /> In progress</span><span><i className="ol-ldot" data-s="blocked" /> Blocked</span><span><i className="ol-ldot" data-s="todo" /> Not started</span>
        </div>
      </div>
      <div ref={hostRef} className="ol-canvas" style={{ height }} tabIndex={0} onKeyDown={onKey} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onWheel={onWheel} data-locked={locked}
        aria-label="Flow diagram. Drag to move. Plus and minus zoom, zero fits. Arrow keys pan, or with a step selected walk to the next, previous or neighbouring step. Tab moves between steps. An outline is below.">
        <svg className="ol-dots" width="100%" height="100%" aria-hidden="true">
          <defs>
            <pattern id={`dots${uid}`} width={24 * view.k} height={24 * view.k} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
              <circle cx={1} cy={1} r={Math.max(0.7, view.k)} className="ol-dot-fill" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#dots${uid})`} />
        </svg>

        <div className="ol-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          {layout.lanes.map((l, i) => (
            <div key={l.owner} className="ol-laneband" data-odd={i % 2} style={{ top: l.y, height: l.height, width: layout.bounds.width, left: layout.bounds.x }}>
              <span>{l.owner}</span>
            </div>
          ))}
          <svg className="ol-edges" width={layout.bounds.width} height={layout.bounds.height} viewBox={`0 ${layout.bounds.y} ${layout.bounds.width} ${layout.bounds.height}`} style={{ top: layout.bounds.y }} overflow="visible" aria-hidden="true">
            <defs>
              <marker id={`arr${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" className="ol-flow-arrow" /></marker>
            </defs>
            {layout.edges.map((e, i) => (
              <g key={`${e.from}>${e.to}>${i}`} data-on={edgeOn(e)} data-animated={e.animated || byId.get(e.from)?.status === 'active'}>
                <path d={roundedPath(e.points, 10)} className="ol-flow-edge" markerEnd={`url(#arr${uid})`} />
                {e.label && (
                  <g transform={`translate(${e.label_at.x} ${e.label_at.y})`}>
                    <rect x={-(e.label.length * 3.3 + 7)} y={-9} width={e.label.length * 6.6 + 14} height={18} rx={9} className="ol-edge-pill" />
                    <text textAnchor="middle" y={4} className="ol-flow-label">{e.label}</text>
                  </g>
                )}
              </g>
            ))}
          </svg>
          {layout.nodes.map((n) => (
            <button key={n.id} type="button" data-node data-node-id={n.id} data-kind={n.kind} data-status={n.status ?? 'todo'} data-selected={selected === n.id} data-dim={!!sel && !related.has(n.id)}
              className="ol-fnode" style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }} onClick={() => setSelected(selected === n.id ? null : n.id)}
              aria-label={`${n.label}. ${KIND_LABEL[n.kind]}. ${STATUS_LABEL[n.status ?? 'todo']}.${n.owner ? ` Owner ${n.owner}.` : ''}`} aria-pressed={selected === n.id}>
              <i className="ol-handle" data-side="l" aria-hidden="true" /><i className="ol-handle" data-side="r" aria-hidden="true" />
              <span className="ol-fkind">{KIND_LABEL[n.kind]}<i className="ol-ldot" data-s={n.status ?? 'todo'} /></span>
              <span className="ol-flabel">{n.label}</span>
            </button>
          ))}
        </div>

        <div className="ol-fctl" data-ui role="group" aria-label="View controls">
          <button type="button" onClick={() => zoom(1.2)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</button>
          <button type="button" onClick={fit} aria-label="Fit to view"><Fit /></button>
          <button type="button" onClick={() => setLocked((l) => !l)} aria-pressed={locked} aria-label={locked ? 'Unlock view' : 'Lock view'}><Lock open={!locked} /></button>
        </div>
        <MiniMap layout={layout} view={view} size={size} onMove={move} />
      </div>

      <details className="ol-outline">
        <summary>Outline of this diagram</summary>
        <Outline items={outlineOf(layout.nodes, layout.edges)} selected={selected} onPick={setSelected} />
      </details>
      <div className="ol-detail" aria-live="polite">
        {sel ? (
          <div className="ol-fdetail">
            <div>
              <strong>{sel.label}</strong> <span className="ol-pill" data-tone={sel.status === 'done' ? 'good' : sel.status === 'blocked' ? 'bad' : sel.status === 'active' ? 'warn' : undefined}>{STATUS_LABEL[sel.status ?? 'todo']}</span>
              <div className="ol-sub">{KIND_LABEL[sel.kind]}{sel.owner ? ` · owned by ${sel.owner}` : ''}</div>
              {sel.detail && <p className="ol-p ol-mt-2">{sel.detail}</p>}
            </div>
            <div><div className="ol-sub">Comes from</div>{feeds.length ? feeds.map((n) => <button key={n.id} type="button" className="ol-linkbtn" onClick={() => setSelected(n.id)}>{n.label}</button>) : <span className="ol-sub">Nothing, this is a starting point</span>}</div>
            <div><div className="ol-sub">Leads to</div>{leads.length ? leads.map((n) => <button key={n.id} type="button" className="ol-linkbtn" onClick={() => setSelected(n.id)}>{n.label}</button>) : <span className="ol-sub">Nothing, this is an end</span>}</div>
          </div>
        ) : (
          <p className="ol-sub" title="Drag the background to move, ctrl or cmd and scroll to zoom">Select a step</p>
        )}
      </div>
      {pendingRow(status)}
      {playable && layout.nodes.length > 1 && <PlaybackBar pb={pb} count={layout.nodes.length} label={title} />}
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
    <svg className="ol-minimap" data-ui width={W} height={h} aria-label="Overview. Click to move the view." role="img" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); center(e) }} onPointerMove={(e) => { if (e.buttons) center(e) }}>
      {layout.nodes.map((n) => {
        const p = toMini(n.x, n.y)
        return <rect key={n.id} x={p.x} y={p.y} width={NODE_W * s} height={NODE_H * s} rx={2} className="ol-mm-node" data-status={n.status ?? 'todo'} />
      })}
      <rect x={a.x} y={a.y} width={vw * s} height={vh * s} className="ol-mm-view" />
    </svg>
  )
}

function Outline({ items, selected, onPick }: { items: OutlineItem[]; selected: string | null; onPick: (id: string) => void }) {
  return (
    <ul className="ol-outlinelist">
      {items.map((i) => (
        <li key={i.id}>
          <button type="button" className="ol-linkbtn" aria-current={selected === i.id} onClick={() => onPick(i.id)}>
            {i.edgeLabel ? `${i.edgeLabel}: ` : ''}{i.label}
          </button>
          <span className="ol-sub"> {KIND_LABEL[i.kind]}, {STATUS_LABEL[i.status ?? 'todo']}{i.owner ? `, ${i.owner}` : ''}{i.seen ? ', see above' : ''}</span>
          {i.children.length > 0 && <Outline items={i.children} selected={selected} onPick={onPick} />}
        </li>
      ))}
    </ul>
  )
}
