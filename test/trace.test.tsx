import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { TraceExplorer } from '../src/components/TraceExplorer.js'
import { JsonTree } from '../src/components/JsonTree.js'
import { buildTree, cleanSpans, coveredMs, criticalPath, flatten, kindShares, selfMs, type Span } from '../src/components/trace.js'

const s = (id: string, startMs: number, durationMs: number, parentId?: string, kind: Span['kind'] = 'tool', status: Span['status'] = 'ok'): Span => ({ id, name: id, kind, startMs, durationMs, status, parentId })

describe('trace maths', () => {
  it('unions overlapping intervals', () => {
    expect(coveredMs([[0, 10], [5, 15], [20, 30]], 0, 100)).toBe(25)
    expect(coveredMs([[-5, 5]], 0, 100)).toBe(5)
    expect(coveredMs([], 0, 100)).toBe(0)
  })

  it('self time ignores overlap between children', () => {
    const tree = buildTree([s('root', 0, 100), s('a', 10, 40, 'root'), s('b', 30, 40, 'root')])
    // children cover 10..70 = 60ms, so 40ms is the root's own
    expect(selfMs(tree[0]!)).toBe(40)
  })

  it('critical path follows the child that finishes last, and the one before it', () => {
    // a ends at 40, b runs 40..90 and finishes last, c runs in parallel with b and ends earlier
    const tree = buildTree([s('root', 0, 100), s('a', 0, 40, 'root'), s('b', 40, 50, 'root'), s('c', 45, 20, 'root')])
    const path = criticalPath(tree)
    expect(path.has('root') && path.has('b') && path.has('a')).toBe(true)
    expect(path.has('c')).toBe(false)
  })

  it('shares of self time add to 100%', () => {
    const tree = buildTree([s('r', 0, 100, undefined, 'llm'), s('t', 20, 50, 'r', 'tool')])
    const shares = kindShares(flatten(tree))
    expect(shares.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1)
    expect(shares.find((x) => x.kind === 'tool')!.selfMs).toBe(50)
  })

  it('cleans bad numbers and duplicate ids, and never drops a span in a cycle', () => {
    const cleaned = cleanSpans([s('a', -5, NaN), s('a', 1, 1), s('b', 0, 1)])
    expect(cleaned.map((x) => x.id)).toEqual(['a', 'b'])
    expect(cleaned[0]).toMatchObject({ startMs: 0, durationMs: 0 })
    const cyc = flatten(buildTree([s('p', 0, 1, 'q'), s('q', 0, 1, 'p'), s('x', 0, 1, 'ghost')]))
    expect(cyc.map((n) => n.span.id).sort()).toEqual(['p', 'q', 'x'])
  })
})

describe('TraceExplorer render', () => {
  const spans = [s('run', 0, 4200, undefined, 'agent'), { ...s('erp', 1550, 1400, 'run', 'tool', 'error'), tokens: { in: 1200, out: 80 }, costUsd: 0.0123, input: { vendor: 'Northwind' } }, s('gate', 3370, 60, 'run', 'gate', 'blocked')]
  it('computes the summary and renders the legend', () => {
    const out = renderToStaticMarkup(<TraceExplorer title="Run" spans={spans} />)
    expect(out).toContain('4.20 s')
    expect(out).toContain('Failed</dt><dd>1')
    expect(out).toContain('Blocked</dt><dd>1')
    expect(out).toContain('1,280')
    expect(out).toContain('$0.01')
    expect(out).toContain('Critical path')
  })
})

describe('JsonTree', () => {
  it('cuts circular references and folds long strings', () => {
    const a: Record<string, unknown> = { name: 'a', long: 'x'.repeat(300) }
    a.self = a
    const out = renderToStaticMarkup(<JsonTree value={a} defaultExpandDepth={2} maxString={50} />)
    expect(out).toContain('[circular]')
    expect(out).toContain('show all 300')
  })
})

import { layoutRows } from '../src/components/trace.js'
describe('flame layout', () => {
  it('puts overlapping siblings on separate rows and leaves room for their children', () => {
    const tree = buildTree([s('root', 0, 100), s('a', 10, 50, 'root'), s('b', 20, 30, 'root'), s('a1', 15, 10, 'a'), s('c', 70, 10, 'root')])
    const { rows, count } = layoutRows(tree)
    expect(rows.get('root')).toBe(0)
    expect(rows.get('a')).toBe(1)
    expect(rows.get('a1')).toBe(2)
    expect(rows.get('b')).toBe(3) // overlaps a, so it goes in the next lane, below a's child
    expect(rows.get('c')).toBe(1) // starts after a ends, so it reuses the first lane
    expect(count).toBe(4)
  })
  it('never gives two overlapping spans the same row', () => {
    const spans = [s('r', 0, 100), s('x', 0, 60, 'r'), s('y', 10, 60, 'r'), s('z', 20, 60, 'r'), s('x1', 5, 10, 'x'), s('y1', 12, 10, 'y')]
    const { rows } = layoutRows(buildTree(spans))
    const list = spans.map((sp) => ({ ...sp, row: rows.get(sp.id)! }))
    for (const a of list) for (const b of list) if (a.id < b.id && a.row === b.row) expect(a.startMs + a.durationMs <= b.startMs || b.startMs + b.durationMs <= a.startMs, `${a.id}/${b.id}`).toBe(true)
  })
})
