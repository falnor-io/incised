'use client'

import { useCallback, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, Fragment } from 'react'
import { clampNum, formatCount, formatDuration, formatUsd, linear, niceTicks, swatch } from './chart.js'
import { useCopy, useWidth } from './hooks.js'
import { JsonTree } from './JsonTree.js'
import {
  buildTree, cleanSpans, criticalPath, endOf, flatten, kindShares, layoutRows, selfMs, traceBounds,
  type Span, type SpanKind, type TraceNode,
} from './trace.js'
import { cx } from './util.js'

export type TraceExplorerProps = { title: string; spans: Span[]; defaultView?: 'flame' | 'waterfall' | 'list'; defaultSelected?: string; defaultDetail?: 'info' | 'io'; className?: string }

const KIND_ORDER: SpanKind[] = ['llm', 'tool', 'retrieval', 'gate', 'human', 'agent']
const KIND_LABEL: Record<SpanKind, string> = { llm: 'Model', tool: 'Tool', retrieval: 'Lookup', gate: 'Gate', human: 'Person', agent: 'Agent' }
const colorOf = (k: SpanKind) => swatch(KIND_ORDER.indexOf(k))
const ROW = 22
const MIN_VIEW_MS = 1

/**
 * A trace you can actually read: flame graph, waterfall and ranked list over one time axis, with a draggable
 * minimap, zoom, search, critical path, a legend that shows each kind's share of time, and a detail panel.
 * Every figure (self time, share, totals, critical path) is computed from the spans.
 */
