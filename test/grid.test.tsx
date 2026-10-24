import { describe, expect, it } from 'vitest'
import { aggregate, filterRows, nextSorts, parseNumberFilter, rangeIds, sortRows, toCsv, windowRange, type Column } from '../src/components/grid.js'

type Row = { name: string; ms: number | null; status: string; n: number }
const rows: Row[] = [
  { name: 'b-run', ms: 300, status: 'ok', n: 2 },
  { name: 'a-run', ms: 100, status: 'error', n: 10 },
  { name: 'c-run', ms: null, status: 'ok', n: 1 },
  { name: 'a-run-2', ms: 100, status: 'ok', n: 3 },
]
const cols: Column<Row>[] = [
  { id: 'name', header: 'Name', value: (r) => r.name },
  { id: 'ms', header: 'Duration', value: (r) => r.ms, type: 'duration', aggregate: 'sum' },
  { id: 'status', header: 'Status', value: (r) => r.status, type: 'status' },
  { id: 'n', header: 'Count', value: (r) => r.n, type: 'number', aggregate: 'avg' },
]

describe('number filters', () => {
  it('parses operators, ranges and plain numbers', () => {
    expect(parseNumberFilter('>5')!(6)).toBe(true)
    expect(parseNumberFilter('>5')!(5)).toBe(false)
    expect(parseNumberFilter('<=5')!(5)).toBe(true)
    expect(parseNumberFilter('2..4')!(3)).toBe(true)
    expect(parseNumberFilter('4..2')!(3)).toBe(true)
    expect(parseNumberFilter('7')!(7)).toBe(true)
    expect(parseNumberFilter('abc')).toBeNull()
    expect(parseNumberFilter('')).toBeNull()
  })
  it('a filter that does not parse matches nothing, so the typo is visible', () => {
    expect(filterRows(rows, cols, { n: 'abc' }, '')).toEqual([])
  })
  it('never matches a blank against a number filter', () => {
    expect(filterRows(rows, cols, { ms: '<1000' }, '').map((r) => r.name)).toEqual(['b-run', 'a-run', 'a-run-2'])
  })
})

describe('filterRows', () => {
  it('combines column filters and the quick search', () => {
    expect(filterRows(rows, cols, { status: 'ok' }, 'a-run').map((r) => r.name)).toEqual(['a-run-2'])
    expect(filterRows(rows, cols, {}, 'ERROR').map((r) => r.name)).toEqual(['a-run'])
  })
})

describe('sortRows', () => {
  it('sorts numerically and keeps blanks last in both directions', () => {
    expect(sortRows(rows, cols, [{ id: 'ms', dir: 'asc' }]).map((r) => r.name)).toEqual(['a-run', 'a-run-2', 'b-run', 'c-run'])
    expect(sortRows(rows, cols, [{ id: 'ms', dir: 'desc' }]).map((r) => r.name)).toEqual(['b-run', 'a-run', 'a-run-2', 'c-run'])
  })
  it('uses later sorts as tie-breakers and is stable', () => {
    const out = sortRows(rows, cols, [{ id: 'ms', dir: 'asc' }, { id: 'n', dir: 'desc' }])
    expect(out.slice(0, 2).map((r) => r.name)).toEqual(['a-run', 'a-run-2'])
  })
  it('sorts text with natural number order', () => {
    const t = [{ name: 'run10' }, { name: 'run2' }, { name: 'run1' }]
    expect(sortRows(t, [{ id: 'name', header: 'n', value: (r) => r.name }], [{ id: 'name', dir: 'asc' }]).map((r) => r.name)).toEqual(['run1', 'run2', 'run10'])
  })
})

describe('nextSorts', () => {
  it('cycles ascending, descending, off', () => {
    let s = nextSorts([], 'ms', false)
    expect(s).toEqual([{ id: 'ms', dir: 'asc' }])
    s = nextSorts(s, 'ms', false)
    expect(s).toEqual([{ id: 'ms', dir: 'desc' }])
    expect(nextSorts(s, 'ms', false)).toEqual([])
  })
  it('shift keeps the other sorts in order', () => {
    const s = nextSorts([{ id: 'ms', dir: 'asc' }], 'n', true)
    expect(s.map((x) => x.id)).toEqual(['ms', 'n'])
    expect(nextSorts(s, 'ms', true)).toEqual([{ id: 'ms', dir: 'desc' }, { id: 'n', dir: 'asc' }])
  })
})

describe('windowing, csv, aggregates', () => {
  it('draws only the visible rows plus overscan', () => {
    expect(windowRange(0, 300, 30, 10_000, 5)).toEqual({ start: 0, end: 15 })
    expect(windowRange(3000, 300, 30, 10_000, 5)).toEqual({ start: 95, end: 115 })
    expect(windowRange(1_000_000, 300, 30, 100, 5)).toEqual({ start: 100, end: 100 })
  })
  it('escapes csv and neutralises formulas', () => {
    const csv = toCsv([{ name: '=SUM(A1)', ms: 5, status: 'a "quoted", cell', n: 1 }], cols)
    expect(csv.split('\n')[1]).toBe("'=SUM(A1),5,\"a \"\"quoted\"\", cell\",1")
  })
  it('aggregates ignore blanks', () => {
    expect(aggregate(cols[1]!, rows)).toBe(500)
    expect(aggregate(cols[3]!, rows)).toBe(4)
    expect(aggregate(cols[0]!, rows)).toBeNull()
  })
  it('selects an inclusive range in either direction', () => {
    expect(rangeIds(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['b', 'c', 'd'])
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { DataGrid } from '../src/index.js'
describe('DataGrid render', () => {
  const many = Array.from({ length: 5000 }, (_, i) => ({ id: `r${i}`, name: `Run ${i}`, ms: i * 10, status: i % 7 === 0 ? 'error' : 'ok' }))
  const c: Column<(typeof many)[number]>[] = [
    { id: 'name', header: 'Name', value: (r) => r.name, pin: true },
    { id: 'ms', header: 'Duration', value: (r) => r.ms, type: 'duration', aggregate: 'sum' },
    { id: 'status', header: 'Status', value: (r) => r.status, type: 'status' },
  ]
  it('draws a window of rows, not all of them', () => {
    const out = renderToStaticMarkup(<DataGrid title="Runs" rows={many} columns={c} rowId={(r) => r.id} height={300} />)
    const drawn = (out.match(/role="row" aria-rowindex/g) ?? []).length
    expect(drawn).toBeGreaterThan(5)
    expect(drawn).toBeLessThan(40)
    expect(out).toContain('5,000 rows')
    expect(out).toContain('aria-rowcount="5001"')
  })
  it('applies initial filters and reports the count and total', () => {
    const out = renderToStaticMarkup(<DataGrid title="Runs" rows={many} columns={c} rowId={(r) => r.id} initialFilters={{ status: 'error' }} initialSelected={['r0', 'r7']} />)
    expect(out).toContain('715 of 5,000 rows')
    expect(out).toContain('<b>2</b> selected')
    expect(out).toContain('Total duration')
  })
  it('says so, with a way out, when nothing matches', () => {
    const out = renderToStaticMarkup(<DataGrid title="Runs" rows={many} columns={c} rowId={(r) => r.id} initialFilters={{ name: 'zzz' }} />)
    expect(out).toContain('No rows match')
    expect(out).toContain('Clear filters')
  })
})
