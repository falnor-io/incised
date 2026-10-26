'use client'

import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { formatDuration, formatUsd } from './chart.js'
import { aggregate, filterRows, nextSorts, rangeIds, sortRows, toCsv, windowRange, type Column, type SortKey } from './grid.js'
import { cx } from './util.js'

export type { Column, SortKey }
export type DataGridProps<R> = {
  title: string
  rows: R[]
  columns: Column<R>[]
  rowId: (row: R) => string
  height?: number
  noun?: string
  defaultSort?: SortKey[]
  initialFilters?: Record<string, string>
  initialSelected?: string[]
  actions?: (selected: R[]) => ReactNode
  className?: string
}

const ROW_H = { compact: 30, comfortable: 40 } as const
const HEAD_H = 36
const CHECK_W = 42
const TONES: Record<string, 'good' | 'warn' | 'bad'> = { ok: 'good', passed: 'good', pass: 'good', honored: 'good', remedied: 'good', done: 'good', error: 'bad', failed: 'bad', fail: 'bad', breached: 'bad', blocked: 'warn', watch: 'warn', pending: 'warn' }

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 84
  const h = 18
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const y = (v: number) => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (w - 4) + 2},${y(v).toFixed(1)}`)
  const last = values[values.length - 1]!
  return (
    <svg width={w} height={h} role="img" aria-label={`Trend, ${values.length} points, last ${last}`} className="ol-spark">
      <polyline points={pts.join(' ')} fill="none" />
      <circle cx={(w - 4) + 2} cy={y(last)} r={2.2} />
    </svg>
  )
}

function renderCell<R>(col: Column<R>, row: R): ReactNode {
  const v = col.value(row)
  if (v === null || v === undefined || v === '') return <span className="ol-sub">-</span>
  switch (col.type) {
    case 'status': {
      const tone = col.tone?.(v) ?? TONES[String(v).toLowerCase()]
      return <span className="ol-pill" data-tone={tone}>{String(v)}</span>
    }
    case 'duration': return <span className="ol-mono">{typeof v === 'number' ? formatDuration(v) : String(v)}</span>
    case 'usd': return <span className="ol-mono">{typeof v === 'number' ? formatUsd(v) : String(v)}</span>
    case 'number': return <span className="ol-mono">{typeof v === 'number' ? v.toLocaleString('en') : String(v)}</span>
    case 'percent': {
      const n = typeof v === 'number' ? v : 0
      return <span className="ol-pctcell"><span className="ol-pctbar"><span style={{ width: `${Math.max(0, Math.min(1, n)) * 100}%` }} /></span><span className="ol-mono">{(n * 100).toFixed(0)}%</span></span>
    }
    case 'date': {
      const d = v instanceof Date ? v : new Date(String(v))
      return <span className="ol-mono">{Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(5, 16).replace('T', ' ')}</span>
    }
    case 'spark': return Array.isArray(v) ? <Spark values={v.filter((x): x is number => typeof x === 'number')} /> : null
    default: return <span className="ol-ell">{String(v)}</span>
  }
}

const alignOf = (c: Column<never>) => (['number', 'duration', 'percent', 'usd'].includes(c.type ?? 'text') ? 'right' : 'left')

/**
 * A data grid that holds up at thousands of rows: only the visible rows are drawn, headers and the first
 * column stay put, columns sort (shift-click for a second sort key), filter (">100", "10..20", or text),
 * resize and export, rows select with click and shift-click, and the keyboard works throughout.
 */
export function DataGrid<R>({ title, rows, columns, rowId, height = 380, noun = 'rows', defaultSort = [], initialFilters = {}, initialSelected = [], actions, className }: DataGridProps<R>) {
  const [sorts, setSorts] = useState<SortKey[]>(defaultSort)
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters)
  const [showFilters, setShowFilters] = useState(Object.keys(initialFilters).length > 0)
  const [query, setQuery] = useState('')
  const [density, setDensity] = useState<keyof typeof ROW_H>('compact')
  const [widths, setWidths] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))
  const [anchor, setAnchor] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)

  const rowH = ROW_H[density]
  const view = useMemo(() => sortRows(filterRows(rows, columns, filters, query), columns, sorts), [rows, columns, filters, query, sorts])
  const ids = useMemo(() => view.map(rowId), [view, rowId])
  const win = windowRange(scrollTop, height - HEAD_H - (showFilters ? HEAD_H : 0), rowH, view.length)
  const colW = (c: Column<R>) => widths[c.id] ?? c.width ?? 140
  const totalW = CHECK_W + columns.reduce((a, c) => a + colW(c), 0)
  const template = `${CHECK_W}px ${columns.map((c) => `${colW(c)}px`).join(' ')}`
  const filtering = query !== '' || Object.values(filters).some((f) => f.trim() !== '')
  const selectedRows = view.filter((r) => selected.has(rowId(r)))
  const allSelected = view.length > 0 && selectedRows.length === view.length

  const select = (i: number, shift: boolean) => {
    const id = ids[i]!
    setActive(i)
    if (shift && anchor !== null) {
      const next = new Set(selected)
      for (const r of rangeIds(ids, anchor, i)) next.add(r)
      setSelected(next)
    } else {
      const next = new Set(selected)
      if (!next.delete(id)) next.add(id)
      setSelected(next)
      setAnchor(i)
    }
  }
  const moveTo = (i: number) => {
    const clamped = Math.max(0, Math.min(view.length - 1, i))
    setActive(clamped)
    const el = scroller.current
    if (!el) return
    const top = clamped * rowH
    const bodyH = height - HEAD_H - (showFilters ? HEAD_H : 0)
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + rowH > el.scrollTop + bodyH) el.scrollTop = top + rowH - bodyH
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return
    if (e.key === 'ArrowDown') { moveTo(active + 1); if (e.shiftKey) select(Math.min(active + 1, view.length - 1), true) }
    else if (e.key === 'ArrowUp') { moveTo(active - 1); if (e.shiftKey) select(Math.max(active - 1, 0), true) }
    else if (e.key === 'Home') moveTo(0)
    else if (e.key === 'End') moveTo(view.length - 1)
    else if (e.key === 'PageDown') moveTo(active + 10)
    else if (e.key === 'PageUp') moveTo(active - 10)
    else if (e.key === ' ') select(active, false)
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') setSelected(new Set(ids))
    else if (e.key === 'Escape') setSelected(new Set())
    else return
    e.preventDefault()
  }

  const startResize = (e: RPointerEvent<HTMLElement>, c: Column<R>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const x0 = e.clientX
    const w0 = colW(c)
    const el = e.currentTarget
    const move = (ev: PointerEvent) => setWidths((w) => ({ ...w, [c.id]: Math.max(c.minWidth ?? 70, w0 + ev.clientX - x0) }))
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  const exportCsv = () => {
    const blob = new Blob([toCsv(selectedRows.length ? selectedRows : view, columns)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${title.toLowerCase().replace(/\W+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const pinnedLeft = columns.findIndex((c) => c.pin)
  const sticky = (c: Column<R>, i: number) => (i === pinnedLeft ? ({ position: 'sticky', left: CHECK_W, zIndex: 2 } as const) : undefined)

  return (
    <section role="group" className={cx('ol', className)} aria-label={title}>
      <div className="ol-head-row">
        <h3 className="ol-title" style={{ margin: 0 }}>{title}</h3>
        <div className="ol-toolbar" style={{ margin: 0 }}>
          <input className="ol-input" type="search" placeholder={`Search ${noun}`} aria-label={`Search ${noun}`} value={query} onChange={(e) => { setQuery(e.target.value); scroller.current && (scroller.current.scrollTop = 0) }} />
          <button type="button" className="ol-chip" aria-pressed={showFilters} onClick={() => setShowFilters((s) => !s)}>Filters{Object.values(filters).filter((f) => f.trim()).length ? ` ${Object.values(filters).filter((f) => f.trim()).length}` : ''}</button>
          <div className="ol-tabs" role="group" aria-label="Row density">
            {(['compact', 'comfortable'] as const).map((d) => <button key={d} type="button" className="ol-tab" aria-pressed={density === d} onClick={() => setDensity(d)}>{d === 'compact' ? 'Compact' : 'Roomy'}</button>)}
          </div>
          <button type="button" className="ol-chip" onClick={exportCsv}>Export {selectedRows.length ? `${selectedRows.length} selected` : 'CSV'}</button>
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="ol-selbar" role="status">
          <b>{selectedRows.length}</b> selected
          <button type="button" className="ol-linkbtn" onClick={() => setSelected(new Set())}>Clear</button>
          <span className="ol-spacer" />
          {actions?.(selectedRows)}
        </div>
      )}

      <div ref={scroller} className="ol-dg" style={{ height }} role="grid" aria-rowcount={view.length + 1} aria-colcount={columns.length + 1} aria-label={title} tabIndex={0} onKeyDown={onKey} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} aria-multiselectable="true">
        <div className="ol-ghead" style={{ width: totalW, gridTemplateColumns: template, height: HEAD_H }} role="row">
          <div className="ol-gcell ol-gcheck" role="columnheader" style={{ position: 'sticky', left: 0, zIndex: 3 }}>
            <input type="checkbox" aria-label="Select all rows" checked={allSelected} ref={(el) => { if (el) el.indeterminate = selectedRows.length > 0 && !allSelected }} onChange={() => setSelected(allSelected ? new Set() : new Set(ids))} />
          </div>
          {columns.map((c, i) => {
            const s = sorts.findIndex((x) => x.id === c.id)
            const dir = s >= 0 ? sorts[s]!.dir : undefined
            return (
              <div key={c.id} className="ol-gcell ol-ghcell" role="columnheader" data-align={alignOf(c as Column<never>)} aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'} style={sticky(c, i)}>
                {c.sortable === false ? <span>{c.header}</span> : (
                  <button type="button" className="ol-sortbtn" onClick={(e) => setSorts(nextSorts(sorts, c.id, e.shiftKey))} title="Click to sort. Shift-click adds a second sort.">
                    {c.header}{dir ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}{sorts.length > 1 && s >= 0 ? <sup>{s + 1}</sup> : null}
                  </button>
                )}
                <span className="ol-resize" onPointerDown={(e) => startResize(e, c)} role="separator" aria-orientation="vertical" aria-label={`Resize ${c.header}`} />
              </div>
            )
          })}
        </div>
        {showFilters && (
          <div className="ol-ghead ol-gfilters" style={{ width: totalW, gridTemplateColumns: template, height: HEAD_H, top: HEAD_H }} role="row">
            <div className="ol-gcell" role="gridcell" style={{ position: 'sticky', left: 0, zIndex: 3 }} />
            {columns.map((c, i) => (
              <div key={c.id} className="ol-gcell" role="gridcell" style={sticky(c, i)}>
                {c.filterable === false || c.type === 'spark' ? null : (
                  <input className="ol-input ol-finput" aria-label={`Filter ${c.header}`} placeholder={['number', 'duration', 'percent', 'usd'].includes(c.type ?? '') ? '>5 or 1..9' : 'contains'} value={filters[c.id] ?? ''} data-bad={['number', 'duration', 'percent', 'usd'].includes(c.type ?? '') && !!filters[c.id]?.trim() && !/^(>=|<=|>|<|=)?\s*-?\d|\.\./.test(filters[c.id]!.trim())}
                    onChange={(e) => setFilters((f) => ({ ...f, [c.id]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="ol-gbody" style={{ height: view.length * rowH, width: totalW }}>
          {view.slice(win.start, win.end).map((row, k) => {
            const i = win.start + k
            const id = ids[i]!
            const sel = selected.has(id)
            return (
              <div key={id} className="ol-grow" role="row" aria-rowindex={i + 2} aria-selected={sel} data-active={active === i} data-selected={sel} style={{ top: i * rowH, height: rowH, width: totalW, gridTemplateColumns: template }} onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') { setActive(i); if (e.shiftKey) select(i, true) } }}>
                <div className="ol-gcell ol-gcheck" role="gridcell" style={{ position: 'sticky', left: 0, zIndex: 1 }}>
                  <input type="checkbox" aria-label={`Select row ${i + 1}`} checked={sel} onChange={() => undefined} onClick={(e) => select(i, e.shiftKey)} />
                </div>
                {columns.map((c, ci) => (
                  <div key={c.id} className="ol-gcell" role="gridcell" data-align={alignOf(c as Column<never>)} style={sticky(c, ci)}>{renderCell(c, row)}</div>
                ))}
              </div>
            )
          })}
          {view.length === 0 && (
            <div className="ol-gempty" style={{ width: 'min(100%, 560px)' }}>
              <b>No {noun} match</b>
              <span className="ol-sub">{filtering ? 'Try fewer filters.' : 'There is nothing here yet.'}</span>
              {filtering && <button type="button" className="ol-chip" onClick={() => { setFilters({}); setQuery('') }}>Clear filters</button>}
            </div>
          )}
        </div>
      </div>

      <div className="ol-gfoot">
        <span>{view.length === rows.length ? `${rows.length.toLocaleString('en')} ${noun}` : `${view.length.toLocaleString('en')} of ${rows.length.toLocaleString('en')} ${noun}`}</span>
        {columns.filter((c) => c.aggregate).map((c) => {
          const a = aggregate(c, view)
          if (a === null) return null
          const text = c.type === 'duration' ? formatDuration(a) : c.type === 'usd' ? formatUsd(a) : c.type === 'percent' ? `${(a * 100).toFixed(1)}%` : a.toLocaleString('en', { maximumFractionDigits: 1 })
          return <span key={c.id} className="ol-sub">{c.aggregate === 'sum' ? 'Total' : 'Average'} {c.header.toLowerCase()} <b className="ol-mono">{text}</b></span>
        })}
        <span className="ol-spacer" />
        <span className="ol-sub" title="Arrow keys move, space selects, shift extends, ctrl or cmd+A selects all">Keyboard</span>
      </div>
    </section>
  )
}