export function TraceExplorer({ title, spans: raw, defaultView = 'flame', defaultSelected, defaultDetail = 'info', className }: TraceExplorerProps) {
  const spans = useMemo(() => cleanSpans(raw), [raw])
  const tree = useMemo(() => buildTree(spans), [spans])
  const all = useMemo(() => flatten(tree), [tree])
  const bounds = useMemo(() => traceBounds(spans), [spans])
  const total = Math.max(bounds.end - bounds.start, 1)
  const critical = useMemo(() => criticalPath(tree), [tree])
  const shares = useMemo(() => kindShares(all), [all])
  const selfById = useMemo(() => new Map(all.map((n) => [n.span.id, selfMs(n)])), [all])
  const byId = useMemo(() => new Map(all.map((n) => [n.span.id, n])), [all])

  const [view, setViewState] = useState<[number, number]>([bounds.start, bounds.end])
  const [tab, setTab] = useState<'flame' | 'waterfall' | 'list'>(defaultView)
  const [selected, setSelected] = useState<string | null>(defaultSelected ?? null)
  const [query, setQuery] = useState('')
  const [showCritical, setShowCritical] = useState(false)
  const [kinds, setKinds] = useState<Set<SpanKind>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'io'>(defaultDetail)
  const [copied, copy] = useCopy()
  const [wrapRef, width] = useWidth<HTMLDivElement>(760)
  const uid = useId().replace(/:/g, '')

  const setView = useCallback((v: [number, number]) => {
    let [a, b] = v
    const len = clampNum(b - a, Math.min(MIN_VIEW_MS, total), total)
    a = clampNum(a, bounds.start, bounds.end - len)
    b = a + len
    setViewState([a, b])
  }, [bounds, total])

  const scale = useMemo(() => linear(view, [0, width]), [view, width])
  const zoomed = view[1] - view[0] < total - 1e-6
  const zoomBy = (factor: number, focus = (view[0] + view[1]) / 2) => {
    const len = (view[1] - view[0]) * factor
    const t = (focus - view[0]) / (view[1] - view[0] || 1)
    setView([focus - len * t, focus + len * (1 - t)])
  }

  const q = query.trim().toLowerCase()
  const matches = (n: TraceNode) => (!q || n.span.name.toLowerCase().includes(q) || n.span.kind.includes(q)) && (kinds.size === 0 || kinds.has(n.span.kind))
  const matchCount = all.filter(matches).length
  const filtering = q !== '' || kinds.size > 0

  const sel = selected ? byId.get(selected) : undefined
  const errors = all.filter((n) => n.span.status === 'error').length
  const blocked = all.filter((n) => n.span.status === 'blocked').length
  const tokens = all.reduce((a, n) => a + (n.span.tokens ? n.span.tokens.in + n.span.tokens.out : 0), 0)
  const cost = all.reduce((a, n) => a + (n.span.costUsd ?? 0), 0)
  const maxDepth = Math.max(...all.map((n) => n.depth), 0)
  const layout = useMemo(() => layoutRows(tree), [tree])

  const select = (id: string | null) => { setSelected(id); if (id) setDetailTab('info') }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    const cur = sel
    const siblings = cur ? (cur.parent ? cur.parent.children : tree) : []
    const idx = cur ? siblings.indexOf(cur) : -1
    let next: TraceNode | undefined
    if (e.key === 'ArrowDown') next = cur ? cur.children[0] ?? siblings[idx + 1] : tree[0]
    else if (e.key === 'ArrowUp') next = cur?.parent ?? undefined
    else if (e.key === 'ArrowRight') next = siblings[idx + 1]
    else if (e.key === 'ArrowLeft') next = siblings[idx - 1]
    else if (e.key === '+' || e.key === '=') return void zoomBy(0.6)
    else if (e.key === '-') return void zoomBy(1 / 0.6)
    else if (e.key === '0') return void setView([bounds.start, bounds.end])
    else if (e.key === 'Escape') return void select(null)
    else return
    e.preventDefault()
    if (next) {
      select(next.span.id)
      // Keep the chosen span in view when zoomed in.
      if (next.span.startMs < view[0] || endOf(next.span) > view[1]) {
        const len = view[1] - view[0]
        setView([Math.max(bounds.start, next.span.startMs - len * 0.1), Math.max(bounds.start, next.span.startMs - len * 0.1) + len])
      }
    }
  }

  const tip = hover ? byId.get(hover.id) : undefined
  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-span]')?.dataset.span
    const host = wrapRef.current?.getBoundingClientRect()
    if (!id || !host) return setHover(null)
    setHover({ id, x: e.clientX - host.left, y: e.clientY - host.top })
  }

  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title" style={{ margin: 0 }}>{title}</h3>
        <div className="ol-tabs" role="tablist" aria-label="Trace view">
          {(['flame', 'waterfall', 'list'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className="ol-tab" onClick={() => setTab(t)}>
              {t === 'flame' ? 'Flame graph' : t === 'waterfall' ? 'Waterfall' : `Span list ${all.length}`}
            </button>
          ))}
        </div>
      </div>

      <dl className="ol-facts" aria-label="Trace summary">
        <div><dt>Duration</dt><dd>{formatDuration(total)}</dd></div>
        <div><dt>Spans</dt><dd>{all.length}</dd></div>
        <div><dt>Depth</dt><dd>{maxDepth + 1}</dd></div>
        <div data-bad={errors > 0}><dt>Failed</dt><dd>{errors}</dd></div>
        <div data-warn={blocked > 0}><dt>Blocked</dt><dd>{blocked}</dd></div>
        {tokens > 0 && <div><dt>Tokens</dt><dd>{formatCount(tokens)}</dd></div>}
        {cost > 0 && <div><dt>Cost</dt><dd>{formatUsd(cost)}</dd></div>}
      </dl>

      <div className="ol-toolbar">
        <input className="ol-input" type="search" placeholder="Filter spans" aria-label="Filter spans by name or kind" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="ol-chip" aria-pressed={showCritical} onClick={() => setShowCritical((c) => !c)} title="Highlight the spans that decide when the trace ends">Critical path {critical.size}</button>
        <div className="ol-zoom" role="group" aria-label="Zoom">
          <button type="button" className="ol-chip" onClick={() => zoomBy(0.6)} aria-label="Zoom in">+</button>
          <button type="button" className="ol-chip" onClick={() => zoomBy(1 / 0.6)} aria-label="Zoom out" disabled={!zoomed}>−</button>
          <button type="button" className="ol-chip" onClick={() => setView([bounds.start, bounds.end])} disabled={!zoomed}>Reset</button>
        </div>
        {filtering && <span className="ol-sub" role="status">{matchCount} of {all.length} match</span>}
      </div>

      <div className="ol-legend" role="group" aria-label="Filter by kind. Share is each kind's part of total self time.">
        {shares.map((s) => (
          <button key={s.kind} type="button" className="ol-legend-item" aria-pressed={kinds.has(s.kind)} onClick={() => setKinds((k) => { const n = new Set(k); if (!n.delete(s.kind)) n.add(s.kind); return n })}>
            <i style={{ background: colorOf(s.kind) }} aria-hidden="true" />
            {KIND_LABEL[s.kind]} <b>{(s.share * 100).toFixed(s.share < 0.1 ? 1 : 0)}%</b>
            <span className="ol-sub">{formatDuration(s.selfMs)} · {s.count}</span>
          </button>
        ))}
      </div>

      <div ref={wrapRef} className="ol-trace-body" tabIndex={0} onKeyDown={onKey} onPointerMove={onMove} onPointerLeave={() => setHover(null)} aria-label="Trace. Arrow keys move between spans, plus and minus zoom, zero resets.">
        <Minimap width={width} spans={all} rows={layout} bounds={bounds} view={view} setView={setView} />
        <Ruler scale={scale} width={width} start={bounds.start} />
        {tab === 'flame' && (
          <div className="ol-flame" style={{ height: layout.count * ROW + 4 }} onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY > 0 ? 1.25 : 0.8, scale.invert(e.clientX - e.currentTarget.getBoundingClientRect().left)) } }}>
            <Grid scale={scale} width={width} />
            {all.map((n) => {
              const x = scale(n.span.startMs)
              const w = Math.max(scale(endOf(n.span)) - x, 1.5)
              if (x + w < 0 || x > width) return null
              const left = Math.max(x, 0)
              const right = Math.min(x + w, width)
              const dim = filtering && !matches(n)
              return (
                <div key={n.span.id} data-span={n.span.id} data-status={n.span.status} data-dim={dim} data-critical={showCritical && critical.has(n.span.id)} data-selected={selected === n.span.id}
                  className="ol-bar-span" style={{ left, width: right - left, top: (layout.rows.get(n.span.id) ?? 0) * ROW + 2, height: ROW - 3, background: colorOf(n.span.kind) }}
                  onClick={() => select(n.span.id)} role="button" aria-label={`${n.span.name}, ${KIND_LABEL[n.span.kind]}, ${formatDuration(n.span.durationMs)}, ${n.span.status}`} tabIndex={-1}>
                  {right - left > 36 && <span>{n.span.name}</span>}
                </div>
              )
            })}
          </div>
        )}
        {tab === 'waterfall' && (
          <div className="ol-wfall">
            {flatten(tree, collapsed).map((n) => {
              const x = scale(n.span.startMs)
              const w = Math.max(scale(endOf(n.span)) - x, 2)
              const dim = filtering && !matches(n)
              return (
                <div key={n.span.id} data-span={n.span.id} data-selected={selected === n.span.id} data-dim={dim} className="ol-wrow" onClick={() => select(n.span.id)}>
                  <div className="ol-wname" style={{ paddingLeft: n.depth * 14 }}>
                    {n.children.length ? (
                      <button type="button" className="ol-twist" aria-expanded={!collapsed.has(n.span.id)} aria-label={`${collapsed.has(n.span.id) ? 'Expand' : 'Collapse'} ${n.span.name}`} onClick={(e) => { e.stopPropagation(); setCollapsed((c) => { const s = new Set(c); if (!s.delete(n.span.id)) s.add(n.span.id); return s }) }}>{collapsed.has(n.span.id) ? '▸' : '▾'}</button>
                    ) : <span className="ol-twist" aria-hidden="true" />}
                    <i className="ol-dot-kind" style={{ background: colorOf(n.span.kind) }} aria-hidden="true" />
                    <span className="ol-ell">{n.span.name}</span>
                  </div>
                  <div className="ol-wtrack">
                    <span className="ol-wbar" data-status={n.span.status} data-critical={showCritical && critical.has(n.span.id)} style={{ left: `${(x / width) * 100}%`, width: `${(w / width) * 100}%`, background: colorOf(n.span.kind) }} />
                    <span className="ol-wlabel ol-mono" style={{ left: `${Math.min(((x + w) / width) * 100 + 0.6, 88)}%` }}>{formatDuration(n.span.durationMs)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {tab === 'list' && (
          <table className="ol-table ol-list-table">
            <thead><tr><th scope="col">Span</th><th scope="col">Kind</th><th scope="col" className="ol-num">Duration</th><th scope="col" className="ol-num">Self time</th><th scope="col">Share of trace</th></tr></thead>
            <tbody>
              {[...all].filter((n) => !filtering || matches(n)).sort((a, b) => (selfById.get(b.span.id) ?? 0) - (selfById.get(a.span.id) ?? 0)).map((n) => {
                const s = selfById.get(n.span.id) ?? 0
                return (
                  <tr key={n.span.id} data-span={n.span.id} data-selected={selected === n.span.id} onClick={() => select(n.span.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') select(n.span.id) }}>
                    <th scope="row"><i className="ol-dot-kind" style={{ background: colorOf(n.span.kind) }} aria-hidden="true" /> {n.span.name}</th>
                    <td>{KIND_LABEL[n.span.kind]}</td>
                    <td className="ol-num ol-mono">{formatDuration(n.span.durationMs)}</td>
                    <td className="ol-num ol-mono">{formatDuration(s)}</td>
                    <td><span className="ol-share"><span style={{ width: `${(s / total) * 100}%`, background: colorOf(n.span.kind) }} /></span> <span className="ol-sub ol-mono">{((s / total) * 100).toFixed(1)}%</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {tip && hover && (
          <div className="ol-tip" role="tooltip" style={{ left: clampNum(hover.x + 14, 0, Math.max(width - 230, 0)), top: hover.y + 18 }}>
            <strong>{tip.span.name}</strong>
            <div className="ol-sub">{KIND_LABEL[tip.span.kind]} · {tip.span.status}</div>
            <div className="ol-mono">{formatDuration(tip.span.durationMs)} total · {formatDuration(selfById.get(tip.span.id) ?? 0)} self</div>
            <div className="ol-sub">{(((selfById.get(tip.span.id) ?? 0) / total) * 100).toFixed(1)}% of trace{critical.has(tip.span.id) ? ' · on critical path' : ''}</div>
          </div>
        )}
      </div>

      <div className="ol-detail" aria-live="polite">
        {sel ? (
          <>
            <div className="ol-head-row" style={{ marginBottom: 6 }}>
              <div>
                <i className="ol-dot-kind" style={{ background: colorOf(sel.span.kind) }} aria-hidden="true" /> <strong>{sel.span.name}</strong>{' '}
                <span className="ol-pill" data-tone={sel.span.status === 'ok' ? 'good' : sel.span.status === 'error' ? 'bad' : 'warn'}>{sel.span.status === 'blocked' ? 'blocked by a gate' : sel.span.status}</span>
              </div>
              <div className="ol-tabs" role="tablist" aria-label="Span details">
                <button type="button" role="tab" aria-selected={detailTab === 'info'} className="ol-tab" onClick={() => setDetailTab('info')}>Info</button>
                <button type="button" role="tab" aria-selected={detailTab === 'io'} className="ol-tab" onClick={() => setDetailTab('io')} disabled={sel.span.input === undefined && sel.span.output === undefined}>Input and output</button>
              </div>
            </div>
            {detailTab === 'info' ? (
              <dl className="ol-dl">
                <dt>Starts at</dt><dd className="ol-mono">+{formatDuration(sel.span.startMs - bounds.start)}</dd>
                <dt>Duration</dt><dd className="ol-mono">{formatDuration(sel.span.durationMs)} <span className="ol-sub">({((sel.span.durationMs / total) * 100).toFixed(1)}% of trace)</span></dd>
                <dt>Self time</dt><dd className="ol-mono">{formatDuration(selfById.get(sel.span.id) ?? 0)} <span className="ol-sub">excluding {sel.children.length} {sel.children.length === 1 ? 'child' : 'children'}</span></dd>
                {critical.has(sel.span.id) && (<><dt>Critical path</dt><dd>Yes, shortening this shortens the trace</dd></>)}
                {sel.parent && (<><dt>Parent</dt><dd><button type="button" className="ol-linkbtn" onClick={() => select(sel.parent!.span.id)}>{sel.parent.span.name}</button></dd></>)}
                {sel.span.tokens && (<><dt>Tokens</dt><dd className="ol-mono">{formatCount(sel.span.tokens.in)} in · {formatCount(sel.span.tokens.out)} out</dd></>)}
                {sel.span.costUsd !== undefined && (<><dt>Cost</dt><dd className="ol-mono">{formatUsd(sel.span.costUsd)}</dd></>)}
                {Object.entries(sel.span.attrs ?? {}).map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd className="ol-mono">{String(v)}</dd></Fragment>))}
                <dt>Span id</dt><dd><button type="button" className="ol-linkbtn ol-id" onClick={() => copy(sel.span.id)}>{sel.span.id}{copied ? ' · copied' : ''}</button></dd>
              </dl>
            ) : (
              <div className="ol-io">
                {sel.span.input !== undefined && <div><div className="ol-sub">Input</div><JsonTree value={sel.span.input} label="input" defaultExpandDepth={2} /></div>}
                {sel.span.output !== undefined && <div><div className="ol-sub">Output</div><JsonTree value={sel.span.output} label="output" defaultExpandDepth={2} /></div>}
              </div>
            )}
          </>
        ) : (
          <p className="ol-sub" style={{ margin: 0 }} title="Arrow keys move between spans, plus and minus zoom, zero resets">Select a span</p>
        )}
      </div>
    </section>
  )
}

function Ruler({ scale, width, start }: { scale: ReturnType<typeof linear>; width: number; start: number }) {
  const ticks = niceTicks(scale.domain[0], scale.domain[1], Math.max(3, Math.floor(width / 110)))
  return (
    <div className="ol-ruler" aria-hidden="true">
      {ticks.map((t) => (<span key={t} style={{ left: scale(t) }}>{formatDuration(t - start)}</span>))}
    </div>
  )
}

function Grid({ scale, width }: { scale: ReturnType<typeof linear>; width: number }) {
  return (
    <>
      {niceTicks(scale.domain[0], scale.domain[1], Math.max(3, Math.floor(width / 110))).map((t) => (<span key={t} className="ol-gridline" style={{ left: scale(t) }} aria-hidden="true" />))}
    </>
  )
}

/** The whole trace in miniature, with a brush for the part on screen. Drag the middle to pan, the edges to resize. */
function Minimap({ width, spans, rows, bounds, view, setView }: { width: number; spans: TraceNode[]; rows: { rows: Map<string, number>; count: number }; bounds: { start: number; end: number }; view: [number, number]; setView: (v: [number, number]) => void }) {
  const full = linear([bounds.start, bounds.end], [0, width])
  const drag = useRef<{ mode: 'pan' | 'l' | 'r' | 'new'; x0: number; v0: [number, number] } | null>(null)
  const rowH = Math.max(2, Math.min(5, 40 / rows.count))
  const onDown = (e: RPointerEvent<HTMLElement>, mode: 'pan' | 'l' | 'r' | 'new') => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.parentElement!.getBoundingClientRect()
    drag.current = { mode, x0: e.clientX - rect.left, v0: view }
    if (mode === 'new') {
      const t = full.invert(e.clientX - rect.left)
      const len = view[1] - view[0]
      setView([t - len / 2, t + len / 2])
      drag.current = { mode: 'pan', x0: e.clientX - rect.left, v0: [t - len / 2, t + len / 2] }
    }
  }
  const onMove = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const rect = e.currentTarget.parentElement!.getBoundingClientRect()
    const dt = full.invert(e.clientX - rect.left) - full.invert(d.x0)
    if (d.mode === 'pan') setView([d.v0[0] + dt, d.v0[1] + dt])
    else if (d.mode === 'l') setView([Math.min(d.v0[0] + dt, d.v0[1] - MIN_VIEW_MS), d.v0[1]])
    else setView([d.v0[0], Math.max(d.v0[1] + dt, d.v0[0] + MIN_VIEW_MS)])
  }
  const x0 = full(view[0])
  const x1 = full(view[1])
  return (
    <div className="ol-mini" onPointerDown={(e) => onDown(e, 'new')} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} aria-label="Overview. Drag the window to move, drag its edges to zoom." role="group">
      {spans.map((n) => (
        <span key={n.span.id} className="ol-mini-bar" style={{ left: full(n.span.startMs), width: Math.max(full(endOf(n.span)) - full(n.span.startMs), 1), top: 2 + (rows.rows.get(n.span.id) ?? 0) * rowH, height: Math.max(rowH - 1, 1.5), background: colorOf(n.span.kind), opacity: n.span.status === 'error' ? 1 : 0.8 }} />
      ))}
      <div className="ol-mini-shade" style={{ left: 0, width: x0 }} />
      <div className="ol-mini-shade" style={{ left: x1, right: 0 }} />
      <div className="ol-brush" style={{ left: x0, width: Math.max(x1 - x0, 6) }} onPointerDown={(e) => onDown(e, 'pan')} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <span className="ol-brush-h" style={{ left: -3 }} onPointerDown={(e) => onDown(e, 'l')} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} />
        <span className="ol-brush-h" style={{ right: -3 }} onPointerDown={(e) => onDown(e, 'r')} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} />
      </div>
    </div>
  )
}
